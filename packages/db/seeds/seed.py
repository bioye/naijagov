#!/usr/bin/env python3
"""
NaijaGov — Seed Script
Reads Project Nectar CSV files and seeds the database.

Usage:
  python3 seed.py --dry-run          # print SQL to stdout
  python3 seed.py --db DATABASE_URL  # seed directly to postgres

Source files expected at DATA_DIR (override with --data-dir):
  Project_Nectar_-_Data_-_Wards.csv
  Project_Nectar_-_Data_-_Wards_Relationships.csv
  Project_Nectar_-_Polling_Units_-_Polling_Units.csv
"""

import argparse
import csv
import re
import sys
import os
import pandas as pd
from io import StringIO

# ── Config ────────────────────────────────────────────────────
DATA_DIR = os.environ.get('DATA_DIR', './data')

WARDS_FILE      = 'Project_Nectar_-_Data_-_Wards.csv'
RELS_FILE       = 'Project_Nectar_-_Data_-_Wards_Relationships.csv'
PU_FILE         = 'Project_Nectar_-_Polling_Units_-_Polling_Units.csv'

# INEC official state codes (numeric 01-36 alphabetical, 37=FCT)
INEC_STATES = [
    (1,'ABIA','AB','South East'),
    (2,'ADAMAWA','AD','North East'),
    (3,'AKWA IBOM','AK','South South'),
    (4,'ANAMBRA','AN','South East'),
    (5,'BAUCHI','BA','North East'),
    (6,'BAYELSA','BY','South South'),
    (7,'BENUE','BN','North Central'),
    (8,'BORNO','BO','North East'),
    (9,'CROSS RIVER','CR','South South'),
    (10,'DELTA','DT','South South'),
    (11,'EBONYI','EB','South East'),
    (12,'EDO','ED','South South'),
    (13,'EKITI','EK','South West'),
    (14,'ENUGU','EN','South East'),
    (15,'GOMBE','GM','North East'),
    (16,'IMO','IM','South East'),
    (17,'JIGAWA','JG','North West'),
    (18,'KADUNA','KD','North West'),
    (19,'KANO','KN','North West'),
    (20,'KATSINA','KT','North West'),
    (21,'KEBBI','KB','North West'),
    (22,'KOGI','KG','North Central'),
    (23,'KWARA','KW','North Central'),
    (24,'LAGOS','LA','South West'),
    (25,'NASSARAWA','NW','North Central'),
    (26,'NIGER','NG','North Central'),
    (27,'OGUN','OG','South West'),
    (28,'ONDO','OD','South West'),
    (29,'OSUN','OS','South West'),
    (30,'OYO','OY','South West'),
    (31,'PLATEAU','PL','North Central'),
    (32,'RIVERS','RV','South South'),
    (33,'SOKOTO','SO','North West'),
    (34,'TARABA','TR','North East'),
    (35,'YOBE','YB','North East'),
    (36,'ZAMFARA','ZF','North West'),
    (37,'FCT','FC','North Central'),
]

# ── Helpers ───────────────────────────────────────────────────
def slugify(text: str) -> str:
    if not text or not isinstance(text, str):
        return ''
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", '', text)
    text = re.sub(r"[\s_/]+", '-', text)
    text = re.sub(r'-+', '-', text)
    return text.strip('-')

