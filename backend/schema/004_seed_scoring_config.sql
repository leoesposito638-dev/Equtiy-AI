-- ============================================================================
-- Equity AI — Seed: Scoring Configuration (v1.0)
-- These are *configuration rows*, not application code. Changing the model
-- means inserting new score_rules with version 'v1.1' and flipping `active`
-- — never editing scoring logic in TypeScript. This is what makes past
-- scores reproducible under the version they were calculated with.
-- ============================================================================

insert into score_categories (category_key, name, description, default_weight, is_active) values
  ('GROWTH',                'Growth',                 'Revenue and earnings growth, historical and forward-looking.', 0.16, true),
  ('PROFITABILITY',         'Profitability',           'Margins and returns on capital, absolute and peer-relative.',   0.16, true),
  ('FINANCIAL_HEALTH',      'Financial Health',        'Leverage, liquidity, and balance sheet resilience.',            0.14, true),
  ('VALUATION',             'Valuation',                'Price paid relative to growth, quality, and history.',          0.14, true),
  ('CAPITAL_ALLOCATION',    'Capital Allocation',       'Quality of decisions made with generated cash.',                0.10, true),
  ('COMPETITIVE_ADVANTAGE', 'Competitive Advantage',    'Evidence-based durability of the business model.',              0.12, true),
  ('MANAGEMENT',            'Management',               'Execution track record and alignment with shareholders.',       0.08, true),
  ('EARNINGS_MOMENTUM',     'Earnings Momentum',        'Recent surprises, revisions, and guidance direction.',          0.10, true);

-- ----------------------------------------------------------------------------
-- GROWTH v1.0 — conceptual weights from the product brief
-- ----------------------------------------------------------------------------
insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'revenue_growth_yoy', 'PERCENTILE', 0.30, 'HIGHER_IS_BETTER', 2, true, 'v1.0', true from score_categories where category_key = 'GROWTH'
union all
select id, 'revenue_cagr_3y',    'PERCENTILE', 0.20, 'HIGHER_IS_BETTER', 4, true, 'v1.0', true from score_categories where category_key = 'GROWTH'
union all
select id, 'eps_growth_yoy',     'PERCENTILE', 0.20, 'HIGHER_IS_BETTER', 2, true, 'v1.0', true from score_categories where category_key = 'GROWTH'
union all
select id, 'eps_cagr',           'PERCENTILE', 0.15, 'HIGHER_IS_BETTER', 4, true, 'v1.0', true from score_categories where category_key = 'GROWTH'
union all
select id, 'growth_acceleration','TREND',      0.15, 'HIGHER_IS_BETTER', 3, true, 'v1.0', true from score_categories where category_key = 'GROWTH';

-- ----------------------------------------------------------------------------
-- PROFITABILITY v1.0
-- ----------------------------------------------------------------------------
insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'gross_margin',     'PERCENTILE', 0.20, 'HIGHER_IS_BETTER', 2, true, 'v1.0', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'operating_margin', 'PERCENTILE', 0.25, 'HIGHER_IS_BETTER', 2, true, 'v1.0', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'net_margin',       'PERCENTILE', 0.15, 'HIGHER_IS_BETTER', 2, true, 'v1.0', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'roic',             'PERCENTILE', 0.20, 'HIGHER_IS_BETTER', 2, true, 'v1.0', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'roe',              'PERCENTILE', 0.10, 'HIGHER_IS_BETTER', 2, true, 'v1.0', true from score_categories where category_key = 'PROFITABILITY'
union all
select id, 'margin_trend',     'TREND',      0.10, 'HIGHER_IS_BETTER', 3, true, 'v1.0', true from score_categories where category_key = 'PROFITABILITY';

-- ----------------------------------------------------------------------------
-- FINANCIAL_HEALTH v1.0
-- ----------------------------------------------------------------------------
insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'net_debt_to_ebitda',   'PERCENTILE', 0.25, 'LOWER_IS_BETTER',   2, true, 'v1.0', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'debt_to_equity',       'PERCENTILE', 0.15, 'LOWER_IS_BETTER',   2, true, 'v1.0', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'current_ratio',        'PERCENTILE', 0.15, 'OPTIMAL_RANGE',     2, true, 'v1.0', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'interest_coverage',    'PERCENTILE', 0.20, 'HIGHER_IS_BETTER',  2, true, 'v1.0', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'fcf_margin',           'PERCENTILE', 0.15, 'HIGHER_IS_BETTER',  2, true, 'v1.0', true from score_categories where category_key = 'FINANCIAL_HEALTH'
union all
select id, 'debt_trend',           'TREND',      0.10, 'LOWER_IS_BETTER',   3, true, 'v1.0', true from score_categories where category_key = 'FINANCIAL_HEALTH';

