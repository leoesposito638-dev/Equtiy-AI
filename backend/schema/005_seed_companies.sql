-- ============================================================================
-- Equity AI — Seed: First 10 Companies (identity only)
--
-- IMPORTANT: this seeds `companies` identity fields only — name, ticker,
-- exchange, sector — which are static reference data, not financial facts.
-- It intentionally does NOT insert any rows into financial_metrics,
-- calculated_metrics, category_scores, or fundamental_scores. Those must be
-- populated by the ingestion pipeline (src/ingestion) from a real
-- FinancialDataProvider, then produced by the scoring engine. A company
-- with no ingested data will correctly show data_status = 'unavailable'
-- everywhere and will not receive a fundamental score — see
-- src/scoring/scoringEngine.ts.
-- ============================================================================

insert into companies (name, ticker, exchange, country, currency, sector, industry, is_active) values
  ('NVIDIA',        'NVDA',  'NASDAQ', 'US', 'USD', 'Technology',             'Semiconductors',            true),
  ('Microsoft',      'MSFT',  'NASDAQ', 'US', 'USD', 'Technology',             'Software',                  true),
  ('Apple',           'AAPL',  'NASDAQ', 'US', 'USD', 'Technology',             'Consumer Electronics',      true),
  ('Amazon',           'AMZN',  'NASDAQ', 'US', 'USD', 'Consumer Discretionary', 'Internet Retail',           true),
  ('Meta Platforms',    'META',  'NASDAQ', 'US', 'USD', 'Technology',             'Internet Content & Info',   true),
  ('Tesla',              'TSLA',  'NASDAQ', 'US', 'USD', 'Consumer Discretionary', 'Auto Manufacturers',       true),
  ('Spotify',             'SPOT',  'NYSE',   'LU', 'USD', 'Communication Services', 'Internet Content & Info',  true),
  ('ASML Holding',         'ASML',  'NASDAQ', 'NL', 'EUR', 'Technology',             'Semiconductor Equipment',  true),
  ('Novo Nordisk',          'NVO',   'NYSE',   'DK', 'DKK', 'Healthcare',             'Drug Manufacturers',       true),
  ('Alphabet',               'GOOGL', 'NASDAQ', 'US', 'USD', 'Technology',             'Internet Content & Info',  true)
on conflict (ticker, exchange) do nothing;
