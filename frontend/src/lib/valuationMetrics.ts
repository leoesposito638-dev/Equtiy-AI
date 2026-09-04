// ============================================================================
// The valuation multiples GET /companies/:id/valuation can return, per the
// existing backend route (companies.ts filters calculated_metrics on these
// 6 names). Real-data verification (Milestone 11D-A) found 0/30 coverage
// for all 6 across the approved demo universe — no market-price/market-cap
// input has ever been ingested — so this section exists to preserve the
// product's Valuation concept honestly (UNAVAILABLE), not to compute or
// fabricate anything. A metric with no stored row stays null.
// ============================================================================

import type { CalculatedMetricRow } from "./types";

export const VALUATION_METRIC_NAMES = ["pe", "forward_pe", "ev_ebitda", "ev_sales", "price_to_fcf", "fcf_yield"] as const;

export const VALUATION_METRIC_LABELS: Record<(typeof VALUATION_METRIC_NAMES)[number], string> = {
  pe: "P/E",
  forward_pe: "Forward P/E",
  ev_ebitda: "EV / EBITDA",
  ev_sales: "EV / Sales",
  price_to_fcf: "Price / FCF",
  fcf_yield: "FCF Yield",
};

export interface ValuationMetricValue {
  metricName: (typeof VALUATION_METRIC_NAMES)[number];
  label: string;
  value: number | null;
  periodEnd: string | null;
}

export function latestValuationMetrics(rows: CalculatedMetricRow[]): ValuationMetricValue[] {
  return VALUATION_METRIC_NAMES.map((metricName) => {
    const forMetric = rows.filter((r) => r.metric_name === metricName && r.value !== null);
    const latest = forMetric.reduce<CalculatedMetricRow | null>((best, r) => {
      if (!best || r.period_end > best.period_end) return r;
      return best;
    }, null);
    return {
      metricName,
      label: VALUATION_METRIC_LABELS[metricName],
      value: latest ? latest.value : null,
      periodEnd: latest ? latest.period_end : null,
    };
  });
}
