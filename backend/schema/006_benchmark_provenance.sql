-- ============================================================================
-- Equity AI — Milestone 5: Benchmark Provenance Infrastructure
--
-- Adds exactly what Milestone 4B/5's approved design requires to
-- metric_benchmarks (benchmark_type, benchmark_version, calculated_at) and
-- one nullable column to category_scores (rule_provenance) so a future
-- scoring run can record which of SECTOR / MARKET_WIDE / TREND_ONLY /
-- UNAVAILABLE produced each rule's contribution. No other schema changes.
--
-- metric_benchmarks has zero rows as of this migration (never populated) —
-- confirmed directly against the live database before writing this file —
-- so these ADD COLUMN ... NOT NULL statements need no default/backfill.
--
-- NOTE ON APPLYING THIS FILE: like schema/001-005, this is SQL to be run
-- directly against Postgres (psql / Supabase SQL editor / migration
-- runner) — the application only ever talks to Supabase through the
-- @supabase/supabase-js REST client, which cannot execute DDL. This file
-- has NOT been applied to the live database as part of this milestone;
-- see the Milestone 5 report for why, and what was verified instead
-- (read-only, against the existing schema).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- metric_benchmarks: add provenance/versioning columns
-- ----------------------------------------------------------------------------
alter table metric_benchmarks
  add column benchmark_type    text not null check (benchmark_type in ('SECTOR', 'MARKET_WIDE')),
  add column benchmark_version text not null,
  add column calculated_at     timestamptz not null default now();

comment on column metric_benchmarks.benchmark_type is
  'SECTOR or MARKET_WIDE — which of the two approved V1 tiers this row represents. No INDUSTRY/SUB_INDUSTRY tier in V1.';
comment on column metric_benchmarks.benchmark_version is
  'Bumped only when benchmark METHODOLOGY changes (thresholds, outlier handling, formula) — never on a routine data refresh. Mirrors calculated_metrics.calculation_version''s existing convention.';
comment on column metric_benchmarks.calculated_at is
  'When this specific distribution was computed from real calculated_metrics data — distinct from created_at (row insert time), which can differ once/if snapshots are ever backfilled.';

-- ----------------------------------------------------------------------------
-- Uniqueness: the old constraint is insufficient for MARKET_WIDE rows.
-- Postgres treats NULL <> NULL for uniqueness purposes, so a plain
-- unique(metric_name, benchmark_type, sector, period_end, benchmark_version)
-- would NOT prevent two different MARKET_WIDE rows (both sector = NULL) for
-- the same metric/period/version from coexisting. A unique index over
-- coalesce(sector, '') closes that gap; the plain constraint is dropped in
-- favor of it.
-- ----------------------------------------------------------------------------
alter table metric_benchmarks drop constraint uq_metric_benchmarks;

create unique index uq_metric_benchmarks_v2 on metric_benchmarks (
  metric_name,
  benchmark_type,
  coalesce(sector, ''),
  period_end,
  benchmark_version
);

-- ----------------------------------------------------------------------------
-- category_scores: nullable column to eventually record which provenance
-- tier produced each contributing rule's score. Additive, no data migration
-- needed (table has zero rows — no real scoring run has ever happened).
-- Not written to by anything in this milestone.
-- ----------------------------------------------------------------------------
alter table category_scores
  add column rule_provenance jsonb;

comment on column category_scores.rule_provenance is
  'Map of metric_name -> "SECTOR" | "MARKET_WIDE" | "TREND_ONLY" | "UNAVAILABLE", one entry per rule that contributed to this category score. Nullable: not populated until a scoring run that exposes provenance actually writes it (see Milestone 5 report for the proposed, not-yet-implemented scoreCategory.ts integration point).';
