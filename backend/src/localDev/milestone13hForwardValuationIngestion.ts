// ============================================================================
// Equity AI — Milestone 13H: Forward P/E ingestion for the 30-company demo
// universe.
//
// Runs ingestForwardValuation() against the registry's earnings + marketData
// providers (FmpEarningsAdapter / FmpMarketDataAdapter when FMP_API_KEY is
// present) for every ticker in DEMO_TICKERS, and prints a per-company
// report: latest reported FY, selected forward FY, forward EPS, analyst
// count, live price, Forward P/E, and status/reason when unavailable.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone13hForwardValuationIngestion.ts
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestForwardValuation } from "../ingestion/ingestForwardValuation";
import { getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
import { DEMO_TICKERS } from "../config/demoUniverse";

function fail(m: string): never {
  console.error(`\n❌ ${m}\n`);
  process.exit(1);
}

async function main() {
  console.log("Equity AI — Milestone 13H: Forward P/E ingestion (30-company demo universe)\n");

  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}`);

  const registry = buildProviderRegistry();

  const rows: Array<{
    ticker: string;
    latestReportedFY: string;
    selectedForwardFY: string;
    forwardEps: string;
    analystCount: string;
    livePrice: string;
    forwardPe: string;
    status: string;
  }> = [];

  for (const ticker of DEMO_TICKERS) {
    const company = await getCompanyIdByTicker(ticker);
    if (!company) {
      rows.push({
        ticker,
        latestReportedFY: "-",
        selectedForwardFY: "-",
        forwardEps: "-",
        analystCount: "-",
        livePrice: "-",
        forwardPe: "-",
        status: "SKIPPED (company not found in DB)",
      });
      continue;
    }

    try {
      const outcome = await ingestForwardValuation(company.id, { ticker }, registry.earnings, registry.marketData);
      let status = "REAL";
      if (outcome.estimatesStatus === "unavailable") status = `UNAVAILABLE (estimates: ${outcome.reason ?? "unknown"})`;
      else if (outcome.forwardEps.status === "unavailable") status = `FORWARD EPS UNAVAILABLE (${outcome.forwardEps.reason ?? "unknown"})`;
      else if (outcome.livePrice.status !== "available") status = `LIVE PRICE UNAVAILABLE (${outcome.livePrice.reason ?? "unknown"})`;
      else if (outcome.forwardPe === "stored" || outcome.forwardPe === "skipped_existing") status = "REAL";
      else status = `FORWARD P/E UNAVAILABLE`;

      rows.push({
        ticker,
        latestReportedFY: outcome.latestReportedPeriodEnd ?? "-",
        selectedForwardFY: outcome.forwardEps.periodEnd ?? "-",
        forwardEps: outcome.forwardEps.value != null ? outcome.forwardEps.value.toFixed(5) : "-",
        analystCount: outcome.forwardEps.analystCount != null ? String(outcome.forwardEps.analystCount) : "-",
        livePrice: outcome.livePrice.value != null ? outcome.livePrice.value.toFixed(2) : "-",
        forwardPe: outcome.forwardPeValue != null ? outcome.forwardPeValue.toFixed(2) : "-",
        status,
      });
    } catch (e) {
      rows.push({
        ticker,
        latestReportedFY: "-",
        selectedForwardFY: "-",
        forwardEps: "-",
        analystCount: "-",
        livePrice: "-",
        forwardPe: "-",
        status: `ERROR: ${(e as Error).message}`,
      });
    }
  }

  console.log("Ticker | LatestReportedFY | SelectedForwardFY | ForwardEPS | #Analysts | LivePrice | ForwardPE | Status");
  console.log("-------|------------------|--------------------|------------|-----------|-----------|-----------|-------");
  for (const r of rows) {
    console.log(
      `${r.ticker.padEnd(6)} | ${r.latestReportedFY.padEnd(16)} | ${r.selectedForwardFY.padEnd(18)} | ${r.forwardEps.padEnd(10)} | ${r.analystCount.padEnd(9)} | ${r.livePrice.padEnd(9)} | ${r.forwardPe.padEnd(9)} | ${r.status}`
    );
  }

  const realCount = rows.filter((r) => r.status === "REAL").length;
  console.log(`\nForward P/E REAL for ${realCount}/${DEMO_TICKERS.length} companies.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
