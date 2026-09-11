-- ============================================================================
-- Equity AI — Scoring Configuration v1.1 (Milestone 13C)
--
-- Approved change (Milestone 13A/13B): gross_margin_stability and
-- roic_persistence (COMPETITIVE_ADVANTAGE, both TREND rules) were seeded in
-- v1.0 with minimum_data_points = 5, but LOOKBACK_PERIODS (the maximum
-- historical periods SEC/FMP ever fetch) is 4 — an implementation mismatch
-- discovered in Milestone 12D, not a deliberate methodology choice (traced
-- in 13A: LOOKBACK_PERIODS=4 was sized for GROWTH's own maximum requirement
-- at Milestone 2, before these 5-period rules existed). Per the schema's own
-- versioning convention (see 004_seed_scoring_config.sql's header): changing
-- the model means inserting new score_rules under a new version and flipping
-- `active` on the old ones — never editing v1.0 in place, so past scores
-- calculated under v1.0 stay reproducible.
--
-- Every rule below is an EXACT copy of its v1.0 counterpart — same
-- metric_name, rule_type, weight, direction, sector_specific — with ONLY
-- gross_margin_stability's and roic_persistence's minimum_data_points
-- changed from 5 to 4. LOOKBACK_PERIODS itself is NOT changed (explicitly
-- forbidden this milestone). roic_persistence's minimum_data_points change
-- alone does not make it scoreable: it is a TREND rule over roic's own
-- stored history (see supabaseScoringRepo.ts's TREND_METRIC_SOURCE), and
-- roic is not computed anywhere in this repository (invested capital and
-- effective tax rate remain unresolved product decisions — Milestone 13A/
-- 13B) — it naturally stays unavailable, exactly as intended.
--
-- Applied against the live database via
-- src/localDev/milestone13cSeedScoreRulesV11.ts (this project's DB writes in
-- this environment go through the Supabase JS client, not psql) — this file
-- exists so the schema/ directory keeps its established one-file-per-change
-- convention and this change is reviewable/reproducible from source control.
-- ============================================================================

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'revenue_growth_yoy', 'PERCENTILE', 0.30, 'HIGHER_IS_BETTER', 2, true, 'v1.1', true from score_categories where category_key = 'GROWTH'
union all
select id, 'revenue_cagr_3y',    'PERCENTILE', 0.20, 'HIGHER_IS_BETTER', 4, true, 'v1.1', true from score_categories where category_key = 'GROWTH'
union all
select id, 'eps_growth_yoy',     'PERCENTILE', 0.20, 'HIGHER_IS_BETTER', 2, true, 'v1.1', true from score_categories where category_key = 'GROWTH'
union all
select id, 'eps_cagr',           'PERCENTILE', 0.15, 'HIGHER_IS_BETTER', 4, true, 'v1.1', true from score_categories where category_key = 'GROWTH'
union all
select id, 'growth_acceleration','TREND',      0.15, 'HIGHER_IS_BETTER', 3, true, 'v1.1', true from score_categories where category_key = 'GROWTH';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'gross_margin',     'PERCENTILE', 0.20, 'HIGHER_IS_BETTER', 2, true, 'v1.1', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'operating_margin', 'PERCENTILE', 0.25, 'HIGHER_IS_BETTER', 2, true, 'v1.1', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'net_margin',       'PERCENTILE', 0.15, 'HIGHER_IS_BETTER', 2, true, 'v1.1', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'roic',             'PERCENTILE', 0.20, 'HIGHER_IS_BETTER', 2, true, 'v1.1', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'roe',              'PERCENTILE', 0.10, 'HIGHER_IS_BETTER', 2, true, 'v1.1', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'margin_trend',     'TREND',      0.10, 'HIGHER_IS_BETTER', 3, true, 'v1.1', true from score_categories where category_key = 'PROFITABILITY';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'net_debt_to_ebitda',   'PERCENTILE', 0.25, 'LOWER_IS_BETTER',   2, true, 'v1.1', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'debt_to_equity',       'PERCENTILE', 0.15, 'LOWER_IS_BETTER',   2, true, 'v1.1', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'current_ratio',        'PERCENTILE', 0.15, 'OPTIMAL_RANGE',     2, true, 'v1.1', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'interest_coverage',    'PERCENTILE', 0.20, 'HIGHER_IS_BETTER',  2, true, 'v1.1', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'fcf_margin',           'PERCENTILE', 0.15, 'HIGHER_IS_BETTER',  2, true, 'v1.1', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'debt_trend',           'TREND',      0.10, 'LOWER_IS_BETTER',   3, true, 'v1.1', true from score_categories where category_key = 'FINANCIAL_HEALTH';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'pe',            'PERCENTILE', 0.20, 'LOWER_IS_BETTER', 1, true, 'v1.1', true from score_categories where category_key = 'VALUATION'
union all
select id, 'forward_pe',    'PERCENTILE', 0.15, 'LOWER_IS_BETTER', 1, true, 'v1.1', true from score_categories where category_key = 'VALUATION'
union all
select id, 'ev_ebitda',     'PERCENTILE', 0.20, 'LOWER_IS_BETTER', 1, true, 'v1.1', true from score_categories where category_key = 'VALUATION'
union all
select id, 'ev_sales',      'PERCENTILE', 0.15, 'LOWER_IS_BETTER', 1, true, 'v1.1', true from score_categories where category_key = 'VALUATION'
union all
select id, 'price_to_fcf',  'PERCENTILE', 0.15, 'LOWER_IS_BETTER', 1, true, 'v1.1', true from score_categories where category_key = 'VALUATION'
union all
select id, 'fcf_yield',     'PERCENTILE', 0.15, 'HIGHER_IS_BETTER', 1, true, 'v1.1', true from score_categories where category_key = 'VALUATION';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'roic',                 'PERCENTILE', 0.35, 'HIGHER_IS_BETTER', 2, true, 'v1.1', true from score_categories where category_key = 'CAPITAL_ALLOCATION'
union all
select id, 'share_count_trend',    'TREND',      0.25, 'LOWER_IS_BETTER',  3, true, 'v1.1', true from score_categories where category_key = 'CAPITAL_ALLOCATION'
union all
select id, 'net_debt_trend',       'TREND',      0.20, 'LOWER_IS_BETTER',  3, true, 'v1.1', true from score_categories where category_key = 'CAPITAL_ALLOCATION'
union all
select id, 'fcf_reinvestment_rate','RATIO',      0.20, 'OPTIMAL_RANGE',    2, true, 'v1.1', true from score_categories where category_key = 'CAPITAL_ALLOCATION';

-- The only substantive change in this version: minimum_data_points 5 -> 4.
insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'gross_margin_stability', 'TREND',      0.35, 'HIGHER_IS_BETTER', 4, true, 'v1.1', true from score_categories where category_key = 'COMPETITIVE_ADVANTAGE'
union all
select id, 'roic_persistence',       'TREND',      0.35, 'HIGHER_IS_BETTER', 4, true, 'v1.1', true from score_categories where category_key = 'COMPETITIVE_ADVANTAGE'
union all
select id, 'rd_intensity',           'RATIO',      0.30, 'OPTIMAL_RANGE',    2, true, 'v1.1', true from score_categories where category_key = 'COMPETITIVE_ADVANTAGE';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'guidance_credibility',  'COMPOSITE', 0.50, 'HIGHER_IS_BETTER', 4, false, 'v1.1', true from score_categories where category_key = 'MANAGEMENT'
union all
select id, 'share_dilution_trend',  'TREND',     0.30, 'LOWER_IS_BETTER',  3, false, 'v1.1', true from score_categories where category_key = 'MANAGEMENT'
union all
select id, 'insider_ownership',     'PERCENTILE',0.20, 'HIGHER_IS_BETTER', 1, false, 'v1.1', true from score_categories where category_key = 'MANAGEMENT';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'eps_surprise_percent',     'LINEAR', 0.30, 'HIGHER_IS_BETTER', 1, false, 'v1.1', true from score_categories where category_key = 'EARNINGS_MOMENTUM'
union all
select id, 'revenue_surprise_percent', 'LINEAR', 0.25, 'HIGHER_IS_BETTER', 1, false, 'v1.1', true from score_categories where category_key = 'EARNINGS_MOMENTUM'
union all
select id, 'estimate_revision_trend',  'TREND',  0.25, 'HIGHER_IS_BETTER', 2, false, 'v1.1', true from score_categories where category_key = 'EARNINGS_MOMENTUM'
union all
select id, 'guidance_direction_score', 'COMPOSITE', 0.20, 'HIGHER_IS_BETTER', 1, false, 'v1.1', true from score_categories where category_key = 'EARNINGS_MOMENTUM';

-- Retire v1.0: past category_scores/fundamental_scores rows calculated under
-- v1.0 remain in the database untouched (calculation_version='v1.0'), but
-- v1.0 rules are no longer active so getActiveRules('v1.1') — now what
-- SCORING_VERSION resolves to — is the only version driving new scoring runs.
update score_rules set active = false where version = 'v1.0';
