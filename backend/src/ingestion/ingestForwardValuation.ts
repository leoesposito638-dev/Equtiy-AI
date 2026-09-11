// ============================================================================
// Equity AI — Forward Valuation Ingestion (Milestone 13H)
//
// Orchestrates, for one company:
//   1. Reads this company's latest reported ANNUAL period_end from our own
//      trusted financial_metrics (metric_name='revenue') — never from the
//      estimates payload itself. This is the same "latest reported fiscal
//      period" concept the Milestone 13G audit cross-referenced by hand for
//      all 30 companies (Part C); here it's a live DB query.
//   2. Fetches FMP's raw annual analyst-estimates via
//      EarningsProvider.getEstimates() and persists EVERY returned row into
//      the existing `estimates` table — the full multi-year series, not
//      just the one selected for Forward P/E, matching the "store what a
//      provider actually returned" completeness convention used elsewhere
//      (e.g. fmpAdapter.ts's income-statement ingestion stores all
//      LOOKBACK_PERIODS rows, not just the latest).
//   3. Runs the pure, deterministic calculations/forwardEps.ts
//      selectForwardEps() algorithm against those estimates.
//   4. Fetches a live (not period-end) price via
//      MarketDataProvider.getLivePrice().
//   5. Computes Forward P/E via the pure forwardEps.ts forwardPe() formula
//      and persists it into calculated_metrics — only when both forward
//      EPS and live price are genuinely available; never a fabricated
//      value, matching the "never fabricate" rule that runs through every
//      ingestion file in this codebase.
//
// Dedup conventions mirror ingestValuationData.ts (Milestone 13F) exactly:
//   - estimates: no unique constraint in the schema
//     (schema/001_core_tables.sql), so this file does its own existing-row
//     check on (company_id, metric_name, estimate_period_end,
//     estimate_period_type) before inserting — same shape as
//     ingestValuationData.ts's market_data existence check.
//   - calculated_metrics: DOES have a unique constraint here
//     (company_id, metric_name, period_end, period_type,
//     calculation_version — schema/002_scoring_tables.sql) — checked up
//     front, with the 23505 backstop, same as ingestValuationData.ts's
//     insertCalculatedMetric.
//
// forward_pe is stored with period_type='ANNUAL' (it targets one specific
// future fiscal year, not a trailing twelve months) under its own
// calculation_version — deliberately distinct from the Milestone 13F TTM
// ratios (pe, ev_ebitda, ev_sales, price_to_fcf, fcf_yield), which all use
// period_type='TTM'. Both live in the same calculated_metrics table without
// any collision, because the unique constraint includes period_type.
// ============================================================================

import { createHash } from "crypto";
import { getDbClient } from "../db/client";
import { selectForwardEps, forwardPe } from "../calculations/forwardEps";
import type { EarningsProvider, EstimateRecord, MarketDataProvider, ProviderCompanyRef } from "../providers/interfaces";

const FORWARD_PE_CALCULATION_VERSION = "v1.0-fmp-forward";

export interface ForwardValuationOutcome {
  ticker: string;
  latestReportedPeriodEnd: string | null;
  estimatesStatus: "available" | "unavailable" | "error";
  estimatesStored: number;
  estimatesSkippedExisting: number;
  forwardEps: {
    status: "available" | "unavailable";
    value: number | null;
    periodEnd: string | null;
    analystCount: number | null;
    reason?: string;
  };
  livePrice: {
    status: "available" | "unavailable" | "error";
    value: number | null;
    reason?: string;
  };
  forwardPe: "stored" | "skipped_existing" | "unavailable" | "error";
  forwardPeValue: number | null;
  reason?: string;
}

async function getLatestReportedAnnualPeriodEnd(companyId: string): Promise<string | null> {
  const db = getDbClient();
  const { data, error } = await db
    .from("financial_metrics")
    .select("period_end")
    .eq("company_id", companyId)
    .eq("metric_name", "revenue")
    .eq("period_type", "ANNUAL")
    .order("period_end", { ascending: false })
    .limit(1);
  if (error) throw new Error(`financial_metrics latest-reported-period query failed: ${error.message}`);
  const row = (data ?? [])[0] as { period_end: string } | undefined;
  return row?.period_end ?? null;
}

async function getExistingEstimateKeys(companyId: string): Promise<Set<string>> {
  const db = getDbClient();
  const { data, error } = await db
    .from("estimates")
    .select("metric_name, estimate_period_end, estimate_period_type")
    .eq("company_id", companyId);
  if (error) throw new Error(`estimates existing-keys query failed: ${error.message}`);
  return new Set(
    (data ?? []).map(
      (r: { metric_name: string; estimate_period_end: string; estimate_period_type: string }) =>
        `${r.metric_name}|${r.estimate_period_end}|${r.estimate_period_type}`
    )
  );
}

