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
  subdivision  TEXT,                   -- ISO 3166-2 (e.g. NO-42 Agder), if regional/local
  geo_scope    TEXT,                   -- national | regional | local | supranational
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

-- ── Funding rollups (money actually paid out) ───────────────────────────────
-- Pre-aggregated from grants-sources awards.jsonl by scripts/build-funding-rollups.ts
-- (pnpm build:funding). Amounts are stored in EUR (canonical, comparable across
-- countries) via a dated FX snapshot, plus the native currency/amount where a
-- group is single-currency. `view` is 'received' (money landing on recipients)
-- or 'awarded' (money leaving funders). `country = 'ALL'` holds the global hero.

DROP TABLE IF EXISTS funding_country;
CREATE TABLE funding_country (
  view            TEXT NOT NULL,    -- received | awarded
  country         TEXT NOT NULL,    -- ISO/EU code, or 'ALL' for the global hero
  sum_eur         REAL NOT NULL,
  award_count     INTEGER NOT NULL,
  median_eur      REAL,
  native_currency TEXT,             -- set only when the group is single-currency
  sum_native      REAL,
  PRIMARY KEY (view, country)
);

DROP TABLE IF EXISTS funding_entity;
CREATE TABLE funding_entity (
  view            TEXT NOT NULL,    -- received | awarded
  scope           TEXT NOT NULL,    -- 'ALL', a country code, a subdivision (NO-42), or a funderId
  entity_type     TEXT NOT NULL,    -- recipient | funder
  entity_id       TEXT NOT NULL,
  entity_name     TEXT NOT NULL,
  entity_country  TEXT,
  sum_eur         REAL NOT NULL,
  award_count     INTEGER NOT NULL,
  median_eur      REAL,
  native_currency TEXT,
  sum_native      REAL,
  rank            INTEGER NOT NULL  -- 1..N within (view, scope), by sum_eur desc
);
CREATE INDEX idx_funding_entity_lookup ON funding_entity(view, scope, rank);

DROP TABLE IF EXISTS funding_coverage;
CREATE TABLE funding_coverage (
  country      TEXT PRIMARY KEY,
  completeness TEXT NOT NULL,       -- full | partial | threshold_capped | sample
  as_of        TEXT
);

-- Sub-national rollups: money by administrative subdivision (Norway POC: Fylke).
-- `scope` is a country code (the aggregate "which Fylke gets/sends most" view) OR
-- a funderId (the per-provider drill-down — where one funder's money flows).
-- `level` is fylke | kommune | city so the Fylke↔Kommune↔City toggle is additive.
-- `subdivision` is an ISO 3166-2 code (NO-42), a kommune number, a poststed, or
-- the sentinel 'NATIONAL' (awarded money from funders with no single origin Fylke).
DROP TABLE IF EXISTS funding_subdivision;
CREATE TABLE funding_subdivision (
  view            TEXT NOT NULL,    -- received | awarded
  scope           TEXT NOT NULL,    -- country code, or a funderId
  level           TEXT NOT NULL,    -- fylke | kommune | city
  subdivision     TEXT NOT NULL,    -- ISO 3166-2 / kommune nr / poststed / 'NATIONAL'
  sum_eur         REAL NOT NULL,
  award_count     INTEGER NOT NULL,
  median_eur      REAL,
  native_currency TEXT,
  sum_native      REAL,
  PRIMARY KEY (view, scope, level, subdivision)
);
CREATE INDEX idx_funding_subdivision_lookup ON funding_subdivision(view, scope, level);

-- Per-recipient grant breakdown: one row per (recipient, award year, funder), so
-- clicking a recipient shows all their grants grouped by year (sum + count per
-- year) and, within a year, who paid and how much. Built only for recipients that
-- appear in a funding_entity leaderboard (the clickable ones); totals are global
-- (all funders/years/regions for that recipient), reconciling with received|ALL.
DROP TABLE IF EXISTS funding_recipient_year;
CREATE TABLE funding_recipient_year (
  recipient_id    TEXT NOT NULL,
  year            INTEGER,          -- award year (from awarded_at); NULL = undated
  funder_id       TEXT NOT NULL,
  funder_name     TEXT NOT NULL,
  sum_eur         REAL NOT NULL,
  award_count     INTEGER NOT NULL,
  native_currency TEXT,             -- set only when the (recipient,year,funder) group is single-currency
  sum_native      REAL,
  PRIMARY KEY (recipient_id, year, funder_id)
);
CREATE INDEX idx_funding_recipient_year ON funding_recipient_year(recipient_id);
