// ============================================================================
// Equity AI — Milestone 14D: daily price history (dividend-adjusted)
// ingestion for the 30-company demo universe.
//
// Computes ONE global date range — [earliest earnings.report_date minus a
// buffer comfortably covering >=10 trading days, through today] — and runs
// ingestDailyPrices() against that same range for every ticker in
// DEMO_TICKERS, via the registry's marketData provider (FmpMarketDataAdapter
// when FMP_API_KEY is present). Prints the exact range used and a
// per-company outcome table.
//
// REQUIRES schema/008_daily_prices.sql to have already been applied to the
// target database — this script does not run migrations itself.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone14dDailyPricesIngestion.ts
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestDailyPrices } from "../ingestion/ingestDailyPrices";
import { getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
import { getDbClient } from "../db/client";
import { DEMO_TICKERS } from "../config/demoUniverse";

function fail(m: string): never {
  console.error(`\n❌ ${m}\n`);
  process.exit(1);
}

/** Generous calendar-day buffer comfortably covering >=10 TRADING days
 *  before the earliest report_date, even accounting for weekends and a
 *  holiday or two (10 trading days is never more than ~16 calendar days). */
const CALENDAR_DAYS_BUFFER = 20;

function subtractDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("Equity AI — Milestone 14D: daily price history ingestion (30-company demo universe)\n");

  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}`);

  const db = getDbClient();
  const { data: earliestRow, error } = await db.from("earnings").select("report_date").order("report_date", { ascending: true }).limit(1).maybeSingle();
  if (error) fail(`Failed to read earliest earnings.report_date: ${error.message}`);
  if (!earliestRow) fail("No earnings rows found — run Milestone 14B ingestion first.");

  const earliestReportDate = (earliestRow.report_date as string).slice(0, 10);
  const from = subtractDays(earliestReportDate, CALENDAR_DAYS_BUFFER);
  const to = new Date().toISOString().slice(0, 10);

  console.log(`Earliest earnings.report_date: ${earliestReportDate}`);
  console.log(`Date range used: from=${from} (earliest report_date - ${CALENDAR_DAYS_BUFFER} calendar days) to=${to} (today)\n`);

  const registry = buildProviderRegistry();

  const rows: Array<{ ticker: string; status: string; fetched: string; upserted: string }> = [];

  for (const ticker of DEMO_TICKERS) {
    const company = await getCompanyIdByTicker(ticker);
    if (!company) {
      rows.push({ ticker, status: "SKIPPED (company not found in DB)", fetched: "-", upserted: "-" });
      continue;
    }

    try {
      const outcome = await ingestDailyPrices(company.id, { ticker }, registry.marketData, from, to);
      let status = "REAL";
      if (outcome.status === "unavailable") status = `UNAVAILABLE (${outcome.reason ?? "unknown"})`;
      else if (outcome.status === "error") status = `ERROR (${outcome.reason ?? "unknown"})`;

      rows.push({ ticker, status, fetched: String(outcome.rowsFetched), upserted: String(outcome.rowsUpserted) });
    } catch (e) {
      rows.push({ ticker, status: `ERROR: ${(e as Error).message}`, fetched: "-", upserted: "-" });
    }
  }

  console.log("Ticker | Status | RowsFetched | RowsUpserted");
  console.log("-------|--------|-------------|-------------");
  for (const r of rows) {
    console.log(`${r.ticker.padEnd(6)} | ${r.status.padEnd(60)} | ${r.fetched.padEnd(11)} | ${r.upserted}`);
  }

  const realCount = rows.filter((r) => r.status === "REAL").length;
  const gatedCount = rows.filter((r) => r.status.startsWith("UNAVAILABLE")).length;
  console.log(`\nDaily prices REAL for ${realCount}/${DEMO_TICKERS.length} companies. Gated/unavailable: ${gatedCount}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
