// ============================================================================
// Equity AI — Milestone 14B: earnings (EPS/revenue surprise) ingestion for
// the 30-company demo universe.
//
// Runs ingestEarnings() against the registry's earnings provider
// (FmpEarningsAdapter when FMP_API_KEY is present) for every ticker in
// DEMO_TICKERS, and prints a per-company report: rows stored/skipped,
// historical vs upcoming counts, and EPS/revenue surprise outcomes
// (stored / unavailable / rejected by the data-quality guard).
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone14bEarningsIngestion.ts
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestEarnings } from "../ingestion/ingestEarnings";
import { getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
import { DEMO_TICKERS } from "../config/demoUniverse";

function fail(m: string): never {
  console.error(`\n❌ ${m}\n`);
  process.exit(1);
}

async function main() {
  console.log("Equity AI — Milestone 14B: earnings ingestion (30-company demo universe)\n");

  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}`);

  const registry = buildProviderRegistry();

  const rows: Array<{
    ticker: string;
    status: string;
    stored: string;
    skipped: string;
    historical: string;
    upcoming: string;
    epsSurprise: string;
    revenueSurprise: string;
  }> = [];

  for (const ticker of DEMO_TICKERS) {
    const company = await getCompanyIdByTicker(ticker);
    if (!company) {
      rows.push({ ticker, status: "SKIPPED (company not found in DB)", stored: "-", skipped: "-", historical: "-", upcoming: "-", epsSurprise: "-", revenueSurprise: "-" });
      continue;
    }

    try {
      const outcome = await ingestEarnings(company.id, { ticker }, registry.earnings);
      let status = "REAL";
      if (outcome.earningsStatus === "unavailable") status = `UNAVAILABLE (${outcome.reason ?? "unknown"})`;
      else if (outcome.earningsStatus === "error") status = `ERROR (${outcome.reason ?? "unknown"})`;

      rows.push({
        ticker,
        status,
        stored: String(outcome.rowsStored),
        skipped: String(outcome.rowsSkippedExisting),
        historical: String(outcome.historicalRows),
        upcoming: String(outcome.upcomingRows),
        epsSurprise: `stored=${outcome.epsSurprise.stored} unavail=${outcome.epsSurprise.unavailable} guard=${outcome.epsSurprise.rejectedByGuard}`,
        revenueSurprise: `stored=${outcome.revenueSurprise.stored} unavail=${outcome.revenueSurprise.unavailable} guard=${outcome.revenueSurprise.rejectedByGuard}`,
      });
    } catch (e) {
      rows.push({ ticker, status: `ERROR: ${(e as Error).message}`, stored: "-", skipped: "-", historical: "-", upcoming: "-", epsSurprise: "-", revenueSurprise: "-" });
    }
  }

  console.log("Ticker | Status | Stored | Skipped | Historical | Upcoming | EPS Surprise | Revenue Surprise");
  console.log("-------|--------|--------|---------|------------|----------|--------------|------------------");
  for (const r of rows) {
    console.log(
      `${r.ticker.padEnd(6)} | ${r.status.padEnd(45)} | ${r.stored.padEnd(6)} | ${r.skipped.padEnd(7)} | ${r.historical.padEnd(10)} | ${r.upcoming.padEnd(8)} | ${r.epsSurprise.padEnd(35)} | ${r.revenueSurprise}`
    );
  }

  const realCount = rows.filter((r) => r.status === "REAL").length;
  const gatedCount = rows.filter((r) => r.status.startsWith("UNAVAILABLE")).length;
  console.log(`\nEarnings REAL for ${realCount}/${DEMO_TICKERS.length} companies. Gated/unavailable: ${gatedCount}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
