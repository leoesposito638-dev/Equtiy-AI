// ============================================================================
// Equity AI — Milestone 13C Phase A: re-run SEC balance-sheet ingestion for
// the 30-company demo universe to pick up the 3 newly-added debt-component
// raw facts (long_term_debt_current, long_term_debt_noncurrent,
// short_term_borrowings). Real production pipeline
// (ingestBalanceSheet, unmodified), mirroring milestone12bIngestBalanceCashFlow.ts
// exactly. Already-ingested facts (cash, total_assets, equity, etc.) will be
// gracefully canonicalSkipped by the existing provider-scoped raw dedupe —
// only the 3 new metrics should produce new canonical rows.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone13cIngestDebt.ts
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestBalanceSheet } from "../ingestion/ingest";
import { buildSupabaseIngestionRepo, getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";

function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }

const TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

async function main() {
  console.log(`Equity AI — Milestone 13C: SEC balance-sheet re-ingestion for debt concepts (30-company demo universe)\n`);

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

    let bsResult;
    try {
      bsResult = await ingestBalanceSheet(company.id, { ticker }, company.currency, "ANNUAL", registry.financialData, repo);
    } catch (e) {
      console.log(`${ticker}: ❌ ingestion threw: ${(e as Error).message}`);
      results.push({ ticker, status: "INGEST_ERROR", error: (e as Error).message });
      continue;
    }

    console.log(`${ticker.padEnd(6)} accepted=${bsResult.accepted} rejected=${bsResult.rejected} canonicalSkipped=${bsResult.canonicalSkipped}`);
    for (const issue of bsResult.issues) {
      for (const i of issue.issues) {
        if (i.code !== "DUPLICATE_OBSERVATION") console.log(`   [${issue.metricName}] ${i.code}: ${i.message}`);
      }
    }
    results.push({ ticker, accepted: bsResult.accepted, rejected: bsResult.rejected, canonicalSkipped: bsResult.canonicalSkipped });
  }

  console.log(`\n${"=".repeat(78)}\nSUMMARY\n${"=".repeat(78)}`);
  const totalAccepted = results.reduce((s, r) => s + ((r.accepted as number) ?? 0), 0);
  const totalSkipped = results.reduce((s, r) => s + ((r.canonicalSkipped as number) ?? 0), 0);
  console.log(`Total new canonical rows accepted: ${totalAccepted}. Total gracefully skipped (already existed): ${totalSkipped}.`);
  console.log(`\nDone.\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
