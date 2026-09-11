-- ============================================================================
-- Equity AI — Core Data Tables
-- Identity, sourcing, raw facts, normalized facts, market data, estimates,
-- earnings, and company events.
--
-- Principle enforced at schema level: FACT vs CALCULATION vs AI INTERPRETATION
-- never share a table. raw_financial_data / financial_metrics / market_data /
-- estimates / earnings hold FACTS ONLY, always with a source_id (or
-- data_source_id) pointing back to data_sources. Nothing here is ever
-- written by the AI service.
-- ============================================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ----------------------------------------------------------------------------
-- companies
-- ----------------------------------------------------------------------------
create table companies (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  legal_name        text,
  ticker            text not null,
  exchange          text,
  country           text,
  currency          text,
  isin              text,
  cusip             text,
  cik               text,
  sector            text,
  industry          text,
  sub_industry      text,
  description       text,
  website           text,
  logo_url          text,
  market_cap        numeric,
  employee_count    integer,
  founded_year      integer,
  fiscal_year_end   text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint uq_companies_ticker_exchange unique (ticker, exchange)
);
create index idx_companies_ticker on companies (ticker);
create index idx_companies_sector_industry on companies (sector, industry);

-- ----------------------------------------------------------------------------
-- data_sources — every factual datapoint must trace back to one of these
-- ----------------------------------------------------------------------------
create table data_sources (
  id                      uuid primary key default gen_random_uuid(),
  provider_name           text not null,
  provider_type           text not null check (provider_type in (
                            'SEC','COMPANY_FILING','FINANCIAL_API',
                            'COMPANY_PRESS_RELEASE','EARNINGS_TRANSCRIPT',
                            'NEWS','MARKET_DATA')),
  source_url              text,
  source_document_id      text,
  source_document_type    text,
  published_at            timestamptz,
  retrieved_at            timestamptz not null default now(),
  reporting_period_start  date,
  reporting_period_end    date,
  filing_date             date,
  currency                text,
  data_quality_score      numeric check (data_quality_score between 0 and 1),
  created_at              timestamptz not null default now()
);
create index idx_data_sources_provider on data_sources (provider_type, provider_name);

-- ----------------------------------------------------------------------------
-- raw_financial_data — never discarded, exactly as received from the source
-- ----------------------------------------------------------------------------
create table raw_financial_data (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  data_source_id     uuid not null references data_sources(id),
  metric_name        text not null,
  metric_identifier  text,           -- provider-native tag, e.g. XBRL concept
  raw_value          numeric,
  raw_text           text,
  unit               text,
  currency           text not null,
  period_start       date,
  period_end         date not null,
  period_type        text not null check (period_type in ('QUARTER','ANNUAL','TTM','INSTANT')),
  filing_date        date,
  source_confidence  numeric check (source_confidence between 0 and 1),
  created_at         timestamptz not null default now()
);
create index idx_raw_fin_company_metric on raw_financial_data (company_id, metric_name, period_end);
create index idx_raw_fin_source on raw_financial_data (data_source_id);
create unique index uq_raw_fin_dedupe on raw_financial_data
  (company_id, metric_name, period_end, period_type, data_source_id);

-- ----------------------------------------------------------------------------
-- financial_metrics — normalized, canonical FACT layer (post-validation)
-- ----------------------------------------------------------------------------
create table financial_metrics (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  metric_name       text not null,
  metric_category   text,
  value             numeric,
  unit              text not null,
  currency          text not null,
  period_start      date,
  period_end        date not null,
  period_type       text not null check (period_type in ('QUARTER','ANNUAL','TTM','INSTANT')),
  source_id         uuid not null references data_sources(id),
  calculation_type  text not null default 'DIRECT' check (calculation_type in ('DIRECT','DERIVED')),
  confidence_score  numeric check (confidence_score between 0 and 1),
  created_at        timestamptz not null default now(),
  constraint uq_financial_metrics unique (company_id, metric_name, period_end, period_type, currency)
);
create index idx_fin_metrics_company_metric on financial_metrics (company_id, metric_name, period_end);

-- ----------------------------------------------------------------------------
-- market_data — kept separate from fundamentals, always
-- ----------------------------------------------------------------------------
create table market_data (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  timestamp           timestamptz not null,
  price               numeric,
  market_cap          numeric,
  volume              bigint,
  shares_outstanding  numeric,
  high_52w            numeric,
  low_52w             numeric,
  return_1m           numeric,
  return_3m           numeric,
  return_6m           numeric,
  return_12m          numeric,
  volatility_1y       numeric,
  created_at          timestamptz not null default now()
);
create index idx_market_data_company_ts on market_data (company_id, timestamp desc);

-- ----------------------------------------------------------------------------
-- estimates — analyst expectations, never mixed with actuals
-- ----------------------------------------------------------------------------
create table estimates (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references companies(id) on delete cascade,
  metric_name            text not null,
  estimate_value         numeric,
  estimate_period_start  date,
  estimate_period_end    date not null,
  estimate_period_type   text not null check (estimate_period_type in ('QUARTER','ANNUAL','TTM')),
  consensus_value        numeric,
  analyst_count          integer,
  source_id              uuid not null references data_sources(id),
  retrieved_at           timestamptz not null default now(),
  created_at             timestamptz not null default now()
);
create index idx_estimates_company_metric on estimates (company_id, metric_name, estimate_period_end);

-- ----------------------------------------------------------------------------
-- earnings
-- ----------------------------------------------------------------------------
create table earnings (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references companies(id) on delete cascade,
  period_start                date,
  period_end                  date not null,
  report_date                 timestamptz not null,
  eps_actual                  numeric,
  eps_estimate                 numeric,
  eps_surprise_percent         numeric,
  revenue_actual               numeric,
  revenue_estimate             numeric,
  revenue_surprise_percent     numeric,
  guidance_text                text,
  guidance_direction           text check (guidance_direction in
                                 ('RAISED','MAINTAINED','LOWERED','WITHDRAWN','UNKNOWN')),
  source_id                    uuid not null references data_sources(id),
  created_at                   timestamptz not null default now()
);
create index idx_earnings_company_report on earnings (company_id, report_date desc);

-- ----------------------------------------------------------------------------
-- company_events — required for continuous monitoring
-- ----------------------------------------------------------------------------
create table company_events (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  event_type        text not null check (event_type in (
                      'EARNINGS','GUIDANCE','CEO_CHANGE','CFO_CHANGE','ACQUISITION',
                      'DIVESTITURE','PRODUCT_LAUNCH','PARTNERSHIP','BUYBACK','DIVIDEND',
                      'FILING','LEGAL','REGULATORY','OTHER')),
  title             text not null,
  description       text,
  importance_score  numeric check (importance_score between 0 and 100),
  published_at      timestamptz not null,
  source_id         uuid references data_sources(id),
  ai_summary        text,        -- AI INTERPRETATION — distinct from `description` (FACT)
  created_at        timestamptz not null default now()
);
create index idx_company_events_company_time on company_events (company_id, published_at desc);
