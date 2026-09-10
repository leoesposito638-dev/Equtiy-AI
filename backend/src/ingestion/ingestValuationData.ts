// ============================================================================
// Equity AI — Valuation Data Ingestion (Milestone 13F)
//
// Persists MarketDataProvider.getQuote() / getValuationRatios() results into
// the existing schema — market_data for price/shares/market cap, and
// calculated_metrics for enterprise_value and the 5 FMP-sourced TTM ratios
// (matching the /companies/:id/valuation route's existing VALUATION_METRIC_
// NAMES: pe, ev_ebitda, ev_sales, price_to_fcf, fcf_yield). No new table:
// both target tables already exist for exactly this kind of data.
//
// Dedup conventions, each matching what's already established for its own
// table rather than inventing a new rule:
//   - calculated_metrics: same pattern as supabaseFundamentalRatiosRepo.ts —
//     query existing (metric_name, period_end) keys for this
//     calculation_version first, skip if present, and still catch the
//     unique-constraint 23505 as a backstop.
//   - market_data: the table has no unique constraint (verified against
//     schema/001_core_tables.sql — only an index on (company_id, timestamp
//     desc)), so this file does its own existing-row check on
//     (company_id, timestamp) before inserting, the smallest addition that
//     makes re-running this ingestion idempotent without changing the schema.
//
// Provenance note: unlike financial_metrics, neither market_data nor
// calculated_metrics has a source_id column pointing at data_sources — a
// pre-existing schema characteristic, not something this milestone changes.
// calculated_metrics.input_data_hash is still populated here, but as a hash
// of the vendor call that produced the value (there are no upstream
// financial_metrics rows to hash, unlike a locally-computed ratio).
// ============================================================================

import { createHash } from "crypto";
import { getDbClient } from "../db/client";
import type { MarketDataProvider, ProviderCompanyRef } from "../providers/interfaces";

const VALUATION_CALCULATION_VERSION = "v1.0-fmp";

export interface ValuationIngestionOutcome {
  ticker: string;
  quote: "stored" | "skipped_existing" | "unavailable" | "error";
  enterpriseValue: "stored" | "skipped_existing" | "unavailable" | "error";
  ratios: Record<string, "stored" | "skipped_existing" | "unavailable" | "error">;
  reason?: string;
}

async function marketDataRowExists(companyId: string, timestamp: string): Promise<boolean> {
  const db = getDbClient();
  const { data, error } = await db
    .from("market_data")
    .select("id")
    .eq("company_id", companyId)
    .eq("timestamp", timestamp)
    .limit(1);
  if (error) throw new Error(`market_data existence check failed: ${error.message}`);
  return (data ?? []).length > 0;
}

async function insertMarketData(params: {
  companyId: string;
  timestamp: string;
  price: number;
  marketCap: number | null;
  sharesOutstanding: number | null;
}): Promise<void> {
  const db = getDbClient();
  const { error } = await db.from("market_data").insert({
    company_id: params.companyId,
    timestamp: params.timestamp,
    price: params.price,
    market_cap: params.marketCap,
    shares_outstanding: params.sharesOutstanding,
    // volume / high_52w / low_52w / returns / volatility: not returned by
    // enterprise-values (Milestone 13F's chosen source) — left null, never
    // guessed. A future increment sourcing /quote or /historical-price
    // would populate these; this milestone doesn't.
  });
  if (error) throw new Error(`market_data insert failed: ${error.message}`);
}

async function getExistingCalculatedMetricKeys(companyId: string): Promise<Set<string>> {
  const db = getDbClient();
  const { data, error } = await db
    .from("calculated_metrics")
    .select("metric_name, period_end")
    .eq("company_id", companyId)
    .eq("calculation_version", VALUATION_CALCULATION_VERSION);
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
    period_type: "TTM",
    calculation_version: VALUATION_CALCULATION_VERSION,
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

/** Fetches one company's quote + valuation ratios from the given
 *  MarketDataProvider and persists whatever is genuinely available — never
 *  substitutes a zero or a guess for anything the provider didn't return.
 *  Idempotent: re-running for a company/period already stored just reports
 *  "skipped_existing", never a duplicate row. */
export async function ingestValuationData(
  companyId: string,
  ref: ProviderCompanyRef,
  marketData: MarketDataProvider
): Promise<ValuationIngestionOutcome> {
  const outcome: ValuationIngestionOutcome = {
    ticker: ref.ticker,
    quote: "unavailable",
    enterpriseValue: "unavailable",
    ratios: {},
  };

  const quoteResult = await marketData.getQuote(ref);
  if (quoteResult.status === "available" && quoteResult.data) {
    const q = quoteResult.data;
    try {
      const exists = await marketDataRowExists(companyId, q.timestamp);
      if (exists) {
        outcome.quote = "skipped_existing";
      } else {
        await insertMarketData({
          companyId,
          timestamp: q.timestamp,
          price: q.price,
          marketCap: q.marketCap,
          sharesOutstanding: q.sharesOutstanding,
        });
        outcome.quote = "stored";
      }

      if (q.enterpriseValue != null) {
        const existingKeys = await getExistingCalculatedMetricKeys(companyId);
        const key = `enterprise_value|${q.timestamp}`;
        if (existingKeys.has(key)) {
          outcome.enterpriseValue = "skipped_existing";
        } else {
          outcome.enterpriseValue = await insertCalculatedMetric({
            companyId,
            metricName: "enterprise_value",
            value: q.enterpriseValue,
            periodEnd: q.timestamp,
            inputDataHash: hashOf([quoteResult.source?.sourceUrl ?? "", q.timestamp, q.enterpriseValue]),
          });
        }
      }
    } catch (e) {
      outcome.quote = "error";
      outcome.reason = (e as Error).message;
    }
  } else {
    outcome.reason = quoteResult.unavailableReason;
  }

  const ratiosResult = await marketData.getValuationRatios(ref);
  const RATIO_METRIC_NAMES: Record<keyof NonNullable<typeof ratiosResult.data>, string> = {
    pe: "pe",
    evToEbitda: "ev_ebitda",
    evToSales: "ev_sales",
    priceToFcf: "price_to_fcf",
    fcfYield: "fcf_yield",
  };

  if (ratiosResult.status === "available" && ratiosResult.data) {
    const today = new Date().toISOString().slice(0, 10);
    let existingKeys: Set<string> | null = null;
    for (const [field, metricName] of Object.entries(RATIO_METRIC_NAMES) as Array<[keyof typeof ratiosResult.data, string]>) {
      const value = ratiosResult.data[field];
      if (value == null) {
        outcome.ratios[metricName] = "unavailable";
        continue;
      }
      try {
        if (!existingKeys) existingKeys = await getExistingCalculatedMetricKeys(companyId);
        const key = `${metricName}|${today}`;
        if (existingKeys.has(key)) {
          outcome.ratios[metricName] = "skipped_existing";
          continue;
        }
        outcome.ratios[metricName] = await insertCalculatedMetric({
          companyId,
          metricName,
          value,
          periodEnd: today,
          inputDataHash: hashOf([ratiosResult.source?.sourceUrl ?? "", today, metricName, value]),
        });
        existingKeys.add(key);
      } catch (e) {
        outcome.ratios[metricName] = "error";
      }
    }
  } else {
    for (const metricName of Object.values(RATIO_METRIC_NAMES)) {
      outcome.ratios[metricName] = "unavailable";
    }
  }

  return outcome;
}