async function insertEstimatesDataSource(sourceUrl: string | undefined): Promise<string> {
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

async function insertEstimateRow(params: { companyId: string; sourceId: string; record: EstimateRecord }): Promise<void> {
  const db = getDbClient();
  const { error } = await db.from("estimates").insert({
    company_id: params.companyId,
    metric_name: params.record.metricName,
    estimate_period_start: params.record.estimatePeriodStart ?? null,
    estimate_period_end: params.record.estimatePeriodEnd,
    estimate_period_type: params.record.estimatePeriodType,
    consensus_value: params.record.consensusValue,
    analyst_count: params.record.analystCount,
    source_id: params.sourceId,
  });
  if (error) throw new Error(`estimates insert failed: ${error.message}`);
}

async function forwardPeExists(companyId: string, periodEnd: string): Promise<boolean> {
  const db = getDbClient();
  const { data, error } = await db
    .from("calculated_metrics")
    .select("id")
    .eq("company_id", companyId)
    .eq("metric_name", "forward_pe")
    .eq("period_end", periodEnd)
    .eq("period_type", "ANNUAL")
    .eq("calculation_version", FORWARD_PE_CALCULATION_VERSION)
    .limit(1);
  if (error) throw new Error(`calculated_metrics existence check failed: ${error.message}`);
  return (data ?? []).length > 0;
}

async function insertForwardPe(params: { companyId: string; periodEnd: string; value: number; inputDataHash: string }): Promise<"stored" | "skipped_existing"> {
  const db = getDbClient();
  const { error } = await db.from("calculated_metrics").insert({
    company_id: params.companyId,
    metric_name: "forward_pe",
    value: params.value,
    period_end: params.periodEnd,
    period_type: "ANNUAL",
    calculation_version: FORWARD_PE_CALCULATION_VERSION,
    input_data_hash: params.inputDataHash,
  });
  if (error) {
    if (error.code === "23505") return "skipped_existing";
    throw new Error(`calculated_metrics forward_pe insert failed: ${error.message}`);
  }
  return "stored";
}

function hashOf(parts: Array<string | number | null>): string {
  return createHash("sha256").update(parts.map((p) => String(p)).join("|")).digest("hex");
}

/** Fetches one company's annual analyst estimates + a live price and
 *  persists whatever is genuinely available — never substitutes a zero or
 *  a guess for anything the provider didn't return, and never falls back
 *  to a different fiscal year than the one selectForwardEps() deterministically
 *  picked. Idempotent: re-running for a company already stored just
 *  reports "skipped_existing", never a duplicate row. */
export async function ingestForwardValuation(
  companyId: string,
  ref: ProviderCompanyRef,
  earnings: EarningsProvider,
  marketData: MarketDataProvider
): Promise<ForwardValuationOutcome> {
  const outcome: ForwardValuationOutcome = {
    ticker: ref.ticker,
    latestReportedPeriodEnd: null,
    estimatesStatus: "unavailable",
    estimatesStored: 0,
    estimatesSkippedExisting: 0,
    forwardEps: { status: "unavailable", value: null, periodEnd: null, analystCount: null },
    livePrice: { status: "unavailable", value: null },
    forwardPe: "unavailable",
    forwardPeValue: null,
  };

  const latestReportedPeriodEnd = await getLatestReportedAnnualPeriodEnd(companyId);
  outcome.latestReportedPeriodEnd = latestReportedPeriodEnd;
  if (!latestReportedPeriodEnd) {
    outcome.reason = `No reported ANNUAL revenue period_end found in financial_metrics for ${ref.ticker} — cannot determine which fiscal years are already reported.`;
    return outcome;
  }

  const estimatesResult = await earnings.getEstimates(ref);
  if (estimatesResult.status !== "available" || !estimatesResult.data) {
    outcome.estimatesStatus = "unavailable";
    outcome.forwardEps.reason = estimatesResult.unavailableReason;
    outcome.reason = estimatesResult.unavailableReason;
    return outcome;
  }

  const annualEstimates = estimatesResult.data.filter((e) => e.estimatePeriodType === "ANNUAL");
  outcome.estimatesStatus = "available";

  try {
    const existingKeys = await getExistingEstimateKeys(companyId);
    let sourceId: string | null = null;
    for (const record of annualEstimates) {
      const key = `${record.metricName}|${record.estimatePeriodEnd}|${record.estimatePeriodType}`;
      if (existingKeys.has(key)) {
        outcome.estimatesSkippedExisting++;
        continue;
      }
      if (!sourceId) sourceId = await insertEstimatesDataSource(estimatesResult.source?.sourceUrl);
      await insertEstimateRow({ companyId, sourceId, record });
      existingKeys.add(key);
      outcome.estimatesStored++;
    }
  } catch (e) {
    outcome.estimatesStatus = "error";
    outcome.reason = (e as Error).message;
    // Estimates persistence failing does not prevent computing/reporting
    // forward EPS or Forward P/E below — the in-memory annualEstimates
    // array is unaffected by a DB write failure.
  }

  const selection = selectForwardEps(annualEstimates, latestReportedPeriodEnd);
  outcome.forwardEps = {
    status: selection.status,
    value: selection.forwardEps,
    periodEnd: selection.periodEnd,
    analystCount: selection.analystCount,
    reason: selection.unavailableReason,
  };

  const liveQuoteResult = await marketData.getLivePrice(ref);
  if (liveQuoteResult.status === "available" && liveQuoteResult.data) {
    outcome.livePrice = { status: "available", value: liveQuoteResult.data.price };
  } else {
    outcome.livePrice = { status: "unavailable", value: null, reason: liveQuoteResult.unavailableReason };
  }

  const pe = forwardPe(outcome.livePrice.value, outcome.forwardEps.value);
  outcome.forwardPeValue = pe;

  if (pe == null || !selection.periodEnd) {
    outcome.forwardPe = "unavailable";
    return outcome;
  }

  try {
    const exists = await forwardPeExists(companyId, selection.periodEnd);
    if (exists) {
      outcome.forwardPe = "skipped_existing";
      return outcome;
    }
    outcome.forwardPe = await insertForwardPe({
      companyId,
      periodEnd: selection.periodEnd,
      value: pe,
      inputDataHash: hashOf([ref.ticker, selection.periodEnd, selection.forwardEps, outcome.livePrice.value]),
    });
  } catch (e) {
    outcome.forwardPe = "error";
    outcome.reason = (e as Error).message;
  }

  return outcome;
}
