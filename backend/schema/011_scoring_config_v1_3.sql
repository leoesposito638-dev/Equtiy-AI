-- ============================================================================
-- Equity AI — Scoring Configuration v1.3 (Milestone 15C Part 3)
--
-- Every rule below is a BYTE-IDENTICAL copy of its v1.2 (and v1.1)
-- counterpart — same metric_name, rule_type, weight, direction,
-- minimum_data_points, sector_specific. Nothing about the scoring MODEL
-- changed this milestone (explicitly out of scope per the ticket: "Do
-- NOT... change weights"). v1.3 exists purely so a fresh
-- calculateFundamentalScore() run, picking up the real DATA changes from
-- Milestone 15C Parts 1-2 (the FMP-sourced debt metrics under their own
-- isolated metric_names, and the valuation-benchmark population attempt),
-- gets its own calculation_version — never overwriting or retiring v1.1's
-- or v1.2's stored fundamental_scores/category_scores rows, so both stay
-- exactly reproducible.
--
-- Same convention Milestone 15B established for v1.1 -> v1.2: v1.1 and
-- v1.2's rules are left untouched and still `active=true` here — the
-- ticket's "do not overwrite or delete v1.0/v1.1 rows" instruction is read
-- to cover v1.2 too by the same logic (nothing says "except the version
-- immediately before this one"), so all of v1.1/v1.2/v1.3 stay
-- concurrently active; only the SCORING_VERSION constant in
-- scoringEngine.ts (bumped to 'v1.3' this milestone) decides which one a
-- NEW calculateFundamentalScore() run actually uses, since getActiveRules()
-- is always called with one explicit version string.
--
-- Applied against the live database via
-- src/localDev/milestone15cSeedScoreRulesV13.ts (this project's DB writes
-- in this environment go through the Supabase JS client, not psql, and
-- this is DML — a plain INSERT — not DDL) — this file exists so the
-- schema/ directory keeps its established one-file-per-change convention
-- and this change is reviewable/reproducible from source control.
-- ============================================================================

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'revenue_growth_yoy', 'PERCENTILE', 0.30, 'HIGHER_IS_BETTER', 2, true, 'v1.3', true from score_categories where category_key = 'GROWTH'
union all
select id, 'revenue_cagr_3y',    'PERCENTILE', 0.20, 'HIGHER_IS_BETTER', 4, true, 'v1.3', true from score_categories where category_key = 'GROWTH'
union all
select id, 'eps_growth_yoy',     'PERCENTILE', 0.20, 'HIGHER_IS_BETTER', 2, true, 'v1.3', true from score_categories where category_key = 'GROWTH'
union all
select id, 'eps_cagr',           'PERCENTILE', 0.15, 'HIGHER_IS_BETTER', 4, true, 'v1.3', true from score_categories where category_key = 'GROWTH'
union all
select id, 'growth_acceleration','TREND',      0.15, 'HIGHER_IS_BETTER', 3, true, 'v1.3', true from score_categories where category_key = 'GROWTH';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'gross_margin',     'PERCENTILE', 0.20, 'HIGHER_IS_BETTER', 2, true, 'v1.3', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'operating_margin', 'PERCENTILE', 0.25, 'HIGHER_IS_BETTER', 2, true, 'v1.3', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'net_margin',       'PERCENTILE', 0.15, 'HIGHER_IS_BETTER', 2, true, 'v1.3', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'roic',             'PERCENTILE', 0.20, 'HIGHER_IS_BETTER', 2, true, 'v1.3', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'roe',              'PERCENTILE', 0.10, 'HIGHER_IS_BETTER', 2, true, 'v1.3', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'margin_trend',     'TREND',      0.10, 'HIGHER_IS_BETTER', 3, true, 'v1.3', true from score_categories where category_key = 'PROFITABILITY';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'net_debt_to_ebitda',   'PERCENTILE', 0.25, 'LOWER_IS_BETTER',   2, true, 'v1.3', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'debt_to_equity',       'PERCENTILE', 0.15, 'LOWER_IS_BETTER',   2, true, 'v1.3', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'current_ratio',        'PERCENTILE', 0.15, 'OPTIMAL_RANGE',     2, true, 'v1.3', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'interest_coverage',    'PERCENTILE', 0.20, 'HIGHER_IS_BETTER',  2, true, 'v1.3', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'fcf_margin',           'PERCENTILE', 0.15, 'HIGHER_IS_BETTER',  2, true, 'v1.3', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'debt_trend',           'TREND',      0.10, 'LOWER_IS_BETTER',   3, true, 'v1.3', true from score_categories where category_key = 'FINANCIAL_HEALTH';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'pe',            'PERCENTILE', 0.20, 'LOWER_IS_BETTER', 1, true, 'v1.3', true from score_categories where category_key = 'VALUATION'
union all
select id, 'forward_pe',    'PERCENTILE', 0.15, 'LOWER_IS_BETTER', 1, true, 'v1.3', true from score_categories where category_key = 'VALUATION'
union all
select id, 'ev_ebitda',     'PERCENTILE', 0.20, 'LOWER_IS_BETTER', 1, true, 'v1.3', true from score_categories where category_key = 'VALUATION'
union all
select id, 'ev_sales',      'PERCENTILE', 0.15, 'LOWER_IS_BETTER', 1, true, 'v1.3', true from score_categories where category_key = 'VALUATION'
union all
select id, 'price_to_fcf',  'PERCENTILE', 0.15, 'LOWER_IS_BETTER', 1, true, 'v1.3', true from score_categories where category_key = 'VALUATION'
union all
select id, 'fcf_yield',     'PERCENTILE', 0.15, 'HIGHER_IS_BETTER', 1, true, 'v1.3', true from score_categories where category_key = 'VALUATION';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'roic',                 'PERCENTILE', 0.35, 'HIGHER_IS_BETTER', 2, true, 'v1.3', true from score_categories where category_key = 'CAPITAL_ALLOCATION'
union all
select id, 'share_count_trend',    'TREND',      0.25, 'LOWER_IS_BETTER',  3, true, 'v1.3', true from score_categories where category_key = 'CAPITAL_ALLOCATION'
union all
select id, 'net_debt_trend',       'TREND',      0.20, 'LOWER_IS_BETTER',  3, true, 'v1.3', true from score_categories where category_key = 'CAPITAL_ALLOCATION'
union all
select id, 'fcf_reinvestment_rate','RATIO',      0.20, 'OPTIMAL_RANGE',    2, true, 'v1.3', true from score_categories where category_key = 'CAPITAL_ALLOCATION';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'gross_margin_stability', 'TREND',      0.35, 'HIGHER_IS_BETTER', 4, true, 'v1.3', true from score_categories where category_key = 'COMPETITIVE_ADVANTAGE'
union all
select id, 'roic_persistence',       'TREND',      0.35, 'HIGHER_IS_BETTER', 4, true, 'v1.3', true from score_categories where category_key = 'COMPETITIVE_ADVANTAGE'
union all
select id, 'rd_intensity',           'RATIO',      0.30, 'OPTIMAL_RANGE',    2, true, 'v1.3', true from score_categories where category_key = 'COMPETITIVE_ADVANTAGE';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'guidance_credibility',  'COMPOSITE', 0.50, 'HIGHER_IS_BETTER', 4, false, 'v1.3', true from score_categories where category_key = 'MANAGEMENT'
union all
select id, 'share_dilution_trend',  'TREND',     0.30, 'LOWER_IS_BETTER',  3, false, 'v1.3', true from score_categories where category_key = 'MANAGEMENT'
union all
select id, 'insider_ownership',     'PERCENTILE',0.20, 'HIGHER_IS_BETTER', 1, false, 'v1.3', true from score_categories where category_key = 'MANAGEMENT';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'eps_surprise_percent',     'LINEAR', 0.30, 'HIGHER_IS_BETTER', 1, false, 'v1.3', true from score_categories where category_key = 'EARNINGS_MOMENTUM'
union all
select id, 'revenue_surprise_percent', 'LINEAR', 0.25, 'HIGHER_IS_BETTER', 1, false, 'v1.3', true from score_categories where category_key = 'EARNINGS_MOMENTUM'
union all
select id, 'estimate_revision_trend',  'TREND',  0.25, 'HIGHER_IS_BETTER', 2, false, 'v1.3', true from score_categories where category_key = 'EARNINGS_MOMENTUM'
union all
select id, 'guidance_direction_score', 'COMPOSITE', 0.20, 'HIGHER_IS_BETTER', 1, false, 'v1.3', true from score_categories where category_key = 'EARNINGS_MOMENTUM';

-- No v1.1 deactivation here, deliberately — see header comment. Both
-- versions stay active=true; SCORING_VERSION alone selects which one new
-- scoring runs use.
