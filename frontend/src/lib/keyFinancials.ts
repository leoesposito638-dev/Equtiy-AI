// ============================================================================
// Key Financials — the company page's curated, presentation-layer summary of
// real stored data (Demo Readiness milestone, ticket item D). Pulls from two
// existing, already-computed sources:
//   - financial_metrics (GET /companies/:id/financials) for the raw XBRL-
//     sourced line items (revenue, EPS, debt)
//   - calculated_metrics (GET /companies/:id/metrics) for the ratios already
//     computed by the scoring pipeline (margins, ROE, FCF, growth)
// No new math beyond picking the latest period per metric — never a fabricated
// or zero-substituted value. A metric with no stored row for this company is
// simply omitted, not shown as a placeholder tile — this section shows only
// what exists per company rather than a fixed layout across all 30.
// ============================================================================

import type { CalculatedMetricRow, FinancialMetricRow } from "./types";
import { formatCurrency, formatPercent, formatPerShare } from "./formatters";

export type KeyFinancialFormat = "currency" | "percent" | "pershare";

export interface KeyFinancialValue {
  key: string;
  label: string;
  value: number;
  periodEnd: string;
  format: KeyFinancialFormat;
}

function latestFinancial(rows: FinancialMetricRow[], metricName: string, periodType: FinancialMetricRow["period_type"]): FinancialMetricRow | null {
  const candidates = rows.filter((r) => r.metric_name === metricName && r.value !== null && r.period_type === periodType);
  return candidates.reduce<FinancialMetricRow | null>((best, r) => (!best || r.period_end > best.period_end ? r : best), null);
}

function latestCalculated(rows: CalculatedMetricRow[], metricName: string): CalculatedMetricRow | null {
  const candidates = rows.filter((r) => r.metric_name === metricName && r.value !== null);
  return candidates.reduce<CalculatedMetricRow | null>((best, r) => (!best || r.period_end > best.period_end ? r : best), null);
}

export function keyFinancials(financials: FinancialMetricRow[], metrics: CalculatedMetricRow[]): KeyFinancialValue[] {
  const entries: KeyFinancialValue[] = [];
  const push = (key: string, label: string, row: { value: number | null; period_end: string } | null, format: KeyFinancialFormat) => {
    if (row && row.value != null) entries.push({ key, label, value: row.value, periodEnd: row.period_end, format });
  };

  push("revenue", "Revenue", latestFinancial(financials, "revenue", "ANNUAL"), "currency");
  push("revenue_growth_yoy", "Revenue Growth (YoY)", latestCalculated(metrics, "revenue_growth_yoy"), "percent");
  push("eps", "EPS", latestFinancial(financials, "eps", "ANNUAL"), "pershare");
  push("eps_growth_yoy", "EPS Growth (YoY)", latestCalculated(metrics, "eps_growth_yoy"), "percent");
  push("net_margin", "Net Margin", latestCalculated(metrics, "net_margin"), "percent");
  push("operating_margin", "Operating Margin", latestCalculated(metrics, "operating_margin"), "percent");
  push("roe", "ROE", latestCalculated(metrics, "roe"), "percent");
  push("free_cash_flow", "Free Cash Flow", latestCalculated(metrics, "free_cash_flow"), "currency");
  push("fcf_margin", "FCF Margin", latestCalculated(metrics, "fcf_margin"), "percent");
  push("long_term_debt_noncurrent", "Long-Term Debt", latestFinancial(financials, "long_term_debt_noncurrent", "INSTANT"), "currency");

  return entries;
}

export function formatKeyFinancialValue(f: KeyFinancialValue): string {
  if (f.format === "currency") return formatCurrency(f.value);
  if (f.format === "percent") return formatPercent(f.value);
  return formatPerShare(f.value);
}
