// ============================================================================
// Equity AI — Earnings Ingestion (Milestone 14B)
//
// Orchestrates, for one company:
//   1. Fetches FMP's raw earnings records via EarningsProvider.getEarnings()
//      (historical rows with actual+consensus, and the next upcoming
//      scheduled report with consensus only) and persists EVERY row into
//      the existing `earnings` table — real dates for date-coverage
//      purposes even when no surprise can be computed yet.
//   2. Runs the pure, deterministic calculations/earningsSurprise.ts
//      formulas for EPS and revenue surprise. A record with no actual value
//      (the upcoming report) naturally yields null — never a fabricated
//      surprise for a quarter that hasn't happened yet.
//   3. Runs each non-null surprise result through the
//      calculations/earningsDataQuality.ts magnitude guard (Milestone 14B
//      §8) before trusting it — a rejected value is stored as null in both
//      `earnings.eps_surprise_percent`/`revenue_surprise_percent` AND is
//      never written to calculated_metrics, while the raw
//      eps_actual/eps_estimate/revenue_actual/revenue_estimate fields are
//      always persisted exactly as FMP returned them, unmodified.
//   4. Persists a passing surprise value into calculated_metrics with
//      period_type='QUARTER' (see supabaseScoringRepo.ts's new
//      METRIC_PERIOD_TYPE map, which is what makes the scoring engine read
//      these back correctly) under its own calculation_version, distinct
//      from every ANNUAL/TTM calculated_metrics family already in this
//      codebase.
//
// Dedup conventions mirror ingestForwardValuation.ts (Milestone 13H)
// exactly:
//   - earnings: no unique constraint in the schema
//     (schema/001_core_tables.sql), so this file does its own existing-row
//     check on (company_id, report_date) before inserting — the natural key
//     for this table, same shape as ingestValuationData.ts's market_data
//     existence check and ingestForwardValuation.ts's estimates existence
//     check (both precedented, reviewed patterns for tables lacking a DB
//     unique constraint).
//   - calculated_metrics: DOES have a unique constraint
//     (company_id, metric_name, period_end, period_type,
//     calculation_version) — checked up front, with the 23505 backstop,
//     same as every prior calculated_metrics writer in this codebase.
// ============================================================================

import { createHash } from "crypto";
import { getDbClient } from "../db/client";
import { calculateEpsSurprisePercent, calculateRevenueSurprisePercent } from "../calculations/earningsSurprise";
import { assessSurpriseMagnitude } from "../calculations/earningsDataQuality";
import type { EarningsProvider, EarningsRecord, ProviderCompanyRef } from "../providers/interfaces";

const EARNINGS_SURPRISE_CALCULATION_VERSION = "v1.0-fmp-earnings";

export interface EarningsIngestionOutcome {
  ticker: string;
  earningsStatus: "available" | "unavailable" | "error";
  rowsStored: number;
  rowsSkippedExisting: number;
  historicalRows: number; // rows with a real reported eps_actual
  upcomingRows: number; // rows with no actual yet (future scheduled report)
  epsSurprise: { stored: number; unavailable: number; rejectedByGuard: number };
  revenueSurprise: { stored: number; unavailable: number; rejectedByGuard: number };
  reason?: string;
}

/** `date` portion only — earnings.period_end/report_date's date component.
 *  Both columns intentionally reuse the SAME real FMP date (see
 *  fmpEarningsAdapter.ts's getEarnings() doc comment: this endpoint has no
 *  separate fiscal-period-end field) — never a second, invented date. */
function toDateOnly(isoDateOrDateTime: string): string {
  return isoDateOrDateTime.slice(0, 10);
}

async function getExistingReportDates(companyId: string): Promise<Set<string>> {
  const db = getDbClient();
  const { data, error } = await db.from("earnings").select("report_date").eq("company_id", companyId);
  if (error) throw new Error(`earnings existing-keys query failed: ${error.message}`);
  return new Set((data ?? []).map((r: { report_date: string }) => toDateOnly(r.report_date)));
}

