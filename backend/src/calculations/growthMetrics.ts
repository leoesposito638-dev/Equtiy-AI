// ============================================================================
// Equity AI — GROWTH Category Calculated Metrics (v1.0)
//
// Implements backend/docs/growth-metrics-v1.0-spec.md exactly. Every
// function here composes the existing, UNMODIFIED generic primitives from
// ./metrics.ts (pctChange, cagr, trend) — none of their math is
// reimplemented or altered.
//
// IMPORTANT — do not confuse this file's inputs with scoring history:
// the arrays these functions take are RAW `financial_metrics` observations
// (how many periods are needed to compute ONE current value). They are NOT
// `MetricInput.history` (src/scoring/categoryScorers/types.ts) — that is a
// time series of PAST CALCULATED-METRIC values, consumed only by
// scoreCategory.ts, and this file neither reads nor writes it. See
// growth-metrics-v1.0-spec.md §0.
//
// Every function returns { value, reason? }: `value` is exactly what would
// be persisted to calculated_metrics.value (null = "no row written", same
// convention as normalizeLineItem's null-metric case); `reason` is
// diagnostic only, for reporting/logging, never persisted.
// ============================================================================

import { pctChange, cagr, trend, CALCULATION_VERSION } from "./metrics";

export { CALCULATION_VERSION };

export interface GrowthMetricResult {
  value: number | null;
  reason?: string;
}

function missing(label: string): GrowthMetricResult {
  return { value: null, reason: `${label} is missing.` };
}

/** revenue_growth_yoy — spec §1. */
export function calculateRevenueGrowthYoy(
  currentRevenue: number | null,
  previousRevenue: number | null
): GrowthMetricResult {
  if (currentRevenue === null) return missing("current period revenue");
  if (previousRevenue === null) return missing("previous period revenue");
  if (previousRevenue === 0) return { value: null, reason: "previous period revenue is zero." };
  return { value: pctChange(currentRevenue, previousRevenue) };
}

/** revenue_cagr_3y — spec §2. Requires ALL 4 periods present, not just the
 *  two endpoints cagr() itself touches — a deliberately stricter gate than
 *  the bare formula. `periods` is ordered [t, t-1, t-2, t-3] (current first). */
export function calculateRevenueCagr3y(periods: Array<number | null>): GrowthMetricResult {
  return calculateCagr3yWithFullHistoryRequired(periods, "revenue");
}

/** eps_growth_yoy — spec §3 (V1 rule): only computed when BOTH periods are
 *  strictly positive. No dollar-change fallback. */
export function calculateEpsGrowthYoy(
  currentEps: number | null,
  previousEps: number | null
): GrowthMetricResult {
  if (currentEps === null) return missing("current period eps");
  if (previousEps === null) return missing("previous period eps");
  if (currentEps <= 0 || previousEps <= 0) {
    return {
      value: null,
      reason: `eps_growth_yoy requires both current and previous EPS to be strictly positive (V1 rule) — got current=${currentEps}, previous=${previousEps}.`,
    };
  }
  return { value: pctChange(currentEps, previousEps) };
}

/** eps_cagr — spec §4. Requires ALL 4 periods present; negative/zero
 *  endpoints are rejected entirely by the existing cagr() guard. */
export function calculateEpsCagr(periods: Array<number | null>): GrowthMetricResult {
  return calculateCagr3yWithFullHistoryRequired(periods, "eps");
}

function calculateCagr3yWithFullHistoryRequired(
  periods: Array<number | null>,
  label: string
): GrowthMetricResult {
  if (periods.length !== 4) {
    return { value: null, reason: `${label}_cagr_3y requires exactly 4 periods, got ${periods.length}.` };
  }
  const missingIndex = periods.findIndex((v) => v === null);
  if (missingIndex !== -1) {
    return {
      value: null,
      reason: `${label}_cagr_3y requires all 4 annual periods; period at index ${missingIndex} is missing.`,
    };
  }
  const typed = periods as number[];
  const current = typed[0]!;
  const start = typed[3]!;
  const value = cagr(current, start, 3);
  if (value === null) {
    return { value: null, reason: `${label}_cagr_3y: endpoint value <= 0 (current=${current}, 3y-ago=${start}) — cagr() is undefined.` };
  }
  return { value };
}

/** growth_acceleration — spec §5, Candidate B. Underlying series: revenue.
 *  `revenuePeriods` is ordered [t, t-1, t-2, t-3] (current first, matching
 *  calculateRevenueCagr3y's convention). Returns a trend/slope value — NOT
 *  a percentage growth rate; see spec §5 for the unit rationale. */
export function calculateGrowthAcceleration(revenuePeriods: Array<number | null>): GrowthMetricResult {
  if (revenuePeriods.length !== 4) {
    return { value: null, reason: `growth_acceleration requires exactly 4 revenue periods, got ${revenuePeriods.length}.` };
  }
  const missingIndex = revenuePeriods.findIndex((v) => v === null);
  if (missingIndex !== -1) {
    return {
      value: null,
      reason: `growth_acceleration requires all 4 annual revenue periods; period at index ${missingIndex} is missing.`,
    };
  }
  const typed = revenuePeriods as number[];
  const t = typed[0]!;
  const t1 = typed[1]!;
  const t2 = typed[2]!;
  const t3 = typed[3]!;
  const g1 = pctChange(t2, t3); // growth(t-2 vs t-3)
  const g2 = pctChange(t1, t2); // growth(t-1 vs t-2)
  const g3 = pctChange(t, t1); // growth(t vs t-1)
  if (g1 === null || g2 === null || g3 === null) {
    return {
      value: null,
      reason: `growth_acceleration: one of the three YoY growth rates could not be computed (g1=${g1}, g2=${g2}, g3=${g3}) — likely a zero-revenue denominator year.`,
    };
  }
  const slope = trend([g1, g2, g3]);
  if (slope === null) {
    return { value: null, reason: "growth_acceleration: trend() returned null over [g1, g2, g3]." };
  }
  return { value: slope };
}
