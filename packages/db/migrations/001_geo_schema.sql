-- =============================================================
-- NaijaGov — Migration 001: Geographic & Constituency Schema
-- =============================================================
-- Covers: states, lgas, wards, constituencies, polling_units
-- Source data: Project Nectar datasets (INEC)
-- =============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fuzzy text search on names
CREATE EXTENSION IF NOT EXISTS "unaccent";  -- accent-insensitive search (Yoruba etc)
CREATE EXTENSION IF NOT EXISTS "postgis";   -- geospatial queries on polling unit coords

-- =============================================================
-- STATES
-- =============================================================
CREATE TABLE states (
  id            SERIAL PRIMARY KEY,
  inec_code     SMALLINT     NOT NULL UNIQUE,  -- 01–37 (INEC numeric, FCT=37)
  alpha_code    CHAR(2)      NOT NULL UNIQUE,  -- AB, AD, OG ...
  name          TEXT         NOT NULL UNIQUE,  -- OGUN, LAGOS ...
  slug          TEXT         NOT NULL UNIQUE,  -- ogun, lagos ...
  geopolitical_zone TEXT,                      -- SW, SE, NC, NE, NW, SS
  capital       TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_states_inec_code  ON states(inec_code);
CREATE INDEX idx_states_alpha_code ON states(alpha_code);
CREATE INDEX idx_states_slug       ON states(slug);

-- =============================================================
-- LOCAL GOVERNMENT AREAS
-- =============================================================
CREATE TABLE lgas (
  id            SERIAL PRIMARY KEY,
  state_id      INT          NOT NULL REFERENCES states(id),
  inec_code     SMALLINT     NOT NULL,         -- LGA numeric within state (1–N)
  name          TEXT         NOT NULL,
  slug          TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (state_id, inec_code),
  UNIQUE (state_id, slug)
);

CREATE INDEX idx_lgas_state_id   ON lgas(state_id);
CREATE INDEX idx_lgas_name_trgm  ON lgas USING gin(name gin_trgm_ops);

-- =============================================================
-- SENATORIAL DISTRICTS  (109 total)
-- =============================================================
CREATE TABLE senatorial_districts (
  id            SERIAL PRIMARY KEY,
  state_id      INT          NOT NULL REFERENCES states(id),
  inec_code     TEXT,                           -- SD/003/AB format from INEC
  name          TEXT         NOT NULL,
  slug          TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (state_id, slug)
);

CREATE INDEX idx_sd_state_id ON senatorial_districts(state_id);

-- =============================================================
-- FEDERAL CONSTITUENCIES  (360 total)
-- =============================================================
CREATE TABLE federal_constituencies (
  id                   SERIAL PRIMARY KEY,
  state_id             INT   NOT NULL REFERENCES states(id),
  senatorial_district_id INT REFERENCES senatorial_districts(id),
  inec_code            TEXT,                    -- FC/001/AB format
  name                 TEXT  NOT NULL,
  slug                 TEXT  NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (state_id, slug)
);

CREATE INDEX idx_fc_state_id ON federal_constituencies(state_id);
CREATE INDEX idx_fc_sd_id    ON federal_constituencies(senatorial_district_id);

-- =============================================================
-- STATE CONSTITUENCIES  (993 total)
-- =============================================================
CREATE TABLE state_constituencies (
  id            SERIAL PRIMARY KEY,
  state_id      INT          NOT NULL REFERENCES states(id),
  inec_code     TEXT,                           -- SC/01/AB format
  name          TEXT         NOT NULL,
  slug          TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (state_id, slug)
);

CREATE INDEX idx_sc_state_id ON state_constituencies(state_id);

-- =============================================================
-- WARDS  (~8,812 total)
-- =============================================================
CREATE TABLE wards (
  id                       SERIAL PRIMARY KEY,
  state_id                 INT    NOT NULL REFERENCES states(id),
  lga_id                   INT    NOT NULL REFERENCES lgas(id),
  inec_code                SMALLINT NOT NULL,   -- ward numeric within LGA
  compound_code            CHAR(6) NOT NULL UNIQUE, -- OG0210 (state_alpha + lga_code + ward_code)
  name                     TEXT   NOT NULL,
  slug                     TEXT   NOT NULL,

  -- Constituency mappings (may be null for ~10% of wards — flagged for manual fix)
  state_constituency_id    INT    REFERENCES state_constituencies(id),
  federal_constituency_id  INT    REFERENCES federal_constituencies(id),
  senatorial_district_id   INT    REFERENCES senatorial_districts(id),

  -- Data quality flags
  sc_mapping_missing       BOOLEAN NOT NULL DEFAULT false,
  fc_mapping_missing       BOOLEAN NOT NULL DEFAULT false,
  sd_mapping_missing       BOOLEAN NOT NULL DEFAULT false,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lga_id, inec_code)
);

