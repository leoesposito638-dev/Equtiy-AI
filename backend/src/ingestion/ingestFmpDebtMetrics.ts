// ============================================================================
// Equity AI — FMP Debt Metrics Ingestion (Milestone 15C)
//
// Persists MarketDataProvider.getDebtMetricsHistory() + calculations/
// fmpDebtMetrics.ts's pure results into calculated_metrics, under FOUR
// metric_names distinct from the SEC-sourced path's own (total_debt,
// net_debt, debt_to_equity, net_debt_to_ebitda):
//   total_debt_fmp, net_debt_fmp, debt_to_equity_fmp, net_debt_to_ebitda_fmp
//
// This is the entire mechanism that keeps SEC and FMP values from ever
// mixing (see supabaseScoringRepo.ts's METRIC_SOURCE_ALIAS doc comment for
// the scoring-side half of this): this file NEVER writes to the plain
// metric_names, regardless of company — including AMZN and JNJ, which
// already have real SEC-sourced rows under those plain names (Milestone
// 13C). Running this ingestion for AMZN/JNJ adds NEW rows under the "_fmp"
// names alongside their untouched SEC rows; it never updates, deletes, or
// even reads the SEC rows.
//
// Dedup convention matches ingestValuationData.ts exactly (same target
// table, same shape of problem): query existing (metric_name, period_end)
// keys for this calculation_version first, skip if present, 23505 as a
// backstop. calculated_metrics has no source_id column (pre-existing
// schema characteristic — see ingestValuationData.ts's own note), so
// input_data_hash is this row's only provenance trail; it hashes the exact
// FMP period + computed value, not an upstream financial_metrics row,
// since there is none.
// ============================================================================

import { createHash } from "crypto";
import { getDbClient } from "../db/client";
import { calculateFmpDebtMetrics } from "../calculations/fmpDebtMetrics";
import type { MarketDataProvider, ProviderCompanyRef } from "../providers/interfaces";

export const FMP_DEBT_METRICS_CALCULATION_VERSION = "v1.0-fmp-debt";

const METRIC_NAMES = ["total_debt_fmp", "net_debt_fmp", "debt_to_equity_fmp", "net_debt_to_ebitda_fmp"] as const;

export interface FmpDebtMetricsIngestionOutcome {
  ticker: string;
  status: "available" | "unavailable" | "error";
  periodsFetched: number;
  periodsComputed: number;
  stored: number;
  skippedExisting: number;
  reason?: string;
}

async function getExistingKeys(companyId: string): Promise<Set<string>> {
  const db = getDbClient();
  const { data, error } = await db
    .from("calculated_metrics")
    .select("metric_name, period_end")
    .eq("company_id", companyId)
    .eq("calculation_version", FMP_DEBT_METRICS_CALCULATION_VERSION);
  if (error) throw new Error(`calculated_metrics existing-keys query failed: ${error.message}`);
  return new Set((data ?? []).map((r: { metric_name: string; period_end: string }) => `${r.metric_name}|${r.period_end}`));
}

async function insertCalculatedMetric(params: {
  companyId: string;
  metricName: string;
  value: number;
  periodEnd: string;
  inputDataHash: string;
}): Promise<"stored" | "skipped_existing"> {
  const db = getDbClient();
  const { error } = await db.from("calculated_metrics").insert({
    company_id: params.companyId,
    metric_name: params.metricName,
    value: params.value,
    period_end: params.periodEnd,
    period_type: "ANNUAL",
    calculation_version: FMP_DEBT_METRICS_CALCULATION_VERSION,
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

/** Fetches one company's FMP-only debt-metric history and persists whatever
 *  is genuinely computable — never a fallback, never an estimate. Only
 *  called for FMP-entitled companies; a 402/unavailable response from the
 *  provider is surfaced honestly, not retried with a substitute source. */
export async function ingestFmpDebtMetrics(
  companyId: string,
  ref: ProviderCompanyRef,
  marketData: MarketDataProvider
): Promise<FmpDebtMetricsIngestionOutcome> {
  const outcome: FmpDebtMetricsIngestionOutcome = {
    ticker: ref.ticker,
    status: "unavailable",
    periodsFetched: 0,
    periodsComputed: 0,
    stored: 0,
    skippedExisting: 0,
  };

  const result = await marketData.getDebtMetricsHistory(ref);
  if (result.status !== "available" || !result.data) {
    outcome.status = "unavailable";
    outcome.reason = result.unavailableReason;
    return outcome;
  }
  outcome.status = "available";
  outcome.periodsFetched = result.data.length;

  try {
    const computed = calculateFmpDebtMetrics(result.data);
    outcome.periodsComputed = computed.length;

    const existingKeys = await getExistingKeys(companyId);

    for (const period of computed) {
      const values: Array<{ metricName: (typeof METRIC_NAMES)[number]; value: number | null }> = [
        { metricName: "total_debt_fmp", value: period.totalDebt },
        { metricName: "net_debt_fmp", value: period.netDebt },
        { metricName: "debt_to_equity_fmp", value: period.debtToEquity },
        { metricName: "net_debt_to_ebitda_fmp", value: period.netDebtToEbitda },
      ];

      for (const { metricName, value } of values) {
        if (value === null) continue; // real null (e.g. zero equity/EBITDA) — never stored, never fabricated
        const key = `${metricName}|${period.periodEnd}`;
        if (existingKeys.has(key)) {
          outcome.skippedExisting++;
          continue;
        }
        const stored = await insertCalculatedMetric({
          companyId,
          metricName,
          value,
          periodEnd: period.periodEnd,
          inputDataHash: hashOf([ref.ticker, metricName, period.periodEnd, value]),
        });
        if (stored === "stored") {
          outcome.stored++;
          existingKeys.add(key);
        } else {
          outcome.skippedExisting++;
        }
      }
    }
  } catch (e) {
    outcome.status = "error";
    outcome.reason = (e as Error).message;
  }

  return outcome;
}