async function insertEarningsDataSource(sourceUrl: string | undefined): Promise<string> {
  const db = getDbClient();
  const { data, error } = await db
    .from("data_sources")
    .insert({
      provider_name: "Financial Modeling Prep",
      provider_type: "FINANCIAL_API",
      source_url: sourceUrl ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`data_sources insert failed: ${error?.message ?? "no row returned"}`);
  return data.id as string;
}

interface GuardedSurprise {
  value: number | null;
  rejectedByGuard: boolean;
}

/** Runs the pure surprise formula, then the data-quality guard on top of a
 *  non-null result — see calculations/earningsDataQuality.ts. A guard
 *  rejection produces `value: null` here (never a corrected/substituted
 *  number) but is tracked separately from an ordinary "missing input"
 *  unavailable, for accurate outcome reporting. */
function computeGuardedEpsSurprise(actual: number | null, consensus: number | null): GuardedSurprise {
  const result = calculateEpsSurprisePercent(actual, consensus);
  if (result.value === null) return { value: null, rejectedByGuard: false };
  const check = assessSurpriseMagnitude(result.value, "EPS");
  if (!check.ok) return { value: null, rejectedByGuard: true };
  return { value: result.value, rejectedByGuard: false };
}

function computeGuardedRevenueSurprise(actual: number | null, consensus: number | null): GuardedSurprise {
  const result = calculateRevenueSurprisePercent(actual, consensus);
  if (result.value === null) return { value: null, rejectedByGuard: false };
  const check = assessSurpriseMagnitude(result.value, "revenue");
  if (!check.ok) return { value: null, rejectedByGuard: true };
  return { value: result.value, rejectedByGuard: false };
}

async function insertEarningsRow(params: {
  companyId: string;
  sourceId: string;
  record: EarningsRecord;
  epsSurprise: number | null;
  revenueSurprise: number | null;
}): Promise<void> {
  const db = getDbClient();
  const { record } = params;
  const { error } = await db.from("earnings").insert({
    company_id: params.companyId,
    period_start: record.periodStart ?? null,
    period_end: toDateOnly(record.periodEnd),
    report_date: record.reportDate,
    eps_actual: record.epsActual ?? null,
    eps_estimate: record.epsEstimate ?? null,
    eps_surprise_percent: params.epsSurprise,
    revenue_actual: record.revenueActual ?? null,
    revenue_estimate: record.revenueEstimate ?? null,
    revenue_surprise_percent: params.revenueSurprise,
    // Milestone 14B explicit scope: never inferred from estimates, only
    // ever populated if FMP's response itself carried structured guidance
    // (it does not, on /stable/earnings — see fmpEarningsAdapter.ts).
    guidance_text: record.guidanceText ?? null,
    guidance_direction: record.guidanceDirection ?? null,
    source_id: params.sourceId,
  });
  if (error) throw new Error(`earnings insert failed: ${error.message}`);
}

async function getExistingCalculatedMetricKeys(companyId: string, metricName: string): Promise<Set<string>> {
  const db = getDbClient();
  const { data, error } = await db
    .from("calculated_metrics")
    .select("period_end")
    .eq("company_id", companyId)
    .eq("metric_name", metricName)
    .eq("period_type", "QUARTER")
    .eq("calculation_version", EARNINGS_SURPRISE_CALCULATION_VERSION);
  if (error) throw new Error(`calculated_metrics existing-keys query failed for ${metricName}: ${error.message}`);
  return new Set((data ?? []).map((r: { period_end: string }) => r.period_end));
}

async function insertSurpriseCalculatedMetric(params: {
  companyId: string;
  metricName: "eps_surprise_percent" | "revenue_surprise_percent";
  periodEnd: string;
  value: number;
  inputDataHash: string;
}): Promise<"stored" | "skipped_existing"> {
  const db = getDbClient();
  const { error } = await db.from("calculated_metrics").insert({
    company_id: params.companyId,
    metric_name: params.metricName,
    value: params.value,
    period_end: params.periodEnd,
    period_type: "QUARTER",
    calculation_version: EARNINGS_SURPRISE_CALCULATION_VERSION,
    input_data_hash: params.inputDataHash,
  });
  if (error) {
    if (error.code === "23505") return "skipped_existing";
    throw new Error(`calculated_metrics insert failed for ${params.metricName}: ${error.message}`);
  }
  return "stored";
}

function hashOf(parts: Array<string | number | null>): string {
  return createHash("sha256").update(parts.map((p) => String(p)).join("|")).digest("hex");
}

/** Fetches one company's earnings history + next scheduled report and
 *  persists whatever is genuinely available — never substitutes a zero or
 *  a guess for anything the provider didn't return, and never computes a
 *  surprise for a record with no actual value yet. Idempotent: re-running
 *  for a company/report_date already stored just reports
 *  "skipped_existing", never a duplicate row. */
export async function ingestEarnings(
  companyId: string,
  ref: ProviderCompanyRef,
  earnings: EarningsProvider
): Promise<EarningsIngestionOutcome> {
  const outcome: EarningsIngestionOutcome = {
    ticker: ref.ticker,
    earningsStatus: "unavailable",
    rowsStored: 0,
    rowsSkippedExisting: 0,
    historicalRows: 0,
    upcomingRows: 0,
    epsSurprise: { stored: 0, unavailable: 0, rejectedByGuard: 0 },
    revenueSurprise: { stored: 0, unavailable: 0, rejectedByGuard: 0 },
  };

  const earningsResult = await earnings.getEarnings(ref);
  if (earningsResult.status !== "available" || !earningsResult.data) {
    outcome.earningsStatus = "unavailable";
    outcome.reason = earningsResult.unavailableReason;
    return outcome;
  }
  outcome.earningsStatus = "available";

  try {
    const existingDates = await getExistingReportDates(companyId);
    const existingEpsKeys = await getExistingCalculatedMetricKeys(companyId, "eps_surprise_percent");
    const existingRevenueKeys = await getExistingCalculatedMetricKeys(companyId, "revenue_surprise_percent");

    let sourceId: string | null = null;

    for (const record of earningsResult.data) {
      const isHistorical = record.epsActual != null;
      if (isHistorical) outcome.historicalRows++;
      else outcome.upcomingRows++;

      const reportDateOnly = toDateOnly(record.reportDate);
      if (existingDates.has(reportDateOnly)) {
        outcome.rowsSkippedExisting++;
        continue;
      }

      const epsGuarded = computeGuardedEpsSurprise(record.epsActual ?? null, record.epsEstimate ?? null);
      const revenueGuarded = computeGuardedRevenueSurprise(record.revenueActual ?? null, record.revenueEstimate ?? null);

      if (!sourceId) sourceId = await insertEarningsDataSource(earningsResult.source?.sourceUrl);

      await insertEarningsRow({
        companyId,
        sourceId,
        record,
        epsSurprise: epsGuarded.value,
        revenueSurprise: revenueGuarded.value,
      });
      outcome.rowsStored++;
      existingDates.add(reportDateOnly);

      const periodEnd = toDateOnly(record.periodEnd);

      if (epsGuarded.rejectedByGuard) outcome.epsSurprise.rejectedByGuard++;
      if (epsGuarded.value === null) {
        outcome.epsSurprise.unavailable++;
      } else if (existingEpsKeys.has(periodEnd)) {
        // Already scored for this period under a prior run — leave as-is.
      } else {
        const stored = await insertSurpriseCalculatedMetric({
          companyId,
          metricName: "eps_surprise_percent",
          periodEnd,
          value: epsGuarded.value,
          inputDataHash: hashOf([ref.ticker, periodEnd, record.epsActual ?? null, record.epsEstimate ?? null]),
        });
        if (stored === "stored") {
          outcome.epsSurprise.stored++;
          existingEpsKeys.add(periodEnd);
        }
      }

      if (revenueGuarded.rejectedByGuard) outcome.revenueSurprise.rejectedByGuard++;
      if (revenueGuarded.value === null) {
        outcome.revenueSurprise.unavailable++;
      } else if (existingRevenueKeys.has(periodEnd)) {
        // Already scored for this period under a prior run — leave as-is.
      } else {
        const stored = await insertSurpriseCalculatedMetric({
          companyId,
          metricName: "revenue_surprise_percent",
          periodEnd,
          value: revenueGuarded.value,
          inputDataHash: hashOf([ref.ticker, periodEnd, record.revenueActual ?? null, record.revenueEstimate ?? null]),
        });
        if (stored === "stored") {
          outcome.revenueSurprise.stored++;
          existingRevenueKeys.add(periodEnd);
        }
      }
    }
  } catch (e) {
    outcome.earningsStatus = "error";
    outcome.reason = (e as Error).message;
  }

  return outcome;
}