def esc(val) -> str:
    """Escape a value for SQL insertion."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 'NULL'
    val = str(val).replace("'", "''")
    return f"'{val}'"

def safe_int(val):
    try:
        return int(val)
    except (TypeError, ValueError):
        return None

# ── Main ──────────────────────────────────────────────────────
def generate_sql(data_dir: str) -> str:
    buf = StringIO()

    def w(line=''):
        buf.write(line + '\n')

    wards_df = pd.read_csv(os.path.join(data_dir, WARDS_FILE))
    rels_df  = pd.read_csv(os.path.join(data_dir, RELS_FILE))
    pu_df    = pd.read_csv(os.path.join(data_dir, PU_FILE), low_memory=False)

    w('-- =============================================================')
    w('-- NaijaGov Seed Data — auto-generated from Project Nectar CSVs')
    w('-- DO NOT EDIT MANUALLY — regenerate with: python3 seed.py')
    w('-- =============================================================')
    w('BEGIN;')
    w()

    # ── STATES ──────────────────────────────────────────────────
    w('-- ─── States (37) ────────────────────────────────────────')
    w('INSERT INTO states (inec_code, alpha_code, name, slug, geopolitical_zone) VALUES')
    rows = []
    state_id_map = {}  # name → inec_code (used as surrogate key in script)
    for inec_code, name, alpha, zone in INEC_STATES:
        slug = slugify(name)
        state_id_map[name] = inec_code
        rows.append(
            f"  ({inec_code}, '{alpha}', {esc(name)}, {esc(slug)}, {esc(zone)})"
        )
    w(',\n'.join(rows) + ';')
    w()

    # ── PARTIES (seed common parties) ───────────────────────────
    w('-- ─── Parties (seed) ─────────────────────────────────────')
    parties = [
        ('All Progressives Congress',        'APC', 'apc',        '#2B5F9E'),
        ("People's Democratic Party",        'PDP', 'pdp',        '#008751'),
        ('Labour Party',                     'LP',  'lp',         '#CC0000'),
        ('All Progressives Grand Alliance',  'APGA','apga',       '#32CD32'),
        ('New Nigeria Peoples Party',        'NNPP','nnpp',       '#FFA500'),
        ('Social Democratic Party',          'SDP', 'sdp',        '#800080'),
        ('Action Democratic Party',          'ADP', 'adp',        '#FFD700'),
        ('Young Progressives Party',         'YPP', 'ypp',        '#00CED1'),
        ('Independent',                      'IND', 'independent','#888888'),
    ]
    w('INSERT INTO parties (name, abbreviation, slug, color_hex, active) VALUES')
    p_rows = []
    for name, abbr, slug, color in parties:
        p_rows.append(f"  ({esc(name)}, {esc(abbr)}, {esc(slug)}, {esc(color)}, true)")
    w(',\n'.join(p_rows) + ';')
    w()

    # ── LGAS ────────────────────────────────────────────────────
    w('-- ─── LGAs (774) ─────────────────────────────────────────')
    w('INSERT INTO lgas (state_id, inec_code, name, slug)')
    w('SELECT s.id, lga.inec_code, lga.name, lga.slug FROM (VALUES')

    lga_rows = []
    lga_key_map = {}  # (state_name, lga_code) → slug for later reference
    seen_lgas = set()

    lgas_grouped = (
        wards_df[wards_df['LGA CODE'].notna()]
        .groupby(['STATE', 'LGA NAME', 'LGA CODE'])
        .size()
        .reset_index()[['STATE','LGA NAME','LGA CODE']]
        .drop_duplicates()
        .sort_values(['STATE','LGA CODE'])
    )

    for _, row in lgas_grouped.iterrows():
        state_name = str(row['STATE']).strip()
        lga_name   = str(row['LGA NAME']).strip()
        lga_code   = safe_int(row['LGA CODE'])
        if lga_code is None:
            continue
        key = (state_name, lga_code)
        if key in seen_lgas:
            continue
        seen_lgas.add(key)
        slug = slugify(lga_name)
        state_inec = state_id_map.get(state_name)
        if not state_inec:
            continue
        lga_key_map[key] = slug
        lga_rows.append(
            f"  ({state_inec}, {lga_code}, {esc(lga_name)}, {esc(slug)})"
        )

    w(',\n'.join(lga_rows))
    w(') AS lga(state_inec_code, inec_code, name, slug)')
    w('JOIN states s ON s.inec_code = lga.state_inec_code;')
    w()

    # ── SENATORIAL DISTRICTS ─────────────────────────────────────
    w('-- ─── Senatorial Districts ────────────────────────────────')
    w('INSERT INTO senatorial_districts (state_id, inec_code, name, slug)')
    w('SELECT s.id, sd.inec_code, sd.name, sd.slug FROM (VALUES')

    sd_rows = []
    seen_sds = set()
    sd_df = rels_df[rels_df['Senatorial District'].notna()][
        ['STATE','Senatorial District','Unnamed: 10']
    ].drop_duplicates()

    for _, row in sd_df.iterrows():
        state_name = str(row['STATE']).strip()
        sd_name    = str(row['Senatorial District']).strip()
        sd_code    = str(row['Unnamed: 10']).strip() if pd.notna(row['Unnamed: 10']) else ''
        key = (state_name, sd_name)
        if key in seen_sds:
            continue
        seen_sds.add(key)
        state_inec = state_id_map.get(state_name)
        if not state_inec:
            continue
        slug = slugify(sd_name)
        sd_rows.append(f"  ({state_inec}, {esc(sd_code)}, {esc(sd_name)}, {esc(slug)})")

    w(',\n'.join(sd_rows))
    w(') AS sd(state_inec_code, inec_code, name, slug)')
    w('JOIN states s ON s.inec_code = sd.state_inec_code;')
    w()

    # ── FEDERAL CONSTITUENCIES ───────────────────────────────────
    w('-- ─── Federal Constituencies ─────────────────────────────')
    w('INSERT INTO federal_constituencies (state_id, inec_code, name, slug)')
    w('SELECT s.id, fc.inec_code, fc.name, fc.slug FROM (VALUES')

    fc_rows = []
    seen_fcs = set()
    fc_df = rels_df[rels_df['Federal Constituency'].notna()][
        ['STATE','Federal Constituency','Unnamed: 8']
    ].drop_duplicates()

    for _, row in fc_df.iterrows():
        state_name = str(row['STATE']).strip()
        fc_name    = str(row['Federal Constituency']).strip()
        fc_code    = str(row['Unnamed: 8']).strip() if pd.notna(row['Unnamed: 8']) else ''
        key = (state_name, fc_name)
        if key in seen_fcs:
            continue
        seen_fcs.add(key)
        state_inec = state_id_map.get(state_name)
        if not state_inec:
            continue
        slug = slugify(fc_name)
        fc_rows.append(f"  ({state_inec}, {esc(fc_code)}, {esc(fc_name)}, {esc(slug)})")

    w(',\n'.join(fc_rows))
    w(') AS fc(state_inec_code, inec_code, name, slug)')
    w('JOIN states s ON s.inec_code = fc.state_inec_code;')
    w()

    # ── STATE CONSTITUENCIES ─────────────────────────────────────
    w('-- ─── State Constituencies ────────────────────────────────')
    w('INSERT INTO state_constituencies (state_id, inec_code, name, slug)')
    w('SELECT s.id, sc.inec_code, sc.name, sc.slug FROM (VALUES')

    sc_rows = []
    seen_scs = set()
    sc_df = rels_df[rels_df['State Constituency'].notna()][
        ['STATE','State Constituency','Unnamed: 6']
    ].drop_duplicates()

    for _, row in sc_df.iterrows():
        state_name = str(row['STATE']).strip()
        sc_name    = str(row['State Constituency']).strip()
        sc_code    = str(row['Unnamed: 6']).strip() if pd.notna(row['Unnamed: 6']) else ''
        key = (state_name, sc_name)
        if key in seen_scs:
            continue
        seen_scs.add(key)
        state_inec = state_id_map.get(state_name)
        if not state_inec:
            continue
        slug = slugify(sc_name)
        sc_rows.append(f"  ({state_inec}, {esc(sc_code)}, {esc(sc_name)}, {esc(slug)})")

    w(',\n'.join(sc_rows))
    w(') AS sc(state_inec_code, inec_code, name, slug)')
    w('JOIN states s ON s.inec_code = sc.state_inec_code;')
    w()

    # ── WARDS ───────────────────────────────────────────────────
    w('-- ─── Wards (~8,798) ─────────────────────────────────────')
    w('-- Includes constituency mappings and data-quality gap flags')
    w()

    # Build rels lookup: (state, ward_code, lga_code) → constituencies
    rels_lookup = {}
    for _, row in rels_df.iterrows():
        state = str(row['STATE']).strip() if pd.notna(row['STATE']) else None
        lga   = str(row['LGA NAME']).strip() if pd.notna(row['LGA NAME']) else None
        wc    = safe_int(row['WARD CODE'])
        if not all([state, lga, wc]):
            continue
        key = (state, lga, wc)
        rels_lookup[key] = {
            'sc':     str(row['State Constituency']).strip()  if pd.notna(row['State Constituency'])  else None,
            'sc_code':str(row['Unnamed: 6']).strip()          if pd.notna(row['Unnamed: 6'])           else None,
            'fc':     str(row['Federal Constituency']).strip() if pd.notna(row['Federal Constituency']) else None,
            'fc_code':str(row['Unnamed: 8']).strip()          if pd.notna(row['Unnamed: 8'])           else None,
            'sd':     str(row['Senatorial District']).strip() if pd.notna(row['Senatorial District'])  else None,
            'sd_code':str(row['Unnamed: 10']).strip()         if pd.notna(row['Unnamed: 10'])          else None,
        }

    # Write ward inserts in batches of 500
    ward_records = []
    sc_missing = fc_missing = sd_missing = 0

    valid_wards = wards_df[
        wards_df['WARD CODE'].notna() &
        wards_df['LGA CODE'].notna() &
        wards_df['STATE'].notna()
    ].copy()

    for _, row in valid_wards.iterrows():
        state_name   = str(row['STATE']).strip()
        lga_name     = str(row['LGA NAME']).strip()
        ward_name    = str(row['WARD NAME']).strip()
        lga_code     = safe_int(row['LGA CODE'])
        ward_code    = safe_int(row['WARD CODE'])
        compound     = str(row['Unnamed: 9']).strip() if pd.notna(row['Unnamed: 9']) else None
        state_inec   = state_id_map.get(state_name)

        if not all([state_inec, lga_code, ward_code, compound]):
            continue

        slug = slugify(ward_name)
        rels_key = (state_name, lga_name, ward_code)
        rel = rels_lookup.get(rels_key, {})

        sc_val   = rel.get('sc')
        sc_code  = rel.get('sc_code')
        fc_val   = rel.get('fc')
        fc_code  = rel.get('fc_code')
        sd_val   = rel.get('sd')
        sd_code  = rel.get('sd_code')

        sc_missing_flag = 'true' if not sc_val else 'false'
        fc_missing_flag = 'true' if not fc_val else 'false'
        sd_missing_flag = 'true' if not sd_val else 'false'

        if not sc_val: sc_missing += 1
        if not fc_val: fc_missing += 1
        if not sd_val: sd_missing += 1

        ward_records.append({
            'state_inec': state_inec,
            'lga_code':   lga_code,
            'ward_code':  ward_code,
            'compound':   compound,
            'name':       ward_name,
            'slug':       slug,
            'sc_name':    sc_val,
            'sc_code':    sc_code,
            'fc_name':    fc_val,
            'fc_code':    fc_code,
            'sd_name':    sd_val,
            'sd_code':    sd_code,
            'sc_miss':    sc_missing_flag,
            'fc_miss':    fc_missing_flag,
            'sd_miss':    sd_missing_flag,
        })

    w(f'-- Ward data quality: SC missing={sc_missing}, FC missing={fc_missing}, SD missing={sd_missing}')
    w()

    # Insert wards in batches
    BATCH = 500
    for i in range(0, len(ward_records), BATCH):
        batch = ward_records[i:i+BATCH]
        w('INSERT INTO wards (')
        w('  state_id, lga_id, inec_code, compound_code, name, slug,')
        w('  state_constituency_id, federal_constituency_id, senatorial_district_id,')
        w('  sc_mapping_missing, fc_mapping_missing, sd_mapping_missing')
        w(')')
        w('SELECT')
        w('  s.id AS state_id,')
        w('  l.id AS lga_id,')
        w('  w.ward_code,')
        w('  w.compound_code,')
        w('  w.name,')
        w('  w.slug,')
        w('  sc.id AS state_constituency_id,')
        w('  fc.id AS federal_constituency_id,')
        w('  sd.id AS senatorial_district_id,')
        w('  w.sc_missing,')
        w('  w.fc_missing,')
        w('  w.sd_missing')
        w('FROM (VALUES')

        v_rows = []
        for r in batch:
            v_rows.append(
                f"  ({r['state_inec']}, {r['lga_code']}, {r['ward_code']}, "
                f"{esc(r['compound'])}, {esc(r['name'])}, {esc(r['slug'])}, "
                f"{esc(r['sc_name'])}, {esc(r['sc_code'])}, "
                f"{esc(r['fc_name'])}, {esc(r['fc_code'])}, "
                f"{esc(r['sd_name'])}, {esc(r['sd_code'])}, "
                f"{r['sc_miss']}, {r['fc_miss']}, {r['sd_miss']})"
            )
        w(',\n'.join(v_rows))
        w(') AS w(state_inec, lga_inec, ward_code, compound_code, name, slug,')
        w('       sc_name, sc_code, fc_name, fc_code, sd_name, sd_code,')
        w('       sc_missing, fc_missing, sd_missing)')
        w('JOIN states s ON s.inec_code = w.state_inec')
        w('JOIN lgas   l ON l.state_id = s.id AND l.inec_code = w.lga_inec')
        w('LEFT JOIN state_constituencies   sc ON sc.state_id = s.id AND sc.inec_code = w.sc_code')
        w('LEFT JOIN federal_constituencies fc ON fc.state_id = s.id AND fc.inec_code = w.fc_code')
        w('LEFT JOIN senatorial_districts   sd ON sd.state_id = s.id AND sd.inec_code = w.sd_code')
        w('ON CONFLICT (lga_id, inec_code) DO NOTHING;')
        w()

    # ── POLLING UNITS ────────────────────────────────────────────
    w('-- ─── Polling Units (~118,302 with GPS) ──────────────────')
    w()

    # Insert polling units in batches of 1000
    PU_BATCH = 1000
    pu_records = []

    for _, row in pu_df.iterrows():
        pu_loc_id = str(row['PU_LOC_ID']).strip() if pd.notna(row['PU_LOC_ID']) else None
        if not pu_loc_id or len(pu_loc_id) < 9:
            continue

        # Decode PU_LOC_ID: AB0101001
        state_alpha = pu_loc_id[:2]
        try:
            lga_code  = int(pu_loc_id[2:4])
            ward_code = int(pu_loc_id[4:6])
            pu_code   = int(pu_loc_id[6:9])
        except ValueError:
            continue

        lat  = row.get('LAT')
        lng  = row.get('LONG')
        desc = str(row.get('PU_LOC_DESC','')).strip() if pd.notna(row.get('PU_LOC_DESC')) else None
        btype = safe_int(row.get('BUILDING_TYPE_ID'))
        has_gps = pd.notna(lat) and pd.notna(lng)

        pu_records.append({
            'pu_loc_id':   pu_loc_id,
            'state_alpha': state_alpha,
            'lga_code':    lga_code,
            'ward_code':   ward_code,
            'pu_code':     pu_code,
            'lat':         float(lat) if has_gps else None,
            'lng':         float(lng) if has_gps else None,
            'has_gps':     has_gps,
            'desc':        desc,
            'btype':       btype,
        })

    for i in range(0, len(pu_records), PU_BATCH):
        batch = pu_records[i:i+PU_BATCH]
        w('INSERT INTO polling_units (')
        w('  ward_id, lga_id, state_id, pu_loc_id, inec_pu_code,')
        w('  description, building_type_id, has_gps, lat, lng, geom')
        w(')')
        w('SELECT')
        w('  wr.id   AS ward_id,')
        w('  l.id    AS lga_id,')
        w('  s.id    AS state_id,')
        w('  p.pu_loc_id,')
        w('  p.pu_code,')
        w('  p.description,')
        w('  p.building_type_id,')
        w('  p.has_gps,')
        w('  p.lat,')
        w('  p.lng,')
        w('  CASE WHEN p.has_gps THEN ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326) ELSE NULL END')
        w('FROM (VALUES')

        p_rows = []
        for r in batch:
            lat_s  = str(r['lat'])  if r['lat']  is not None else 'NULL'
            lng_s  = str(r['lng'])  if r['lng']  is not None else 'NULL'
            btype  = str(r['btype']) if r['btype'] is not None else 'NULL'
            p_rows.append(
                f"  ({esc(r['pu_loc_id'])}, {esc(r['state_alpha'])}, "
                f"{r['lga_code']}, {r['ward_code']}, {r['pu_code']}, "
                f"{esc(r['desc'])}, {btype}, "
                f"{'true' if r['has_gps'] else 'false'}, "
                f"{lat_s}::double precision, {lng_s}::double precision)"
            )
        w(',\n'.join(p_rows))
        w(') AS p(pu_loc_id, state_alpha, lga_code, ward_code, pu_code,')
        w('       description, building_type_id, has_gps, lat, lng)')
        w('JOIN states s ON s.alpha_code = p.state_alpha')
        w('JOIN lgas   l ON l.state_id = s.id AND l.inec_code = p.lga_code')
        w('JOIN wards  wr ON wr.lga_id = l.id AND wr.inec_code = p.ward_code')
        w('ON CONFLICT (pu_loc_id) DO NOTHING;')
        w()

    # ── ELECTION CYCLES ──────────────────────────────────────────
    w('-- ─── Election Cycles (1999–2027) ────────────────────────')
    w("INSERT INTO election_cycles (year, election_date, status, notes) VALUES")
    cycles = [
        (1999, '1999-02-27', 'declared', 'Return to democracy — Fourth Republic'),
        (2003, '2003-04-19', 'declared', NULL_str := None),
        (2007, '2007-04-21', 'declared', None),
        (2011, '2011-04-16', 'declared', None),
        (2015, '2015-03-28', 'declared', 'First democratic transfer of power'),
        (2019, '2019-02-23', 'declared', None),
        (2023, '2023-02-25', 'declared', None),
        (2027, '2027-02-27', 'upcoming', '2027 General Election — current cycle'),
    ]
    c_rows = []
    for year, date, status, notes in cycles:
        c_rows.append(f"  ({year}, '{date}', '{status}', {esc(notes)})")
    w(',\n'.join(c_rows) + ';')
    w()

    w('COMMIT;')
    w()
    w('-- ─── Post-seed quality report ────────────────────────────')
    w('SELECT')
    w("  'states'             AS table_name, COUNT(*) AS rows FROM states UNION ALL")
    w("  SELECT 'lgas',              COUNT(*) FROM lgas UNION ALL")
    w("  SELECT 'wards',             COUNT(*) FROM wards UNION ALL")
    w("  SELECT 'senatorial_dists',  COUNT(*) FROM senatorial_districts UNION ALL")
    w("  SELECT 'federal_const',     COUNT(*) FROM federal_constituencies UNION ALL")
    w("  SELECT 'state_const',       COUNT(*) FROM state_constituencies UNION ALL")
    w("  SELECT 'polling_units',     COUNT(*) FROM polling_units UNION ALL")
    w("  SELECT 'wards_sc_gap',      COUNT(*) FROM wards WHERE sc_mapping_missing UNION ALL")
    w("  SELECT 'wards_fc_gap',      COUNT(*) FROM wards WHERE fc_mapping_missing UNION ALL")
    w("  SELECT 'wards_sd_gap',      COUNT(*) FROM wards WHERE sd_mapping_missing UNION ALL")
    w("  SELECT 'election_cycles',   COUNT(*) FROM election_cycles")
    w('ORDER BY table_name;')

    return buf.getvalue()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='NaijaGov database seeder')
    parser.add_argument('--data-dir', default='./data', help='Directory containing CSV files')
    parser.add_argument('--dry-run',  action='store_true', help='Print SQL to stdout')
    parser.add_argument('--output',   default='seed_output.sql', help='Output SQL file')
    parser.add_argument('--db',       help='PostgreSQL connection string (psycopg2 format)')
    args = parser.parse_args()

    print(f'Reading CSV files from: {args.data_dir}', file=sys.stderr)
    sql = generate_sql(args.data_dir)

    if args.dry_run:
        print(sql)
    else:
        out_path = args.output
        with open(out_path, 'w') as f:
            f.write(sql)
        print(f'✓ SQL written to {out_path} ({len(sql):,} bytes)', file=sys.stderr)

        if args.db:
            try:
                import psycopg2
                conn = psycopg2.connect(args.db)
                cur = conn.cursor()
                cur.execute(sql)
                conn.commit()
                print('✓ Database seeded successfully', file=sys.stderr)
            except Exception as e:
                print(f'✗ Database error: {e}', file=sys.stderr)
                sys.exit(1)
            finally:
                if 'conn' in locals():
                    conn.close()
