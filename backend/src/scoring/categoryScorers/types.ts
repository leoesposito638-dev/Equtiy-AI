// ============================================================================
// Shared types for category scorers
// ============================================================================

import type { CategoryScore, MetricBenchmark, ScoreRule } from "../../types/domain";

/** A resolved metric value for one company at one point in time, plus enough
 * history to compute trend-based rules. */
export interface MetricInput {
  metricName: string;
  latestValue: number | null;
  history: Array<number | null>; // most recent last; used for TREND rule types
}

export interface CategoryScoringContext {
  companyId: string;
  categoryId: string;
  categoryKey: CategoryScore["categoryKey"];
  rules: ScoreRule[];
  metrics: Map<string, MetricInput>;
  benchmarks: Map<string, MetricBenchmark>; // keyed by metric_name, already resolved to this company's sector/industry + period
  calculationVersion: string;
}
