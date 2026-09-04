// ============================================================================
// Equity AI — Milestone 13E: re-run SEC income-statement ingestion for the
// 30-company demo universe to pick up the 2 newly-added tax_expense/
// pretax_income raw facts. Real production pipeline (ingestIncomeStatement,
// unmodified), mirroring milestone13cIngestDebt.ts exactly. Already-ingested
// facts (revenue, net_income, etc.) will be gracefully rejected as
// DUPLICATE_OBSERVATION by the (already correctly period-type-scoped since
// the 13C fix) raw dedupe — only the 2 new metrics should produce new
// canonical rows.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone13eIngestTax.ts
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestIncomeStatement } from "../ingestion/ingest";
import { buildSupabaseIngestionRepo, getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";

function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }

const TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

async function main() {
  console.log(`Equity AI — Milestone 13E: SEC income-statement re-ingestion for tax concepts (30-company demo universe)\n`);

  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SEC_EDGAR_USER_AGENT"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);

  const results: Array<Record<string, unknown>> = [];

  for (const ticker of TICKERS) {
    const company = await getCompanyIdByTicker(ticker);
    if (!company) {
      console.log(`${ticker}: ❌ no companies row — SKIPPED.`);
      results.push({ ticker, status: "NO_COMPANY_ROW" });
      continue;
    }

    const registry = buildProviderRegistry();
    const repo = buildSupabaseIngestionRepo();

    let isResult;
    try {
      isResult = await ingestIncomeStatement(company.id, { ticker }, company.currency, "ANNUAL", registry.financialData, repo);
    } catch (e) {
      console.log(`${ticker}: ❌ ingestion threw: ${(e as Error).message}`);
      results.push({ ticker, status: "INGEST_ERROR", error: (e as Error).message });
      continue;
    }

    console.log(`${ticker.padEnd(6)} accepted=${isResult.accepted} rejected=${isResult.rejected} canonicalSkipped=${isResult.canonicalSkipped}`);
    for (const issue of isResult.issues) {
      for (const i of issue.issues) {
        if (i.code !== "DUPLICATE_OBSERVATION") console.log(`   [${issue.metricName}] ${i.code}: ${i.message}`);
      }
    }
    results.push({ ticker, accepted: isResult.accepted, rejected: isResult.rejected, canonicalSkipped: isResult.canonicalSkipped });
  }

  console.log(`\n${"=".repeat(78)}\nSUMMARY\n${"=".repeat(78)}`);
  const totalAccepted = results.reduce((s, r) => s + ((r.accepted as number) ?? 0), 0);
  const totalRejected = results.reduce((s, r) => s + ((r.rejected as number) ?? 0), 0);
  const totalSkipped = results.reduce((s, r) => s + ((r.canonicalSkipped as number) ?? 0), 0);
  console.log(`Total new canonical rows accepted: ${totalAccepted}. Total rejected (real dupes): ${totalRejected}. Total gracefully skipped (already existed): ${totalSkipped}.`);
  console.log(`\nDone.\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
