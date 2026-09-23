// ============================================================================
// Equity AI — Pure shaping helpers for the Supabase-backed ScoringRepo
//
// Row-mapping and MetricInput/benchmark-map construction, factored out of
// supabaseScoringRepo.ts so it's unit-testable without a database — same
// split this codebase already uses everywhere else (validators/normalizers
// vs supabaseIngestionRepo.ts; growthMetrics.ts vs supabaseGrowthMetricsRepo.ts).
// ============================================================================

import type { MetricBenchmark, ScoreCategory, ScoreRule } from "../types/domain";
import type { MetricInput } from "./categoryScorers/types";

export interface CalculatedMetricRow {
  periodEnd: string;
  value: number;
}

/**
 * Builds a MetricInput from calculated_metrics rows for one metric_name.
 * `rowsMostRecentFirst` must be ordered descending by period_end (the
 * natural `ORDER BY period_end DESC` shape) — this function is what
 * reorders them into MetricInput.history's documented convention
 * (`categoryScorers/types.ts`: "most recent last").
 *
 * IMPORTANT — this is raw-data-agnostic: it only ever sees past VALUES OF
 * THE CALCULATED METRIC ITSELF (calculated_metrics rows), never raw
 * financial_metrics. Keeping that boundary is the whole point of this file
 * existing separately from src/calculations/*.
 */
export function buildMetricInput(metricName: string, rowsMostRecentFirst: CalculatedMetricRow[]): MetricInput {
  const oldestFirst = [...rowsMostRecentFirst].reverse();
  const latestValue = rowsMostRecentFirst.length > 0 ? rowsMostRecentFirst[0]!.value : null;
  return {
    metricName,
    latestValue,
    history: oldestFirst.map((r) => r.value),
  };
}

export interface DbScoreCategoryRow {
  id: string;
  category_key: ScoreCategory["categoryKey"];
  name: string;
  default_weight: number;
  is_active: boolean;
}

export function mapScoreCategoryRow(row: DbScoreCategoryRow): ScoreCategory {
  return {
    id: row.id,
    categoryKey: row.category_key,
    name: row.name,
    defaultWeight: row.default_weight,
    isActive: row.is_active,
  };
}

export interface DbScoreRuleRow {
  id: string;
  category_id: string;
  metric_name: string;
  rule_type: ScoreRule["ruleType"];
  weight: number;
  direction: ScoreRule["direction"];
  minimum_data_points: number;
  sector_specific: boolean;
  version: string;
  active: boolean;
}

export function mapScoreRuleRow(row: DbScoreRuleRow): ScoreRule {
  return {
    id: row.id,
    categoryId: row.category_id,
    metricName: row.metric_name,
    ruleType: row.rule_type,
    weight: row.weight,
    direction: row.direction,
    minimumDataPoints: row.minimum_data_points,
    sectorSpecific: row.sector_specific,
    version: row.version,
    active: row.active,
  };
}

export interface DbMetricBenchmarkRow {
  metric_name: string;
  sector: string | null;
  industry: string | null;
  period_end: string;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  sample_size: number;
}

/**
 * Shapes metric_benchmarks rows into the Map<metricName, MetricBenchmark>
 * shape ScoringRepo.getBenchmarks must return. A metric with no matching
 * row simply has no entry — never a fabricated/default benchmark. Correctly
 * returns an empty map when `rows` is empty (metric_benchmarks currently has
 * zero rows in Supabase; this milestone does not populate it — see
 * requirement 9).
 */
export function buildBenchmarkMap(rows: DbMetricBenchmarkRow[], requestedNames: string[]): Map<string, MetricBenchmark> {
  const requested = new Set(requestedNames);
  const map = new Map<string, MetricBenchmark>();
  for (const row of rows) {
    if (!requested.has(row.metric_name)) continue;
    map.set(row.metric_name, {
      metricName: row.metric_name,
      sector: row.sector ?? undefined,
      industry: row.industry ?? undefined,
      periodEnd: row.period_end,
      p25: row.p25,
      median: row.median,
      p75: row.p75,
      p90: row.p90,
      sampleSize: row.sample_size,
    });
  }
  return map;
}
