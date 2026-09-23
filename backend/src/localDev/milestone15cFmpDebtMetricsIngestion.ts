// ============================================================================
// Equity AI — Milestone 15C Part 2: FMP debt metrics live ingestion for all
// 16 FMP-entitled companies, INCLUDING AMZN and JNJ (whose existing
// SEC-sourced rows this deliberately never touches — see
// ingestFmpDebtMetrics.ts's own header).
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone15cFmpDebtMetricsIngestion.ts
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestFmpDebtMetrics } from "../ingestion/ingestFmpDebtMetrics";
import { getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";

const FMP_ENTITLED_16 = ["NVDA", "ADBE", "INTC", "GOOGL", "DIS", "VZ", "AMZN", "TSLA", "JPM", "BAC", "JNJ", "UNH", "PFE", "COST", "PEP", "CVX"];

async function main() {
  console.log("Equity AI — Milestone 15C: FMP debt metrics live ingestion (16 FMP-entitled companies)\n");

  const registry = buildProviderRegistry();
  const rows: Array<{ ticker: string; status: string; fetched: number; computed: number; stored: number; skipped: number }> = [];

  for (const ticker of FMP_ENTITLED_16) {
    const company = await getCompanyIdByTicker(ticker);
    if (!company) {
      rows.push({ ticker, status: "SKIPPED (company not found)", fetched: 0, computed: 0, stored: 0, skipped: 0 });
      continue;
    }
    const outcome = await ingestFmpDebtMetrics(company.id, { ticker }, registry.marketData);
    let status = outcome.status === "available" ? "REAL" : outcome.status.toUpperCase();
    if (outcome.status === "unavailable") status = `UNAVAILABLE (${outcome.reason ?? "unknown"})`;
    rows.push({ ticker, status, fetched: outcome.periodsFetched, computed: outcome.periodsComputed, stored: outcome.stored, skipped: outcome.skippedExisting });
  }

  console.log("Ticker | Status | PeriodsFetched | PeriodsComputed | Stored | SkippedExisting");
  console.log("-------|--------|----------------|------------------|--------|----------------");
  for (const r of rows) {
    console.log(`${r.ticker.padEnd(6)} | ${r.status.padEnd(50)} | ${String(r.fetched).padEnd(14)} | ${String(r.computed).padEnd(16)} | ${String(r.stored).padEnd(6)} | ${r.skipped}`);
  }

  const realCount = rows.filter((r) => r.status === "REAL").length;
  const totalStored = rows.reduce((s, r) => s + r.stored, 0);
  console.log(`\nReal for ${realCount}/${FMP_ENTITLED_16.length} companies. Total rows stored: ${totalStored}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
