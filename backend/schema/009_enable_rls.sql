-- ============================================================================
-- Equity AI — Milestone 14D.1 Part 3: enable Row Level Security, no policies
--
-- Every table in schema files 001-008 was created with NO `enable row level
-- security` and NO `create policy` — access control has been entirely
-- implicit, resting on the fact that only db/client.ts's getDbClient() ever
-- connects, always using SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS by
-- design regardless of whether RLS is enabled. That means RLS being off has
-- never mattered for THIS backend's own access, but it also means: if any
-- other client ever authenticates with the anon/public key (the frontend,
-- a future public API, a leaked key), every one of these tables is fully
-- readable and writable with no restriction whatsoever, because Postgres'
-- default (RLS disabled) grants table-level access unconditionally.
--
-- This migration closes that gap the only way that matches how this
-- project actually works today: enable RLS on every public-schema table,
-- and deliberately add ZERO policies. With RLS enabled and no policies,
-- Postgres denies ALL access to every role except the table owner and any
-- role with BYPASSRLS (the Supabase `service_role` is BYPASSRLS by
-- default) — so the service-role backend keeps working completely
-- unchanged, and every other credential (anon, authenticated) loses all
-- access outright. Policies can be added later, deliberately, per table,
-- if a non-service-role client ever legitimately needs scoped access —
-- until then, no access is safer than implicit full access.
--
-- Table list verified LIVE against this project's actual Supabase
-- instance (Milestone 14D.1), not just read off the local schema files —
-- fetched from PostgREST's own OpenAPI spec (GET /rest/v1/ definitions),
-- which is the authoritative list of every table PostgREST currently
-- exposes in the public schema. Confirmed to match schema files 001-008
-- exactly (23 tables, no drift, nothing extra, nothing missing):
--   alerts, analysis_snapshots, calculated_metrics, category_scores,
--   change_events, companies, company_events, company_peers, daily_prices,
--   data_sources, earnings, estimates, financial_metrics,
--   fundamental_scores, investment_theses, market_data, metric_benchmarks,
--   peer_groups, raw_financial_data, score_categories, score_rules,
--   watchlist_companies, watchlists
--
-- Apply manually via the Supabase SQL editor (this project has no DDL
-- execution capability — see package.json's `migrate` script and every
-- prior migration's own header for the same note). Not applied by Claude.
-- ============================================================================

alter table public.alerts enable row level security;
alter table public.analysis_snapshots enable row level security;
alter table public.calculated_metrics enable row level security;
alter table public.category_scores enable row level security;
alter table public.change_events enable row level security;
alter table public.companies enable row level security;
alter table public.company_events enable row level security;
alter table public.company_peers enable row level security;
alter table public.daily_prices enable row level security;
alter table public.data_sources enable row level security;
alter table public.earnings enable row level security;
alter table public.estimates enable row level security;
alter table public.financial_metrics enable row level security;
alter table public.fundamental_scores enable row level security;
alter table public.investment_theses enable row level security;
alter table public.market_data enable row level security;
alter table public.metric_benchmarks enable row level security;
alter table public.peer_groups enable row level security;
alter table public.raw_financial_data enable row level security;
alter table public.score_categories enable row level security;
alter table public.score_rules enable row level security;
alter table public.watchlist_companies enable row level security;
alter table public.watchlists enable row level security;

-- No `create policy` statements — this is intentional. With RLS enabled
-- and zero policies, only the table owner and BYPASSRLS roles (service_role)
-- can access these tables at all; every other role is fully denied.
