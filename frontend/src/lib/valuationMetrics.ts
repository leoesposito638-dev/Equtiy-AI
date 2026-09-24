// ============================================================================
// The valuation multiples GET /companies/:id/valuation can return, per the
// existing backend route (companies.ts filters calculated_metrics on these
// 6 names). As of Milestone 15C, pe/forward_pe/ev_ebitda/ev_sales/
// price_to_fcf/fcf_yield are real for the 16 FMP-entitled companies (TTM,
// calculation_version 'v1.0-fmp'/'v1.0-fmp-forward') — a metric with no
// stored row (the other 14 companies) stays null, never fabricated.
// ============================================================================

import type { CalculatedMetricRow } from "./types";
import { formatMultiple, formatPercent } from "./formatters";

export const VALUATION_METRIC_NAMES = ["pe", "forward_pe", "ev_ebitda", "ev_sales", "price_to_fcf", "fcf_yield"] as const;

export const VALUATION_METRIC_LABELS: Record<(typeof VALUATION_METRIC_NAMES)[number], string> = {
  pe: "P/E",
  forward_pe: "Forward P/E",
  ev_ebitda: "EV / EBITDA",
  ev_sales: "EV / Sales",
  price_to_fcf: "Price / FCF",
  fcf_yield: "FCF Yield",
};

/** pe/forward_pe/ev_ebitda/ev_sales/price_to_fcf are stored as plain
 * multiples (e.g. 27.47 -> "27.5x"). fcf_yield is stored as a raw fraction
 * (backend/src/calculations/metrics.ts's fcfYield() and the FMP-ratio path
 * both compute fcf/marketCap with no *100 — confirmed live: NVDA's stored
 * value is 0.024..., not 2.4) so it needs *100 to read as a percentage. */
export const VALUATION_METRIC_FORMAT: Record<(typeof VALUATION_METRIC_NAMES)[number], "multiple" | "percent"> = {
  pe: "multiple",
  forward_pe: "multiple",
  ev_ebitda: "multiple",
  ev_sales: "multiple",
  price_to_fcf: "multiple",
  fcf_yield: "percent",
};

export interface ValuationMetricValue {
  metricName: (typeof VALUATION_METRIC_NAMES)[number];
  label: string;
  value: number | null;
  periodEnd: string | null;
}

export function formatValuationValue(m: Pick<ValuationMetricValue, "metricName" | "value">): string {
  if (m.value == null) return "";
  const format = VALUATION_METRIC_FORMAT[m.metricName];
  return format === "percent" ? formatPercent(m.value * 100) : formatMultiple(m.value);
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
