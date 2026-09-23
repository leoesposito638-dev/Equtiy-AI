// ============================================================================
// Equity AI — Milestone 7B: SEC EDGAR adapter, real live verification
//
// READ-ONLY. Calls the real, unmodified SecEdgarAdapter against the real
// SEC API for 5 representative companies. Does NOT write to Supabase, does
// NOT run the ingestion pipeline, does NOT touch calculated_metrics or
// scoring. Purely prints what the adapter returns, for direct human/report
// verification — the same role testFmpNvidiaRevenue.ts played for the FMP
// adapter's first real run, but without the Supabase-writing steps.
//
// Requires SEC_EDGAR_USER_AGENT in the environment (see .env.example) —
// never read from anywhere else, never hardcoded.
//
// Run with:
//   npm run verify:sec-edgar
// ============================================================================

import { SecEdgarAdapter } from "../providers/adapters/secEdgarAdapter";

const TICKERS = ["NVDA", "AAPL", "MSFT", "JPM", "KO"];

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

async function main() {
  console.log(`Equity AI — Milestone 7B: SEC EDGAR adapter live verification (read-only)\n`);

  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) fail(`Missing required environment variable: SEC_EDGAR_USER_AGENT. See .env.example.`);

  const adapter = new SecEdgarAdapter(userAgent!);

  for (const ticker of TICKERS) {
    console.log(`\n${"=".repeat(70)}\n${ticker}\n${"=".repeat(70)}`);
    const result = await adapter.getIncomeStatement({ ticker }, "ANNUAL");

    if (result.status !== "available" || !result.data) {
      console.log(`   ❌ unavailable: ${result.unavailableReason}`);
      continue;
    }

    console.log(`   source: providerName=${result.source?.providerName} sourceUrl=${result.source?.sourceUrl}`);
    console.log(`   sourceDocumentId (accession#)=${result.source?.sourceDocumentId}  filingDate=${result.source?.filingDate}`);

    const byMetric = new Map<string, typeof result.data>();
    for (const item of result.data) {
      const list = byMetric.get(item.metricName) ?? [];
      list.push(item);
      byMetric.set(item.metricName, list);
    }
    for (const metricName of ["revenue", "net_income", "eps"]) {
      const items = (byMetric.get(metricName) ?? []).sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
      console.log(`   ${metricName} (${items.length} period(s)):`);
      for (const item of items) {
        console.log(
          `      periodEnd=${item.periodEnd}  periodStart=${item.periodStart ?? "∅"}  value=${item.rawValue}  unit=${item.unit}  currency=${item.currency}  filingDate=${item.filingDate}  tag=${item.metricIdentifier}`
        );
      }
    }
  }

  console.log(`\n${"=".repeat(70)}\nDone. Nothing was written to Supabase. No ingestion pipeline was run.\n${"=".repeat(70)}\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
