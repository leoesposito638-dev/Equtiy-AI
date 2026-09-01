// ============================================================================
// Equity AI — Normalization
// Converts validated RawLineItems into the canonical financial_metrics shape.
// Currency conversion is explicit and logged — never implicit.
// ============================================================================

import type { RawLineItem } from "../providers/interfaces";
import type { FinancialMetric, PeriodType } from "../types/domain";

export interface FxRate {
  from: string;
  to: string;
  rate: number;
  asOf: string;
}

const INCOME_STATEMENT_METRICS = new Set([
  "revenue", "gross_profit", "operating_income", "ebitda", "net_income", "eps",
  "interest_expense", "research_development", // Milestone 12B
]);
const BALANCE_SHEET_METRICS = new Set([
  "cash", "total_debt", "net_debt", "total_assets", "total_liabilities", "equity",
  "current_assets", "current_liabilities", // Milestone 12B
]);
const CASH_FLOW_METRICS = new Set([
  "operating_cash_flow", "capex", "free_cash_flow",
  "depreciation_amortization", // Milestone 12B
]);

function categoryFor(metricName: string): FinancialMetric["metricCategory"] {
  if (INCOME_STATEMENT_METRICS.has(metricName)) return "INCOME_STATEMENT";
  if (BALANCE_SHEET_METRICS.has(metricName)) return "BALANCE_SHEET";
  if (CASH_FLOW_METRICS.has(metricName)) return "CASH_FLOW";
  return undefined;
}

/**
 * Normalizes one validated raw line item into a canonical FinancialMetric.
 * `targetCurrency` is the company's reporting currency (companies.currency);
 * if the raw item is already in that currency, no conversion happens.
 * If it isn't, an FxRate must be supplied — normalization refuses to invent one.
 */
export function normalizeLineItem(
  item: RawLineItem,
  companyId: string,
  sourceId: string,
  targetCurrency: string,
  fxRate?: FxRate
): { metric: FinancialMetric | null; error?: string } {
  if (item.currency === targetCurrency) {
    return {
      metric: buildMetric(item, companyId, sourceId, item.rawValue, targetCurrency, "DIRECT"),
    };
  }

  if (!fxRate || fxRate.from !== item.currency || fxRate.to !== targetCurrency) {
    return {
      metric: null,
      error: `Cannot normalize ${item.metricName}: reported in ${item.currency}, target is ${targetCurrency}, and no matching FX rate was supplied. Refusing to guess a conversion rate.`,
    };
  }

  const convertedValue = item.rawValue === null ? null : item.rawValue * fxRate.rate;
  return {
    metric: buildMetric(item, companyId, sourceId, convertedValue, targetCurrency, "DERIVED"),
  };
}

function buildMetric(
  item: RawLineItem,
  companyId: string,
  sourceId: string,
  value: number | null,
  currency: string,
  calculationType: "DIRECT" | "DERIVED"
): FinancialMetric {
  return {
    id: crypto.randomUUID(),
    companyId,
    metricName: item.metricName,
    metricCategory: categoryFor(item.metricName),
    value,
    unit: item.unit,
    currency,
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
    periodType: item.periodType as PeriodType,
    sourceId,
    calculationType,
    confidenceScore: value === null ? 0 : undefined,
  };
}
