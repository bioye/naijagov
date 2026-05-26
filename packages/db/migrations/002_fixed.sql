-- =============================================================
-- NaijaGov — Migration 002 (fixed): correct table creation order
-- =============================================================

-- ── Types first ───────────────────────────────────────────────

CREATE TYPE verification_tier AS ENUM ('unverified', 'phone_verified', 'nin_verified');

CREATE TYPE rep_role AS ENUM (
  'president', 'vice_president',
  'governor', 'deputy_governor',
  'senator', 'house_of_reps',
  'state_assembly', 'lga_chairman', 'councillor'
);

CREATE TYPE rep_status AS ENUM ('incumbent', 'former', 'deceased');

CREATE TYPE election_type AS ENUM (
  'presidential', 'gubernatorial', 'senatorial',
  'house_of_reps', 'state_assembly', 'lga_chairmanship', 'councillorship'
);

CREATE TYPE election_status AS ENUM (
  'upcoming', 'campaigns_open', 'voting_day', 'collating', 'declared', 'disputed'
);

CREATE TYPE post_topic AS ENUM (
  'infrastructure', 'health', 'security', 'education',
  'water', 'electricity', 'corruption', 'elections',
  'youth', 'women', 'economy', 'other'
);

CREATE TYPE feedback_type AS ENUM (
  'wrong_rep', 'wrong_boundary', 'missing_rep',
  'outdated_info', 'feature_request', 'other'
);

CREATE TYPE feedback_status AS ENUM ('open', 'in_progress', 'resolved', 'dismissed');

-- ── Auth tables (no foreign deps except geo) ──────────────────

