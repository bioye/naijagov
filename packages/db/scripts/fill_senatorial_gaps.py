#!/usr/bin/env python3
"""
NaijaGov — Senatorial District Gap Fill
packages/db/scripts/fill_senatorial_gaps.py

Problem: ~51% of wards are missing senatorial district mappings in the
source data. But senatorial districts map 1:1 to LGAs — every LGA belongs
to exactly one senatorial district.

Strategy:
  1. For each LGA, find wards that DO have a senatorial district mapped.
  2. Use that mapping to fill all other wards in the same LGA.
  3. For LGAs with zero wards mapped, flag for manual research.

Outputs:
  - fill_senatorial_gaps.sql   → apply to database
  - senatorial_gaps_report.csv → LGAs still needing manual research
"""

import pandas as pd
import sys

RELS_FILE = 'Project_Nectar_-_Data_-_Wards_Relationships.csv'

def esc(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 'NULL'
    return f"'{str(val).replace(chr(39), chr(39)*2)}'"

def main():
    rels = pd.read_csv(RELS_FILE)

    print(f"Total ward rows:              {len(rels)}", file=sys.stderr)
    has_sd = rels['Senatorial District'].notna()
    print(f"Wards with SD mapped:         {has_sd.sum()} ({has_sd.mean()*100:.1f}%)", file=sys.stderr)
    print(f"Wards missing SD:             {(~has_sd).sum()}", file=sys.stderr)

    # Build LGA → senatorial district mapping from wards that are already filled
    lga_sd_map = (
        rels[has_sd]
        .groupby(['STATE', 'LGA NAME'])[['Senatorial District', 'Unnamed: 10']]
        .first()
        .reset_index()
        .rename(columns={'Senatorial District': 'sd_name', 'Unnamed: 10': 'sd_code'})
    )

    print(f"LGAs with at least one SD:    {len(lga_sd_map)}", file=sys.stderr)

    # Find wards that need filling
    missing = rels[~has_sd][['STATE', 'LGA NAME', 'WARD CODE', 'WARD NAME']].copy()

    # Join with LGA SD map
    filled = missing.merge(lga_sd_map, on=['STATE', 'LGA NAME'], how='left')
    can_fill    = filled[filled['sd_name'].notna()]
    still_empty = filled[filled['sd_name'].isna()]

    print(f"Can fill via LGA propagation: {len(can_fill)}", file=sys.stderr)
    print(f"Still empty (need research):  {len(still_empty)}", file=sys.stderr)

    # ── Generate SQL ──────────────────────────────────────────────
    sql_lines = [
        '-- NaijaGov — Senatorial District Gap Fill',
        '-- Auto-generated. Propagates SD from LGA-level mapping.',
        'BEGIN;',
        '',
    ]

    # Group by (state, lga, sd_code) for efficient batch updates
    groups = can_fill.groupby(['STATE', 'LGA NAME', 'sd_code'])
    update_count = 0
    for (state, lga, sd_code), group in groups:
        ward_codes = sorted(group['WARD CODE'].astype(int).tolist())
        ward_list  = ', '.join(str(w) for w in ward_codes)
        sql_lines.append(
            f'UPDATE wards SET senatorial_district_id = ('
            f'  SELECT sd.id FROM senatorial_districts sd'
            f'  JOIN states s ON s.id = sd.state_id'
            f'  WHERE s.name = {esc(state)}'
            f'  AND sd.inec_code = {esc(sd_code)}'
            f'  LIMIT 1'
            f'),'
            f' sd_mapping_missing = false'
            f' WHERE sd_mapping_missing = true'
            f'   AND state_id = (SELECT id FROM states WHERE name = {esc(state)})'
            f'   AND lga_id   = (SELECT l.id FROM lgas l JOIN states s ON s.id = l.state_id'
            f'                   WHERE s.name = {esc(state)} AND l.name = {esc(lga)})'
            f'   AND inec_code IN ({ward_list});'
        )
        update_count += len(ward_codes)

    sql_lines += [
        '',
        f'-- {update_count} ward SD mappings filled',
        '',
        '-- Log remaining gaps to geo_data_quality',
    ]

    if len(still_empty) > 0:
        for _, row in still_empty.iterrows():
            sql_lines.append(
                f"INSERT INTO geo_data_quality (table_name, record_id, field_name, issue_type, notes)"
                f" SELECT 'wards', w.id, 'senatorial_district_id', 'missing',"
                f" 'LGA has no senatorial district in source data — needs manual research'"
                f" FROM wards w"
                f" JOIN lgas l ON l.id = w.lga_id"
                f" JOIN states s ON s.id = l.state_id"
                f" WHERE s.name = {esc(row['STATE'])}"
                f" AND l.name   = {esc(row['LGA NAME'])}"
                f" AND w.inec_code = {int(row['WARD CODE'])}"
                f" ON CONFLICT DO NOTHING;"
            )

    sql_lines += ['', 'COMMIT;', '']

    sql = '\n'.join(sql_lines)
    with open('fill_senatorial_gaps.sql', 'w') as f:
        f.write(sql)
    print('✓ fill_senatorial_gaps.sql written', file=sys.stderr)

    # ── Write remaining gaps report ───────────────────────────────
    if len(still_empty) > 0:
        still_empty.to_csv('senatorial_gaps_report.csv', index=False)
        print(f'✓ senatorial_gaps_report.csv written ({len(still_empty)} rows)', file=sys.stderr)
        print('\nTop LGAs needing manual senatorial district research:', file=sys.stderr)
        top = still_empty.groupby(['STATE','LGA NAME']).size().reset_index(name='missing_wards')
        top = top.sort_values('missing_wards', ascending=False).head(20)
        print(top.to_string(index=False), file=sys.stderr)
    else:
        print('✓ All gaps filled — no manual research needed!', file=sys.stderr)

if __name__ == '__main__':
    main()
