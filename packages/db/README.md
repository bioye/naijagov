# NaijaGov — Database Package

## Overview

This package owns the entire database schema, seed scripts, and data quality
tooling for NaijaGov. It is the foundation everything else builds on.

## Files

```
packages/db/
├── migrations/
│   ├── 001_geo_schema.sql          ← states, lgas, wards, constituencies,
│   │                                  polling_units, voter_card_resolutions
│   └── 002_users_reps_elections_feed.sql  ← users, auth, reps, elections,
│                                             candidates, posts, feedback
├── seeds/
│   └── seed.py                     ← reads CSV files → generates SQL inserts
└── scripts/
    └── fill_senatorial_gaps.py     ← patches missing SD mappings
```

## Setup

### Prerequisites
- PostgreSQL 15+ with PostGIS and pg_trgm extensions
- Python 3.10+ with pandas (`pip install pandas`)

### Step 1 — Create the database

```bash
createdb naijagov
psql naijagov -c "CREATE EXTENSION postgis; CREATE EXTENSION pg_trgm; CREATE EXTENSION unaccent;"
```

### Step 2 — Run migrations

```bash
psql naijagov -f migrations/001_geo_schema.sql
psql naijagov -f migrations/002_users_reps_elections_feed.sql
```

### Step 3 — Copy seed data files

Place these files in `packages/db/data/`:
```
Project_Nectar_-_Data_-_Wards.csv
Project_Nectar_-_Data_-_Wards_Relationships.csv
Project_Nectar_-_Polling_Units_-_Polling_Units.csv
```

### Step 4 — Generate and run seed SQL

```bash
# Generate seed SQL (inspect before running)
python3 seeds/seed.py --data-dir ./data --output seed_output.sql

# Apply to database
psql naijagov -f seed_output.sql

# Or pipe directly
python3 seeds/seed.py --data-dir ./data --dry-run | psql naijagov
```

### Step 5 — Fill senatorial district gaps

```bash
cd scripts
cp ../data/Project_Nectar_-_Data_-_Wards_Relationships.csv .
python3 fill_senatorial_gaps.py

# Review the output
cat fill_senatorial_gaps.sql       # 22 auto-filled rows
cat senatorial_gaps_report.csv     # 4,496 rows needing manual research

# Apply auto-fills
psql naijagov -f fill_senatorial_gaps.sql
```

### Step 6 — Verify

```sql
SELECT table_name, rows FROM (
  SELECT 'states'           AS table_name, COUNT(*) AS rows FROM states     UNION ALL
  SELECT 'lgas',                           COUNT(*)          FROM lgas       UNION ALL
  SELECT 'wards',                          COUNT(*)          FROM wards      UNION ALL
  SELECT 'federal_const',                  COUNT(*)          FROM federal_constituencies UNION ALL
  SELECT 'state_const',                    COUNT(*)          FROM state_constituencies  UNION ALL
  SELECT 'senatorial_dists',               COUNT(*)          FROM senatorial_districts  UNION ALL
  SELECT 'polling_units',                  COUNT(*)          FROM polling_units
) t ORDER BY table_name;
```

Expected results:
| table_name | rows |
|---|---|
| federal_const | ~364 |
| lgas | 774 |
| polling_units | 118,302 |
| senatorial_dists | ~59 (partial — see gaps below) |
| state_const | ~876 |
| states | 37 |
| wards | 8,798 |

---

## Data Quality — Known Gaps

### Senatorial Districts (most critical gap)

The source data has SD mappings for only **19 of 37 states**. The remaining
18 states have **zero** SD data:

| States with 0% SD coverage |
|---|
| EKITI, FCT, NIGER, OGUN, PLATEAU, OYO, OSUN, ONDO, LAGOS |
| NASSARAWA, KOGI, KWARA, KATSINA, KEBBI, SOKOTO, RIVERS, YOBE, TARABA, ZAMFARA |

**Action required:** Manually source senatorial district → LGA mappings for
these 19 states from INEC's official delimitation documents.

The fix is simple once you have the data: each LGA belongs to exactly one
senatorial district. Update the `wards` table:

```sql
UPDATE wards SET
  senatorial_district_id = (SELECT id FROM senatorial_districts WHERE name = 'LAGOS EAST'),
  sd_mapping_missing = false
WHERE lga_id IN (
  SELECT id FROM lgas WHERE name IN ('IBEJU-LEKKI', 'EREDO', 'IKORODU')
);
```

### State Constituencies (~10.6% missing)

933 wards are missing state constituency mappings. These are scattered across
states. Run this query to see them:

```sql
SELECT s.name AS state, l.name AS lga, w.name AS ward
FROM wards w
JOIN lgas l ON l.id = w.lga_id
JOIN states s ON s.id = w.state_id
WHERE w.sc_mapping_missing = true
ORDER BY s.name, l.name;
```

### Federal Constituencies (~2.5% missing)

221 wards missing. Lowest priority — most are border wards where INEC
delimitation is contested.

### Polling Units with GPS

118,302 of ~176,000 total polling units have GPS coordinates. The remaining
~58,000 are in the dataset but without lat/lng. GPS coverage is sufficient
for the map feature at launch.

### Councillors

All 8,798 ward councillor slots are empty — this is expected. Councillor data
will be community-contributed over time.

---

## Voter Card Resolution

The PVC CODE field resolves as: `SS-LL-WW-PPP`

| Segment | Description | Example |
|---|---|---|
| SS | INEC state numeric (01–36 alphabetical, 37=FCT) | 27 = OGUN |
| LL | LGA numeric within state | 02 = ABEOKUTA SOUTH |
| WW | Ward numeric within LGA | 10 = SODEKE/ISALE IJEUN I |
| PPP | Polling unit numeric within ward | 001 |

**Verified against real PVC:** CODE `27-02-10-001` → OGUN / ABEOKUTA SOUTH /
SODEKE-ISALE IJEUN I / Abeokuta South (Federal) / Abeokuta South II (State).

The compound_code format used in the database is `state_alpha + lga(02d) + ward(02d)`:
`OG0210` = OGUN, LGA 2, Ward 10.

The PU_LOC_ID format is `compound_code + pu(03d)`:
`OG0210001` = above ward, polling unit 1.
GPS for this unit: 7.16040, 3.34231 (verified in data).
