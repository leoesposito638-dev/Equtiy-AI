// ============================================================================
// Equity AI — Data Validation
// Runs on every RawLineItem before it is allowed into financial_metrics.
// Nothing enters the canonical layer silently — a failed validation always
// produces a reason, not a best-effort guess.
// ============================================================================

import type { PeriodType } from "../types/domain";
import type { RawLineItem } from "../providers/interfaces";

export interface ValidationIssue {
  code:
    | "MISSING_VALUE"
    | "MISSING_CURRENCY"
    | "IMPOSSIBLE_VALUE"
    | "PERIOD_TYPE_MISMATCH"
    | "STALE_FILING_DATE"
    | "DUPLICATE_OBSERVATION"
    | "CANONICAL_ALREADY_EXISTS";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const KNOWN_CURRENCIES = new Set(["USD", "EUR", "GBP", "JPY", "DKK", "CHF", "CAD", "AUD"]);

/** Metrics that are structurally allowed to be negative (everything else is flagged). */
const CAN_BE_NEGATIVE = new Set([
  "net_income",
  "operating_income",
  "free_cash_flow",
  "operating_cash_flow",
  "net_debt",
  "eps",
  "revenue_growth_yoy",
  "eps_growth_yoy",
  "margin_trend",
  "return_1m",
  "return_3m",
  "return_6m",
  "return_12m",
  // Milestone 12B: stockholders' equity is legitimately negative for some
  // real companies (e.g. after sustained large buybacks) — this is a known,
  // well-documented accounting reality, not a data error to reject.
  "equity",
]);

/**
 * `existingObservationKeys` must be scoped to the SAME provider as `item`
 * (Milestone 8D Stage 1) — the caller (ingest.ts, via
 * IngestionRepo.getExistingObservationKeys) is responsible for that scoping.
 * This function's own dedupe-key format is unchanged: a different provider's
 * observation for the same metric/period is a duplicate only if it's present
 * in the (already provider-scoped) set passed in, so the same fact from a
 * different provider correctly passes raw-layer validation.
 */
export function validateRawLineItem(
  item: RawLineItem,
  existingObservationKeys: Set<string>
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (item.rawValue === null || item.rawValue === undefined || Number.isNaN(item.rawValue)) {
    issues.push({ code: "MISSING_VALUE", message: `${item.metricName}: no numeric value present.` });
  }

  if (!item.currency || !KNOWN_CURRENCIES.has(item.currency)) {
    issues.push({
      code: "MISSING_CURRENCY",
      message: `${item.metricName}: currency '${item.currency ?? "∅"}' is missing or unrecognized — refusing to assume USD.`,
    });
  }

  if (
    item.rawValue !== null &&
    item.rawValue !== undefined &&
    item.rawValue < 0 &&
    !CAN_BE_NEGATIVE.has(item.metricName)
  ) {
    issues.push({
      code: "IMPOSSIBLE_VALUE",
      message: `${item.metricName}: negative value (${item.rawValue}) is not structurally valid for this metric.`,
    });
  }

  if (!isValidPeriodType(item.periodType)) {
    issues.push({ code: "PERIOD_TYPE_MISMATCH", message: `Unknown period_type '${item.periodType}'.` });
  }

  // TTM must never be silently treated as ANNUAL, and vice versa — the caller
  // is expected to pass the periodType it explicitly requested from the
  // provider; this check catches providers that mislabel it.
  if (item.periodType === "TTM" && item.periodStart && item.periodEnd) {
    const days = daysBetween(item.periodStart, item.periodEnd);
    if (days < 300 || days > 430) {
      issues.push({
        code: "PERIOD_TYPE_MISMATCH",
        message: `${item.metricName}: labeled TTM but period span is ${days} days — does not look like a trailing-twelve-month window.`,
      });
    }
  }

  const dedupeKey = `${item.metricName}|${item.periodEnd}|${item.periodType}`;
  if (existingObservationKeys.has(dedupeKey)) {
    issues.push({
      code: "DUPLICATE_OBSERVATION",
      message: `${item.metricName} for ${item.periodEnd} (${item.periodType}) already ingested from this source.`,
    });
  }

  return { valid: issues.length === 0, issues };
}

function isValidPeriodType(pt: string): pt is PeriodType {
  return pt === "QUARTER" || pt === "ANNUAL" || pt === "TTM" || pt === "INSTANT";
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
