-- ============================================================================
-- Equity AI — Milestone 14D: daily historical price series
--
-- Deliberately a NEW table, not an extension of market_data. market_data
-- (001_core_tables.sql) is a point-in-time snapshot table (one row per
-- company per ingestion run, no OHLC columns, no unique constraint suited
-- to a daily series) — reusing it for a daily time series would collide
-- with its existing 13F/13H semantics (see the Milestone 14C audit, Part 9/10).
--
-- Source is ALWAYS FMP's /stable/historical-price-eod/dividend-adjusted
-- (split- AND dividend-adjusted — verified live against NVDA's real 2024
-- 10:1 split during the 14C audit; the plain "full" and "non-split-adjusted"
-- endpoint variants are NEVER read for what gets stored here). Every row's
-- OHLC values are adjusted, never raw — adjustment_type records that
-- explicitly rather than leaving it implicit in a URL string, per the 14C
-- audit's finding that this ambiguity is a genuine correctness trap.
--
-- RLS/permissions convention: NONE of the existing tables in this schema
-- (001-007) define row-level security policies or explicit grants — every
-- table here is created as a plain Postgres table with no `enable row
-- level security` statement and no `create policy`. Access control is
-- enforced entirely at the application layer: every repository
-- (src/db/client.ts's getDbClient()) connects using SUPABASE_SERVICE_ROLE_KEY,
-- which bypasses RLS by design, and no code path in this codebase uses a
-- client-side/anon key against these tables. This migration follows that
-- exact convention — no RLS/policy statements — for consistency with every
-- other table in 001-007, not because RLS was evaluated and rejected here
-- specifically.
-- ============================================================================

create table daily_prices (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  trade_date        date not null,
  open              numeric,
  high              numeric,
  low               numeric,
  close             numeric,
  volume            bigint,
  -- Only one value allowed today — the sole source this milestone reads.
  -- A future provider/variant (e.g. a raw/unadjusted series kept
  -- deliberately separate) would add a new allowed value here, never
  -- reinterpret this one.
  adjustment_type   text not null check (adjustment_type in ('split_and_dividend_adjusted')),
  source_id         uuid not null references data_sources(id),
  created_at        timestamptz not null default now(),
  constraint uq_daily_prices unique (company_id, trade_date, adjustment_type)
);
create index idx_daily_prices_company_date on daily_prices (company_id, trade_date desc);
