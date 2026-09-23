// ============================================================================
// Equity AI — Daily Price History Ingestion (Milestone 14D)
//
// Fetches one company's daily OHLCV series via
// MarketDataProvider.getHistoricalPrices() (FmpMarketDataAdapter, sourced
// ONLY from /stable/historical-price-eod/dividend-adjusted — see that
// adapter's own header) over a caller-supplied [from, to] range, and
// persists every row into the new daily_prices table
// (schema/008_daily_prices.sql).
//
// Idempotency: daily_prices HAS a real DB unique constraint
// (company_id, trade_date, adjustment_type) — unlike market_data/estimates/
// earnings in prior milestones, which lacked one and needed an
// application-level existing-row check. Here a real Postgres UPSERT
// (`.upsert(..., { onConflict: ... })`) is the correct, idiomatic tool:
// insert on first run, update in place (never duplicate) on every rerun.
//
// One data_sources row is created per ingestDailyPrices() call (covering
// every price row fetched in that call) — same "one source per outer call"
// convention as every other ingestion file in this codebase.
// ============================================================================

import { getDbClient } from "../db/client";
import type { MarketDataProvider, ProviderCompanyRef } from "../providers/interfaces";

export interface DailyPriceIngestionOutcome {
  ticker: string;
  status: "available" | "unavailable" | "error";
  rowsFetched: number;
  rowsUpserted: number;
  reason?: string;
}

async function insertPriceDataSource(sourceUrl: string | undefined): Promise<string> {
  const db = getDbClient();
  const { data, error } = await db
    .from("data_sources")
    .insert({
      provider_name: "Financial Modeling Prep",
      provider_type: "MARKET_DATA",
      source_url: sourceUrl ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`data_sources insert failed: ${error?.message ?? "no row returned"}`);
  return data.id as string;
}

/** Fetches one company's dividend-adjusted daily price series over
 *  [from, to] and upserts it into daily_prices. Never fabricates a row for
 *  a date the provider didn't return (weekends/holidays stay absent, not
 *  interpolated) and never persists a row the provider itself returned
 *  malformed (the adapter already rejects those — see
 *  FmpMarketDataAdapter.getHistoricalPrices). Safe to rerun: the real
 *  (company_id, trade_date, adjustment_type) unique constraint means a
 *  rerun with unchanged provider data upserts the same values in place,
 *  never a duplicate row. */
export async function ingestDailyPrices(
  companyId: string,
  ref: ProviderCompanyRef,
  marketData: MarketDataProvider,
  from: string,
  to: string
): Promise<DailyPriceIngestionOutcome> {
  const outcome: DailyPriceIngestionOutcome = {
    ticker: ref.ticker,
    status: "unavailable",
    rowsFetched: 0,
    rowsUpserted: 0,
  };

  const result = await marketData.getHistoricalPrices(ref, from, to);
  if (result.status !== "available" || !result.data) {
    outcome.status = "unavailable";
    outcome.reason = result.unavailableReason;
    return outcome;
  }

  outcome.status = "available";
  outcome.rowsFetched = result.data.length;

  try {
    const sourceId = await insertPriceDataSource(result.source?.sourceUrl);
    const db = getDbClient();

    const rows = result.data.map((p) => ({
      company_id: companyId,
      trade_date: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
      adjustment_type: p.adjustmentType,
      source_id: sourceId,
    }));

    const { data: upserted, error } = await db
      .from("daily_prices")
      .upsert(rows, { onConflict: "company_id,trade_date,adjustment_type" })
      .select("id");
    if (error) throw new Error(`daily_prices upsert failed: ${error.message}`);
    outcome.rowsUpserted = upserted?.length ?? rows.length;
  } catch (e) {
    outcome.status = "error";
    outcome.reason = (e as Error).message;
  }

  return outcome;
}
