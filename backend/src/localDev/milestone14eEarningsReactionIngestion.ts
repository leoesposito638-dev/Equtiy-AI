// ============================================================================
// Equity AI — Milestone 14E: earnings reaction (2-day window) ingestion for
// the 30-company demo universe. daily_prices-only, no FMP calls.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone14eEarningsReactionIngestion.ts
// ============================================================================

import { ingestEarningsReaction } from "../ingestion/ingestEarningsReaction";
import { getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
import { DEMO_TICKERS } from "../config/demoUniverse";

async function main() {
  console.log("Equity AI — Milestone 14E: earnings reaction (2-day window) ingestion (30-company demo universe)\n");

  const rows: Array<{ ticker: string; historical: number; computed: number; stored: number; skipped: number; unavailable: number }> = [];
  const allUnavailableReasons: Array<{ ticker: string; periodEnd: string; reportDate: string; reason: string }> = [];

  for (const ticker of DEMO_TICKERS) {
    const company = await getCompanyIdByTicker(ticker);
    if (!company) {
      rows.push({ ticker, historical: 0, computed: 0, stored: 0, skipped: 0, unavailable: 0 });
      continue;
    }
    const outcome = await ingestEarningsReaction(company.id);
    rows.push({
      ticker,
      historical: outcome.historicalEarningsRows,
      computed: outcome.computed,
      stored: outcome.stored,
      skipped: outcome.skippedExisting,
      unavailable: outcome.unavailable,
    });
    for (const r of outcome.unavailableReasons) allUnavailableReasons.push({ ticker, ...r });
  }

  console.log("Ticker | Historical | Computed | Stored | SkippedExisting | Unavailable");
  console.log("-------|------------|----------|--------|-----------------|------------");
  for (const r of rows) {
    console.log(`${r.ticker.padEnd(6)} | ${String(r.historical).padEnd(10)} | ${String(r.computed).padEnd(8)} | ${String(r.stored).padEnd(6)} | ${String(r.skipped).padEnd(15)} | ${r.unavailable}`);
  }

  const totalStored = rows.reduce((s, r) => s + r.stored, 0);
  const totalSkipped = rows.reduce((s, r) => s + r.skipped, 0);
  const totalUnavailable = rows.reduce((s, r) => s + r.unavailable, 0);
  const totalComputed = rows.reduce((s, r) => s + r.computed, 0);
  console.log(`\nTotals: computed=${totalComputed} stored=${totalStored} skippedExisting=${totalSkipped} unavailable=${totalUnavailable}`);

  if (allUnavailableReasons.length > 0) {
    console.log(`\nUnavailable reasons (${allUnavailableReasons.length}):`);
    for (const r of allUnavailableReasons) {
      console.log(`  ${r.ticker} period_end=${r.periodEnd} report_date=${r.reportDate}: ${r.reason}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
