-- OpenSubsidies D1 schema.
-- Apply with: wrangler d1 execute opensubsidies-db --local --file=scripts/schema.sql
-- Seed after with scripts/.generated/data.sql (produced by `pnpm build:data`).

DROP TABLE IF EXISTS grants_fts;
DROP TABLE IF EXISTS grants;
DROP TABLE IF EXISTS funders;

CREATE TABLE funders (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  short_name   TEXT NOT NULL,
  type         TEXT NOT NULL,          -- government | supranational | foundation | unknown
  country      TEXT NOT NULL,          -- ISO code or EU/CoE/INTL
  country_name TEXT NOT NULL,
  region       TEXT NOT NULL,          -- continent / "Supranational"
  hq_city      TEXT,
  website      TEXT,
  favicon_url  TEXT,
  lat          REAL NOT NULL,          -- resolved at build from hq_city/country
  lng          REAL NOT NULL,
  prose        TEXT
);

CREATE TABLE grants (
  id               TEXT PRIMARY KEY,
  funder_id        TEXT NOT NULL,
  name             TEXT NOT NULL,
  url              TEXT,
  application_url  TEXT,
  description      TEXT,               -- first paragraph of prose (precomputed)
  prose            TEXT,               -- full body; lazy-loaded for detail + embedded for search
  closes_at        TEXT,              -- ISO date; status derived at request time
  opens_at         TEXT,
  application_mode TEXT,               -- rolling | deadline | call_window | unknown
  currency         TEXT,
  min_amount       REAL,
  max_amount       REAL,
  funding_rate_pct REAL,
  total_budget     REAL,
  instrument_type  TEXT,               -- grant | loan | guarantee | voucher | equity | mixed | unknown
  scheme_code      TEXT,
  program          TEXT,
  documents        TEXT,               -- JSON array of { title, url }
  source_updated_at TEXT,
  state            TEXT                -- planned | in_progress | ready_for_verification | complete
);

CREATE INDEX idx_grants_funder ON grants(funder_id);
CREATE INDEX idx_grants_instrument ON grants(instrument_type);
CREATE INDEX idx_grants_mode ON grants(application_mode);
CREATE INDEX idx_grants_closes ON grants(closes_at);
CREATE INDEX idx_grants_state ON grants(state);
CREATE INDEX idx_funders_country ON funders(country);

-- Keyword arm of hybrid search. unicode61 + remove_diacritics handles æøå /
-- umlauts; no stemmer (English stemming would corrupt NO/DE). grant_id is the
-- join key back to the grants table.
CREATE VIRTUAL TABLE grants_fts USING fts5(
  grant_id UNINDEXED,
  name,
  description,
  scheme_code,
  program,
  tokenize = 'unicode61 remove_diacritics 1'
);