CREATE INDEX idx_wards_state_id     ON wards(state_id);
CREATE INDEX idx_wards_lga_id       ON wards(lga_id);
CREATE INDEX idx_wards_compound     ON wards(compound_code);
CREATE INDEX idx_wards_sc_id        ON wards(state_constituency_id);
CREATE INDEX idx_wards_fc_id        ON wards(federal_constituency_id);
CREATE INDEX idx_wards_sd_id        ON wards(senatorial_district_id);
CREATE INDEX idx_wards_name_trgm    ON wards USING gin(name gin_trgm_ops);

-- =============================================================
-- POLLING UNITS  (~118,000 with GPS, ~176,000 total)
-- =============================================================
CREATE TABLE polling_units (
  id              SERIAL PRIMARY KEY,
  ward_id         INT         NOT NULL REFERENCES wards(id),
  lga_id          INT         NOT NULL REFERENCES lgas(id),
  state_id        INT         NOT NULL REFERENCES states(id),
  pu_loc_id       VARCHAR(12) NOT NULL UNIQUE, -- OG0210001 (compound_code + pu_num)
  inec_pu_code    SMALLINT    NOT NULL,         -- PU numeric within ward
  description     TEXT,                         -- human-readable location description
  building_type_id SMALLINT,
  has_gps         BOOLEAN     NOT NULL DEFAULT false,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  geom            GEOMETRY(Point, 4326),        -- PostGIS point for spatial queries
  registered_voters INT,
  voting_points   SMALLINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pu_ward_id     ON polling_units(ward_id);
CREATE INDEX idx_pu_state_id    ON polling_units(state_id);
CREATE INDEX idx_pu_pu_loc_id   ON polling_units(pu_loc_id);
CREATE INDEX idx_pu_geom        ON polling_units USING gist(geom)
  WHERE geom IS NOT NULL;

-- =============================================================
-- VOTER CARD RESOLUTION CACHE
-- Optional: cache resolved results to avoid repeated lookups
-- =============================================================
CREATE TABLE voter_card_resolutions (
  id              SERIAL PRIMARY KEY,
  card_code       VARCHAR(14) NOT NULL UNIQUE,  -- 27-02-10-001 normalised
  ward_id         INT         NOT NULL REFERENCES wards(id),
  polling_unit_id INT         REFERENCES polling_units(id),
  resolved_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vcr_code ON voter_card_resolutions(card_code);

-- =============================================================
-- DATA QUALITY AUDIT LOG
-- Tracks gaps, corrections, and community-flagged errors
-- =============================================================
CREATE TABLE geo_data_quality (
  id            SERIAL PRIMARY KEY,
  table_name    TEXT        NOT NULL,
  record_id     INT         NOT NULL,
  field_name    TEXT        NOT NULL,
  issue_type    TEXT        NOT NULL, -- 'missing' | 'incorrect' | 'community_flag'
  notes         TEXT,
  resolved      BOOLEAN     NOT NULL DEFAULT false,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- UPDATED_AT trigger (auto-maintain on all geo tables)
-- =============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_states_updated_at
  BEFORE UPDATE ON states
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lgas_updated_at
  BEFORE UPDATE ON lgas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_wards_updated_at
  BEFORE UPDATE ON wards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_polling_units_updated_at
  BEFORE UPDATE ON polling_units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================
-- COMMENTS (documentation in the schema itself)
-- =============================================================
COMMENT ON TABLE states IS 'All 36 Nigerian states + FCT. inec_code 1-36 = states alphabetically, 37 = FCT.';
COMMENT ON TABLE lgas IS '774 local government areas. inec_code is numeric within state (1..N).';
COMMENT ON TABLE wards IS '~8,812 electoral wards. compound_code = state_alpha + zero-padded lga + zero-padded ward (e.g. OG0210).';
COMMENT ON TABLE polling_units IS '~118,302 polling units with GPS. pu_loc_id = compound_code + zero-padded pu (e.g. OG0210001).';
COMMENT ON COLUMN wards.sc_mapping_missing IS 'True if state_constituency_id could not be resolved from source data (~10.6% of wards).';
COMMENT ON COLUMN wards.sd_mapping_missing IS 'True if senatorial_district_id could not be resolved from source data (~51.3% of wards — fill from LGA-level mapping).';
COMMENT ON COLUMN polling_units.pu_loc_id IS 'INEC polling unit location ID. Format: {state_alpha(2)}{lga_code(02d)}{ward_code(02d)}{pu_code(03d)}';
