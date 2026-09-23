// ============================================================================
// Equity AI — Milestone 13F: valuation data foundation ingestion for the
// 30-company demo universe.
//
// Two independent passes, both idempotent/dedup-safe, neither modifying the
// ingestion pipeline itself:
//   1. Re-runs ingestBalanceSheet() (unmodified — SecEdgarAdapter now also
//      returns shares_outstanding as one more line item) so shares
//      outstanding gets picked up through the exact same real pipeline
//      every other balance-sheet fact already goes through.
//   2. Runs the new ingestValuationData() against the registry's marketData
//      provider (FmpMarketDataAdapter when FMP_API_KEY is present) for
//      enterprise_value + the 5 FMP TTM ratios.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone13fValuationIngestion.ts
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestBalanceSheet } from "../ingestion/ingest";
import { ingestValuationData } from "../ingestion/ingestValuationData";
import { buildSupabaseIngestionRepo, getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
import { DEMO_TICKERS } from "../config/demoUniverse";

function fail(m: string): never {
  console.error(`\n❌ ${m}\n`);
  process.exit(1);
}

async function main() {
  console.log("Equity AI — Milestone 13F: valuation data foundation ingestion (30-company demo universe)\n");

  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SEC_EDGAR_USER_AGENT"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}`);

  const registry = buildProviderRegistry();
  const repo = buildSupabaseIngestionRepo();

  const sharesOutstandingResults: Array<{ ticker: string; status: string; reason?: string }> = [];
  const valuationResults: Array<{ ticker: string; quote: string; enterpriseValue: string; ratios: Record<string, string> }> = [];

  for (const ticker of DEMO_TICKERS) {
    const company = await getCompanyIdByTicker(ticker);
    if (!company) {
      sharesOutstandingResults.push({ ticker, status: "SKIPPED", reason: "company not found in DB" });
      valuationResults.push({ ticker, quote: "SKIPPED", enterpriseValue: "SKIPPED", ratios: {} });
      continue;
    }

    // Pass 1: balance sheet re-ingestion (picks up shares_outstanding).
    try {
      const bsResult = await ingestBalanceSheet(company.id, { ticker }, company.currency, "ANNUAL", registry.financialData, repo);
      const hasSharesOutstanding = bsResult.accepted > 0 || bsResult.canonicalSkipped > 0;
      sharesOutstandingResults.push({
        ticker,
        status: hasSharesOutstanding ? "OK (see DB verification for shares_outstanding specifically)" : "NO NEW/EXISTING DATA",
        reason: bsResult.issues.find((i) => i.metricName === "*")?.issues[0]?.message,
      });
    } catch (e) {
      sharesOutstandingResults.push({ ticker, status: "ERROR", reason: (e as Error).message });
    }

    // Pass 2: valuation data (quote + TTM ratios) via marketData provider.
    try {
      const outcome = await ingestValuationData(company.id, { ticker }, registry.marketData);
      valuationResults.push({
        ticker,
        quote: outcome.quote,
        enterpriseValue: outcome.enterpriseValue,
        ratios: outcome.ratios,
      });
    } catch (e) {
      valuationResults.push({ ticker, quote: "ERROR", enterpriseValue: "ERROR", ratios: { error: (e as Error).message } });
    }
  }

  console.log("=== Balance sheet re-ingestion (shares_outstanding pass) ===");
  for (const r of sharesOutstandingResults) console.log(`  ${r.ticker}: ${r.status}${r.reason ? ` — ${r.reason}` : ""}`);

  console.log("\n=== Valuation data ingestion ===");
  for (const r of valuationResults) {
    console.log(`  ${r.ticker}: quote=${r.quote} ev=${r.enterpriseValue} ratios=${JSON.stringify(r.ratios)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
