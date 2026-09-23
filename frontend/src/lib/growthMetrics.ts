// ============================================================================
// The 5 real GROWTH-category metrics (Milestone 10C) as calculated_metrics
// rows. A company can have several stored periods per metric — this picks
// only the most recent ANNUAL one per metric, matching how the backend's
// own scoring repo reads "latest value" (supabaseScoringRepo.getMetricInputs).
// A metric with no stored row stays null — never coerced to 0.
// ============================================================================

import type { CalculatedMetricRow } from "./types";

export const GROWTH_METRIC_NAMES = [
  "revenue_growth_yoy",
  "revenue_cagr_3y",
  "eps_growth_yoy",
  "eps_cagr",
  "growth_acceleration",
] as const;

export const GROWTH_METRIC_LABELS: Record<(typeof GROWTH_METRIC_NAMES)[number], string> = {
  revenue_growth_yoy: "Revenue Growth (YoY)",
  revenue_cagr_3y: "Revenue CAGR (3Y)",
  eps_growth_yoy: "EPS Growth (YoY)",
  eps_cagr: "EPS CAGR",
  growth_acceleration: "Growth Acceleration",
};

/** growth_acceleration is a trend/slope value, not a percentage growth rate
 *  (backend/src/calculations/growthMetrics.ts, calculateGrowthAcceleration
 *  doc comment) — every other GROWTH metric is a real percentage
 *  (pctChange/cagr both scale by 100). Suffixing growth_acceleration with
 *  "%" would misrepresent it, so its unit is left blank. */
export const GROWTH_METRIC_UNITS: Record<(typeof GROWTH_METRIC_NAMES)[number], string> = {
  revenue_growth_yoy: "%",
  revenue_cagr_3y: "%",
  eps_growth_yoy: "%",
  eps_cagr: "%",
  growth_acceleration: "",
};

export interface GrowthMetricValue {
  metricName: (typeof GROWTH_METRIC_NAMES)[number];
  label: string;
  unit: string;
  value: number | null;
  periodEnd: string | null;
}

export function latestGrowthMetrics(rows: CalculatedMetricRow[]): GrowthMetricValue[] {
  const annual = rows.filter((r) => r.period_type === "ANNUAL");
  return GROWTH_METRIC_NAMES.map((metricName) => {
    const forMetric = annual.filter((r) => r.metric_name === metricName && r.value !== null);
    const latest = forMetric.reduce<CalculatedMetricRow | null>((best, r) => {
      if (!best || r.period_end > best.period_end) return r;
      return best;
    }, null);
    return {
      metricName,
      label: GROWTH_METRIC_LABELS[metricName],
      unit: GROWTH_METRIC_UNITS[metricName],
      value: latest ? latest.value : null,
      periodEnd: latest ? latest.period_end : null,
    };
  });
}