-- ----------------------------------------------------------------------------
-- VALUATION v1.0 — always contextualized, never a bare "low P/E is good"
-- ----------------------------------------------------------------------------
insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'pe',            'PERCENTILE', 0.20, 'LOWER_IS_BETTER', 1, true, 'v1.0', true from score_categories where category_key = 'VALUATION'
union all
select id, 'forward_pe',    'PERCENTILE', 0.15, 'LOWER_IS_BETTER', 1, true, 'v1.0', true from score_categories where category_key = 'VALUATION'
union all
select id, 'ev_ebitda',     'PERCENTILE', 0.20, 'LOWER_IS_BETTER', 1, true, 'v1.0', true from score_categories where category_key = 'VALUATION'
union all
select id, 'ev_sales',      'PERCENTILE', 0.15, 'LOWER_IS_BETTER', 1, true, 'v1.0', true from score_categories where category_key = 'VALUATION'
union all
select id, 'price_to_fcf',  'PERCENTILE', 0.15, 'LOWER_IS_BETTER', 1, true, 'v1.0', true from score_categories where category_key = 'VALUATION'
union all
select id, 'fcf_yield',     'PERCENTILE', 0.15, 'HIGHER_IS_BETTER', 1, true, 'v1.0', true from score_categories where category_key = 'VALUATION';

-- CAPITAL_ALLOCATION / COMPETITIVE_ADVANTAGE / MANAGEMENT / EARNINGS_MOMENTUM
-- v1.0 rule sets are intentionally lighter-weight to start — see
-- src/scoring/categoryScorers/*.ts for the metrics each currently consumes.
-- Extend these with more score_rules rows (same pattern as above) as more
-- data becomes available; no code change required.
insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'roic',                 'PERCENTILE', 0.35, 'HIGHER_IS_BETTER', 2, true, 'v1.0', true from score_categories where category_key = 'CAPITAL_ALLOCATION'
union all
select id, 'share_count_trend',    'TREND',      0.25, 'LOWER_IS_BETTER',  3, true, 'v1.0', true from score_categories where category_key = 'CAPITAL_ALLOCATION'
union all
select id, 'net_debt_trend',       'TREND',      0.20, 'LOWER_IS_BETTER',  3, true, 'v1.0', true from score_categories where category_key = 'CAPITAL_ALLOCATION'
union all
select id, 'fcf_reinvestment_rate','RATIO',      0.20, 'OPTIMAL_RANGE',    2, true, 'v1.0', true from score_categories where category_key = 'CAPITAL_ALLOCATION';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'gross_margin_stability', 'TREND',      0.35, 'HIGHER_IS_BETTER', 5, true, 'v1.0', true from score_categories where category_key = 'COMPETITIVE_ADVANTAGE'
union all
select id, 'roic_persistence',       'TREND',      0.35, 'HIGHER_IS_BETTER', 5, true, 'v1.0', true from score_categories where category_key = 'COMPETITIVE_ADVANTAGE'
union all
select id, 'rd_intensity',           'RATIO',      0.30, 'OPTIMAL_RANGE',    2, true, 'v1.0', true from score_categories where category_key = 'COMPETITIVE_ADVANTAGE';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'guidance_credibility',  'COMPOSITE', 0.50, 'HIGHER_IS_BETTER', 4, false, 'v1.0', true from score_categories where category_key = 'MANAGEMENT'
union all
select id, 'share_dilution_trend',  'TREND',     0.30, 'LOWER_IS_BETTER',  3, false, 'v1.0', true from score_categories where category_key = 'MANAGEMENT'
union all
select id, 'insider_ownership',     'PERCENTILE',0.20, 'HIGHER_IS_BETTER', 1, false, 'v1.0', true from score_categories where category_key = 'MANAGEMENT';

insert into score_rules (category_id, metric_name, rule_type, weight, direction, minimum_data_points, sector_specific, version, active)
select id, 'eps_surprise_percent',     'LINEAR', 0.30, 'HIGHER_IS_BETTER', 1, false, 'v1.0', true from score_categories where category_key = 'EARNINGS_MOMENTUM'
union all
select id, 'revenue_surprise_percent', 'LINEAR', 0.25, 'HIGHER_IS_BETTER', 1, false, 'v1.0', true from score_categories where category_key = 'EARNINGS_MOMENTUM'
union all
select id, 'estimate_revision_trend',  'TREND',  0.25, 'HIGHER_IS_BETTER', 2, false, 'v1.0', true from score_categories where category_key = 'EARNINGS_MOMENTUM'
union all
select id, 'guidance_direction_score', 'COMPOSITE', 0.20, 'HIGHER_IS_BETTER', 1, false, 'v1.0', true from score_categories where category_key = 'EARNINGS_MOMENTUM';