CREATE TABLE users (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone           VARCHAR(15)  NOT NULL UNIQUE,
  display_name    TEXT,
  verification    verification_tier NOT NULL DEFAULT 'phone_verified',
  nin_hash        TEXT,
  ward_id         INT          REFERENCES wards(id),
  polling_unit_id INT          REFERENCES polling_units(id),
  is_admin        BOOLEAN      NOT NULL DEFAULT false,
  deactivated_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_phone   ON users(phone);
CREATE INDEX idx_users_ward_id ON users(ward_id);

CREATE TABLE sessions (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires    ON sessions(expires_at);

CREATE TABLE otp_attempts (
  id          SERIAL      PRIMARY KEY,
  phone       VARCHAR(15) NOT NULL,
  code_hash   TEXT        NOT NULL,
  attempts    SMALLINT    NOT NULL DEFAULT 0,
  verified    BOOLEAN     NOT NULL DEFAULT false,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_otp_phone   ON otp_attempts(phone);
CREATE INDEX idx_otp_expires ON otp_attempts(expires_at);

CREATE TABLE otp_pin_cache (
  phone      VARCHAR(15) PRIMARY KEY,
  pin_id     TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Parties (must come before representatives) ────────────────

CREATE TABLE parties (
  id           SERIAL PRIMARY KEY,
  name         TEXT   NOT NULL UNIQUE,
  abbreviation TEXT   NOT NULL UNIQUE,
  slug         TEXT   NOT NULL UNIQUE,
  logo_url     TEXT,
  color_hex    VARCHAR(7),
  founded      DATE,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Representatives ───────────────────────────────────────────

CREATE TABLE representatives (
  id                       UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                     TEXT        NOT NULL UNIQUE,
  full_name                TEXT        NOT NULL,
  role                     rep_role    NOT NULL,
  status                   rep_status  NOT NULL DEFAULT 'incumbent',
  party_id                 INT         REFERENCES parties(id),
  state_id                 INT         REFERENCES states(id),
  lga_id                   INT         REFERENCES lgas(id),
  senatorial_district_id   INT         REFERENCES senatorial_districts(id),
  federal_constituency_id  INT         REFERENCES federal_constituencies(id),
  state_constituency_id    INT         REFERENCES state_constituencies(id),
  ward_id                  INT         REFERENCES wards(id),
  photo_url                TEXT,
  bio                      TEXT,
  term_start               DATE,
  term_end                 DATE,
  email                    TEXT,
  phone                    TEXT,
  office_address           TEXT,
  website                  TEXT,
  twitter_handle           TEXT,
  facebook_url             TEXT,
  data_verified            BOOLEAN     NOT NULL DEFAULT false,
  data_verified_at         TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reps_role      ON representatives(role);
CREATE INDEX idx_reps_state_id  ON representatives(state_id);
CREATE INDEX idx_reps_status    ON representatives(status);
CREATE INDEX idx_reps_fc_id     ON representatives(federal_constituency_id);
CREATE INDEX idx_reps_sd_id     ON representatives(senatorial_district_id);
CREATE INDEX idx_reps_name_trgm ON representatives USING gin(full_name gin_trgm_ops);

-- ── Election cycles + races ───────────────────────────────────

CREATE TABLE election_cycles (
  id            SERIAL PRIMARY KEY,
  year          SMALLINT    NOT NULL UNIQUE,
  election_date DATE        NOT NULL,
  status        election_status NOT NULL DEFAULT 'upcoming',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE election_races (
  id                       SERIAL PRIMARY KEY,
  cycle_id                 INT         NOT NULL REFERENCES election_cycles(id),
  election_type            election_type NOT NULL,
  state_id                 INT         REFERENCES states(id),
  senatorial_district_id   INT         REFERENCES senatorial_districts(id),
  federal_constituency_id  INT         REFERENCES federal_constituencies(id),
  state_constituency_id    INT         REFERENCES state_constituencies(id),
  lga_id                   INT         REFERENCES lgas(id),
  ward_id                  INT         REFERENCES wards(id),
  status                   election_status NOT NULL DEFAULT 'upcoming',
  result_declared_at       TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_races_cycle_id ON election_races(cycle_id);
CREATE INDEX idx_races_type     ON election_races(election_type);
CREATE INDEX idx_races_state_id ON election_races(state_id);

-- ── Candidates ────────────────────────────────────────────────

CREATE TABLE candidates (
  id                              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                            TEXT        NOT NULL UNIQUE,
  full_name                       TEXT        NOT NULL,
  party_id                        INT         NOT NULL REFERENCES parties(id),
  race_id                         INT         NOT NULL REFERENCES election_races(id),
  rep_id                          UUID        REFERENCES representatives(id),
  state_of_origin                 INT         REFERENCES states(id),
  lga_of_origin                   INT         REFERENCES lgas(id),
  photo_url                       TEXT,
  bio                             TEXT,
  education                       TEXT,
  occupation                      TEXT,
  manifesto_url                   TEXT,
  manifesto_summary               JSONB,
  manifesto_summary_generated_at  TIMESTAMPTZ,
  website                         TEXT,
  twitter_handle                  TEXT,
  facebook_url                    TEXT,
  status                          TEXT        NOT NULL DEFAULT 'declared',
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidates_race_id   ON candidates(race_id);
CREATE INDEX idx_candidates_party_id  ON candidates(party_id);
CREATE INDEX idx_candidates_name_trgm ON candidates USING gin(full_name gin_trgm_ops);

-- ── Election results ──────────────────────────────────────────

CREATE TABLE election_results (
  id           SERIAL      PRIMARY KEY,
  race_id      INT         NOT NULL REFERENCES election_races(id),
  candidate_id UUID        NOT NULL REFERENCES candidates(id),
  votes        INT         NOT NULL DEFAULT 0,
  percentage   NUMERIC(5,2),
  is_winner    BOOLEAN     NOT NULL DEFAULT false,
  entered_by   UUID        REFERENCES users(id),
  entered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (race_id, candidate_id)
);

CREATE INDEX idx_results_race_id      ON election_results(race_id);
CREATE INDEX idx_results_candidate_id ON election_results(candidate_id);

-- ── Seat history ──────────────────────────────────────────────

CREATE TABLE seat_history (
  id                       SERIAL PRIMARY KEY,
  election_type            election_type NOT NULL,
  state_id                 INT         REFERENCES states(id),
  federal_constituency_id  INT         REFERENCES federal_constituencies(id),
  state_constituency_id    INT         REFERENCES state_constituencies(id),
  senatorial_district_id   INT         REFERENCES senatorial_districts(id),
  lga_id                   INT         REFERENCES lgas(id),
  rep_id                   UUID        REFERENCES representatives(id),
  candidate_id             UUID        REFERENCES candidates(id),
  party_id                 INT         REFERENCES parties(id),
  cycle_id                 INT         REFERENCES election_cycles(id),
  term_start               DATE,
  term_end                 DATE,
  votes                    INT,
  percentage               NUMERIC(5,2),
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_seat_history_fc_id ON seat_history(federal_constituency_id);
CREATE INDEX idx_seat_history_sd_id ON seat_history(senatorial_district_id);
CREATE INDEX idx_seat_history_cycle ON seat_history(cycle_id);

-- ── Posts ─────────────────────────────────────────────────────

CREATE TABLE posts (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES users(id),
  body            TEXT        NOT NULL CHECK (char_length(body) <= 500),
  topic           post_topic  NOT NULL DEFAULT 'other',
  ward_id         INT         REFERENCES wards(id),
  lga_id          INT         REFERENCES lgas(id),
  state_id        INT         REFERENCES states(id),
  candidate_id    UUID        REFERENCES candidates(id),
  rep_id          UUID        REFERENCES representatives(id),
  upvote_count    INT         NOT NULL DEFAULT 0,
  reply_count     INT         NOT NULL DEFAULT 0,
  flag_count      INT         NOT NULL DEFAULT 0,
  is_removed      BOOLEAN     NOT NULL DEFAULT false,
  removed_reason  TEXT,
  removed_at      TIMESTAMPTZ,
  removed_by      UUID        REFERENCES users(id),
  is_under_review BOOLEAN     NOT NULL DEFAULT false,
  seo_indexed     BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_user_id   ON posts(user_id);
CREATE INDEX idx_posts_ward_id   ON posts(ward_id);
CREATE INDEX idx_posts_lga_id    ON posts(lga_id);
CREATE INDEX idx_posts_state_id  ON posts(state_id);
CREATE INDEX idx_posts_topic     ON posts(topic);
CREATE INDEX idx_posts_created   ON posts(created_at DESC);
CREATE INDEX idx_posts_candidate ON posts(candidate_id) WHERE candidate_id IS NOT NULL;
CREATE INDEX idx_posts_seo       ON posts(seo_indexed)  WHERE seo_indexed = true;

ALTER TABLE posts ADD COLUMN rank_score NUMERIC
  GENERATED ALWAYS AS (upvote_count * 2.0 + flag_count * -1.0) STORED;

CREATE TABLE replies (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id         UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_reply_id UUID        REFERENCES replies(id),
  user_id         UUID        NOT NULL REFERENCES users(id),
  body            TEXT        NOT NULL CHECK (char_length(body) <= 500),
  upvote_count    INT         NOT NULL DEFAULT 0,
  is_removed      BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_replies_post_id   ON replies(post_id);
CREATE INDEX idx_replies_parent_id ON replies(parent_reply_id);
CREATE INDEX idx_replies_user_id   ON replies(user_id);

CREATE TABLE post_upvotes (
  post_id    UUID NOT NULL REFERENCES posts(id)  ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE post_flags (
  post_id    UUID NOT NULL REFERENCES posts(id)  ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- ── Feedback ──────────────────────────────────────────────────

CREATE TABLE feedback (
  id              SERIAL      PRIMARY KEY,
  user_id         UUID        REFERENCES users(id),
  type            feedback_type NOT NULL,
  description     TEXT        NOT NULL,
  screenshot_url  TEXT,
  reply_email     TEXT,
  status          feedback_status NOT NULL DEFAULT 'open',
  admin_notes     TEXT,
  resolved_by     UUID        REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  related_rep_id  UUID        REFERENCES representatives(id),
  related_ward_id INT         REFERENCES wards(id),
  page_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_status  ON feedback(status);
CREATE INDEX idx_feedback_type    ON feedback(type);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);

CREATE TABLE ai_chat_sessions (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        REFERENCES users(id),
  messages    JSONB       NOT NULL DEFAULT '[]',
  escalated   BOOLEAN     NOT NULL DEFAULT false,
  feedback_id INT         REFERENCES feedback(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Triggers ──────────────────────────────────────────────────

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reps_updated_at
  BEFORE UPDATE ON representatives FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_candidates_updated_at
  BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_feedback_updated_at
  BEFORE UPDATE ON feedback FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE users IS 'Registered citizens. phone in E.164 format.';
COMMENT ON TABLE representatives IS 'All elected officials. One row per person per role.';
COMMENT ON TABLE candidates IS 'People running in a specific election race.';
COMMENT ON TABLE seat_history IS 'Wikipedia-style lineage: every holder of each seat.';
COMMENT ON TABLE posts IS 'Town Square posts. seo_indexed=true when upvotes >= 5.';
COMMENT ON COLUMN candidates.manifesto_summary IS 'JSONB: {economy, security, education, health, infrastructure}';
