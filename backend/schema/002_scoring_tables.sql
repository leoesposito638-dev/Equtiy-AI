-- ============================================================================
-- Equity AI — Scoring Foundation Tables
-- calculated_metrics is EQUITY-AI-DERIVED (still FACT-adjacent — deterministic
-- math over canonical data, versioned and reproducible). Everything from
-- score_categories downward is configuration + the scoring engine's output.
-- No AI-authored text lives in any table in this file.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- calculated_metrics — deterministic derived metrics (growth, margins, ratios)
-- ----------------------------------------------------------------------------
create table calculated_metrics (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id) on delete cascade,
  metric_name          text not null,   -- revenue_growth_yoy, gross_margin, roic, pe, ...
  value                numeric,
  period_end           date not null,
  period_type          text not null check (period_type in ('QUARTER','ANNUAL','TTM')),
  calculation_version  text not null,   -- e.g. 'v1.0' — reproducibility guarantee
  input_data_hash      text not null,   -- hash of the exact financial_metrics rows used
  created_at           timestamptz not null default now(),
  constraint uq_calculated_metrics unique
    (company_id, metric_name, period_end, period_type, calculation_version)
);
create index idx_calc_metrics_company_metric on calculated_metrics (company_id, metric_name, period_end);

-- ----------------------------------------------------------------------------
-- peer_groups / company_peers
-- ----------------------------------------------------------------------------
create table peer_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sector      text,
  industry    text,
  method      text not null default 'STATIC' check (method in ('STATIC','DYNAMIC')),
  created_at  timestamptz not null default now()
);

create table company_peers (
  company_id       uuid not null references companies(id) on delete cascade,
  peer_company_id  uuid not null references companies(id) on delete cascade,
  peer_type        text not null check (peer_type in ('PRIMARY','SECONDARY','SECTOR','INDUSTRY')),
  similarity_score numeric check (similarity_score between 0 and 1),
  created_at       timestamptz not null default now(),
  primary key (company_id, peer_company_id, peer_type),
  check (company_id <> peer_company_id)
);
create index idx_company_peers_company on company_peers (company_id);

-- ----------------------------------------------------------------------------
-- metric_benchmarks — sector/industry distributions, so nothing is judged
-- against a universal hard threshold
-- ----------------------------------------------------------------------------
create table metric_benchmarks (
  id            uuid primary key default gen_random_uuid(),
  metric_name   text not null,
  sector        text,
  industry      text,
  period_end    date not null,
  p25           numeric,
  median        numeric,
  p75           numeric,
  p90           numeric,
  sample_size   integer not null,
  created_at    timestamptz not null default now(),
  constraint uq_metric_benchmarks unique (metric_name, sector, industry, period_end)
);
create index idx_metric_benchmarks_lookup on metric_benchmarks (metric_name, sector, industry, period_end desc);

-- ----------------------------------------------------------------------------
-- score_categories — configuration, never hardcoded in application logic
-- ----------------------------------------------------------------------------
create table score_categories (
  id              uuid primary key default gen_random_uuid(),
  category_key    text not null unique,  -- GROWTH, PROFITABILITY, ...
  name            text not null,
  description     text,
  default_weight  numeric not null check (default_weight between 0 and 1),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- score_rules — the actual scoring methodology, per category
-- ----------------------------------------------------------------------------
create table score_rules (
  id                    uuid primary key default gen_random_uuid(),
  category_id           uuid not null references score_categories(id),
  metric_name           text not null,
  rule_type             text not null check (rule_type in
                          ('PERCENTILE','LINEAR','LOG','RATIO','TREND','COMPOSITE')),
  weight                numeric not null check (weight between 0 and 1),
  direction             text not null check (direction in
                          ('HIGHER_IS_BETTER','LOWER_IS_BETTER','OPTIMAL_RANGE')),
  minimum_data_points   integer not null default 1,
  sector_specific       boolean not null default false,
  version               text not null,
  active                boolean not null default true,
  created_at            timestamptz not null default now()
);
create index idx_score_rules_category on score_rules (category_id, version, active);

-- ----------------------------------------------------------------------------
-- category_scores
-- ----------------------------------------------------------------------------
create table category_scores (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id) on delete cascade,
  category_id          uuid not null references score_categories(id),
  score                numeric not null check (score between 0 and 100),
  confidence           numeric not null check (confidence between 0 and 1),
  coverage             numeric not null check (coverage between 0 and 1),
  calculation_version  text not null,
  calculated_at        timestamptz not null default now()
);
create index idx_category_scores_company on category_scores (company_id, category_id, calculated_at desc);

-- ----------------------------------------------------------------------------
-- fundamental_scores — the canonical, top-level company score
-- ----------------------------------------------------------------------------
create table fundamental_scores (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id) on delete cascade,
  score                numeric not null check (score between 0 and 100),
  confidence           numeric not null check (confidence between 0 and 1),
  data_coverage        numeric not null check (data_coverage between 0 and 1),
  calculation_version  text not null,
  previous_score       numeric,
  score_change         numeric,
  calculated_at        timestamptz not null default now()
);
create index idx_fundamental_scores_company on fundamental_scores (company_id, calculated_at desc);
