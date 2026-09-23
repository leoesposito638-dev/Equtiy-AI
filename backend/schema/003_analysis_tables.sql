-- ============================================================================
-- Equity AI — Analysis, Thesis, Change Detection, Alerts, Watchlists
-- Everything AI-authored lives ONLY in this file's tables (analysis_snapshots,
-- investment_theses summary fields). These tables never store raw financial
-- facts — only interpretation of facts that already exist upstream.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- analysis_snapshots — one row per generated analysis run
-- ----------------------------------------------------------------------------
create table analysis_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  fundamental_score  numeric not null,
  opportunity_score  numeric,
  score_change       numeric,
  analysis_version   text not null,
  generated_at       timestamptz not null default now(),
  summary            text,             -- AI INTERPRETATION
  data_snapshot_id   uuid              -- points at the fundamental_scores row used as input
);
create index idx_analysis_snapshots_company on analysis_snapshots (company_id, generated_at desc);

-- ----------------------------------------------------------------------------
-- investment_theses
-- ----------------------------------------------------------------------------
create table investment_theses (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null references companies(id) on delete cascade,
  analysis_snapshot_id        uuid not null references analysis_snapshots(id) on delete cascade,
  headline                    text not null,
  thesis                      text not null,
  bull_case                   text,
  base_case                   text,
  bear_case                   text,
  catalysts                   jsonb not null default '[]',
  risks                       jsonb not null default '[]',
  thesis_change_conditions    jsonb not null default '[]',
  generated_at                timestamptz not null default now(),
  model_version                text not null
);
create index idx_investment_theses_company on investment_theses (company_id, generated_at desc);

-- ----------------------------------------------------------------------------
-- change_events — output of the change-detection engine
-- ----------------------------------------------------------------------------
create table change_events (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references companies(id) on delete cascade,
  event_type             text not null,     -- SCORE_CHANGE, METRIC_CHANGE, GUIDANCE_CHANGE, ...
  metric_name            text,
  old_value              numeric,
  new_value              numeric,
  absolute_change        numeric,
  percentage_change      numeric,
  importance_score       numeric not null check (importance_score between 0 and 100),
  direction              text check (direction in ('UP','DOWN','FLAT')),
  detected_at            timestamptz not null default now(),
  analysis_snapshot_id   uuid references analysis_snapshots(id),
  created_at             timestamptz not null default now()
);
create index idx_change_events_company on change_events (company_id, detected_at desc);
create index idx_change_events_importance on change_events (importance_score desc);

-- ----------------------------------------------------------------------------
-- alerts — only meaningful change_events graduate into a user-facing alert
-- ----------------------------------------------------------------------------
create table alerts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  company_id        uuid not null references companies(id) on delete cascade,
  change_event_id   uuid not null references change_events(id) on delete cascade,
  alert_type        text not null,
  severity          text not null check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  title             text not null,
  summary           text not null,
  score_before      numeric,
  score_after       numeric,
  is_read           boolean not null default false,
  created_at        timestamptz not null default now()
);
create index idx_alerts_user_unread on alerts (user_id, is_read, created_at desc);
create index idx_alerts_company on alerts (company_id, created_at desc);

-- ----------------------------------------------------------------------------
-- watchlists / watchlist_companies
-- ----------------------------------------------------------------------------
create table watchlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  name        text not null default 'My Companies',
  created_at  timestamptz not null default now()
);
create index idx_watchlists_user on watchlists (user_id);

create table watchlist_companies (
  watchlist_id  uuid not null references watchlists(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (watchlist_id, company_id)
);
