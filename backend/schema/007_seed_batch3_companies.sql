-- ============================================================================
-- Equity AI — Milestone 6B Batch 3: new company identities
--
-- Adds the 4 previously-proposed-and-approved new Technology companies
-- (Milestone 6B) as identity-only rows, exactly matching schema/005's
-- pattern and scope: name/ticker/exchange/country/currency/sector/industry
-- only, no financial data. Real, verifiable public-company facts, not
-- fabricated.
--
-- NOTE: unlike schema/006 (DDL, which the app's REST client cannot run),
-- this file is DML (a plain INSERT) — the same statement was actually
-- executed live via the app's normal Supabase insert path
-- (src/localDev/provisionBatch3Companies.ts), not manually. This file
-- exists so the migration history stays complete and reproducible for
-- anyone rebuilding the database from schema/*.sql in order.
-- ============================================================================

insert into companies (name, ticker, exchange, country, currency, sector, industry, is_active) values
  ('Texas Instruments',        'TXN',  'NASDAQ', 'US', 'USD', 'Technology', 'Semiconductors',           true),
  ('Applied Materials',        'AMAT', 'NASDAQ', 'US', 'USD', 'Technology', 'Semiconductor Equipment',  true),
  ('Cisco Systems',            'CSCO', 'NASDAQ', 'US', 'USD', 'Technology', 'Communication Equipment',  true),
  ('International Business Machines', 'IBM', 'NYSE', 'US', 'USD', 'Technology', 'Information Technology Services', true)
on conflict (ticker, exchange) do nothing;
