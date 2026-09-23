// ============================================================================
// Equity AI — Milestone 10A: 30-company US demo universe ingestion
//
// Real production pipeline for all 30 companies: buildProviderRegistry()
// (SEC EDGAR -> FMP resolver, unmodified) -> ingestIncomeStatement() ->
// buildSupabaseIngestionRepo() -> calculateAndStoreGrowthMetrics() ->
// backfillGrowthMetrics(). No pipeline code modified. Does not create
// companies (all 30 must already exist — provisionDemo30Companies.ts ran
// first for the 24 new ones). No scoring, no benchmarks.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/ingestDemo30Companies.ts
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestIncomeStatement } from "../ingestion/ingest";
import { buildSupabaseIngestionRepo, getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
import { calculateAndStoreGrowthMetrics, backfillGrowthMetrics } from "../calculations/supabaseGrowthMetricsRepo";
import { getDbClient } from "../db/client";
import type { FinancialDataProvider, ProviderCompanyRef, ProviderResult, RawLineItem } from "../providers/interfaces";
import type { PeriodType } from "../types/domain";

function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }

const TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

function countingWrapper(provider: FinancialDataProvider) {
  const calls = { getIncomeStatement: 0 };
  let lastResult: ProviderResult<RawLineItem[]> | undefined;
  const wrapped: FinancialDataProvider = {
    async getIncomeStatement(ref: ProviderCompanyRef, periodType: PeriodType) {
      calls.getIncomeStatement++;
      const result = await provider.getIncomeStatement(ref, periodType);
      lastResult = result;
      return result;
    },
    async getBalanceSheet(ref, periodType) { return provider.getBalanceSheet(ref, periodType); },
    async getCashFlow(ref, periodType) { return provider.getCashFlow(ref, periodType); },
  };
  return { wrapped, calls, getLastResult: () => lastResult };
}

async function main() {
  console.log(`Equity AI — Milestone 10A: 30-company US demo universe ingestion\n`);

  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SEC_EDGAR_USER_AGENT"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);

  const db = getDbClient();
  const results: Array<Record<string, unknown>> = [];

  for (const ticker of TICKERS) {
    console.log(`\n${"=".repeat(78)}\n${ticker}\n${"=".repeat(78)}`);

    const company = await getCompanyIdByTicker(ticker);
    if (!company) {
      console.log(`   ❌ No companies row for ${ticker} — SKIPPED (this script does not create companies).`);
      results.push({ ticker, status: "NO_COMPANY_ROW" });
      continue;
    }
    console.log(`1. company_id=${company.id} currency=${company.currency}`);

    // Fresh registry + instrumentation per company so call counts don't leak across tickers.
    const registry = buildProviderRegistry();
    const underlying = (registry.financialData as unknown as { providers: FinancialDataProvider[] }).providers ?? [];
    const wrappers = underlying.map((p) => ({ name: p.constructor.name, ...countingWrapper(p) }));
    underlying.forEach((_, i) => { underlying[i] = wrappers[i].wrapped; });

    const repo = buildSupabaseIngestionRepo();
    let ingestResult;
    try {
      ingestResult = await ingestIncomeStatement(company.id, { ticker }, company.currency, "ANNUAL", registry.financialData, repo);
    } catch (e) {
      console.log(`   ❌ ingestIncomeStatement threw: ${(e as Error).message}`);
      results.push({ ticker, status: "INGEST_ERROR", error: (e as Error).message });
      continue;
    }

    const winner = wrappers.find((w) => (w.getLastResult()?.status ?? "unavailable") === "available");
    const providerSelected = winner ? winner.getLastResult()?.source?.providerName : "NONE";
    const secCalls = wrappers.find((w) => w.name === "SecEdgarAdapter")?.calls.getIncomeStatement ?? 0;
    const fmpCalls = wrappers.find((w) => w.name === "FmpFinancialDataAdapter")?.calls.getIncomeStatement ?? 0;

    console.log(`2. provider=${providerSelected} secCalls=${secCalls} fmpCalls=${fmpCalls}`);
    console.log(`   ingestIncomeStatement: accepted=${ingestResult.accepted} rejected=${ingestResult.rejected} canonicalSkipped=${ingestResult.canonicalSkipped}`);
    for (const issue of ingestResult.issues) {
      for (const i of issue.issues) console.log(`      [${issue.metricName}] ${i.code}: ${i.message}`);
    }

    let growthResult: Awaited<ReturnType<typeof calculateAndStoreGrowthMetrics>> = [];
    let backfillResult: Awaited<ReturnType<typeof backfillGrowthMetrics>> = [];
    if (providerSelected !== "NONE") {
      growthResult = await calculateAndStoreGrowthMetrics(company.id);
      console.log(`3. calculateAndStoreGrowthMetrics:`);
      for (const o of growthResult) {
        if (o.result.value !== null) {
          console.log(`      ✅ ${o.metricName.padEnd(22)} = ${o.result.value.toFixed(4)}  ${o.stored ? `stored` : `NOT STORED: ${o.storeError}`}`);
        } else {
          console.log(`      ⚪ ${o.metricName.padEnd(22)} unavailable — ${o.result.reason}`);
        }
      }
      backfillResult = await backfillGrowthMetrics(company.id);
      const backfillStored = backfillResult.filter((o) => o.stored);
      console.log(`4. backfillGrowthMetrics: ${backfillStored.length} newly stored, ${backfillResult.length - backfillStored.length} skipped.`);
    } else {
      console.log(`3. Skipped growth calculation — no provider succeeded for this company.`);
    }

    const rawCount = await (async () => {
      const { count, error } = await db.from("raw_financial_data").select("*", { count: "exact", head: true }).eq("company_id", company.id);
      if (error) throw new Error(error.message);
      return count ?? 0;
    })();
    const fmCount = await (async () => {
      const { count, error } = await db.from("financial_metrics").select("*", { count: "exact", head: true }).eq("company_id", company.id);
      if (error) throw new Error(error.message);
      return count ?? 0;
    })();
    const cmCount = await (async () => {
      const { count, error } = await db.from("calculated_metrics").select("*", { count: "exact", head: true }).eq("company_id", company.id);
      if (error) throw new Error(error.message);
      return count ?? 0;
    })();
    console.log(`5. Final row counts: raw_financial_data=${rawCount} financial_metrics=${fmCount} calculated_metrics=${cmCount}`);

    results.push({
      ticker,
      companyId: company.id,
      status: providerSelected !== "NONE" ? "SUCCESS" : "PROVIDER_UNAVAILABLE",
      providerSelected,
      secCalls,
      fmpCalls,
      accepted: ingestResult.accepted,
      rejected: ingestResult.rejected,
      canonicalSkipped: ingestResult.canonicalSkipped,
      rawCount,
      fmCount,
      cmCount,
      growthAvailable: growthResult.filter((o) => o.result.value !== null).length,
      growthUnavailable: growthResult.filter((o) => o.result.value === null).length,
      unavailableReason: providerSelected === "NONE" ? ingestResult.issues.map((i) => i.issues.map((x) => x.message).join(" ")).join(" ") : undefined,
    });
  }

  console.log(`\n${"=".repeat(78)}\nSUMMARY\n${"=".repeat(78)}`);
  for (const r of results) console.log(JSON.stringify(r));

  const success = results.filter((r) => r.status === "SUCCESS");
  const unavailable = results.filter((r) => r.status === "PROVIDER_UNAVAILABLE");
  const secUsed = success.filter((r) => r.providerSelected === "SEC EDGAR");
  const fmpUsed = success.filter((r) => r.providerSelected === "Financial Modeling Prep");
  console.log(`\nTotal: ${results.length}. Success: ${success.length}. Provider unavailable: ${unavailable.length}.`);
  console.log(`SEC selected: ${secUsed.length}. FMP selected: ${fmpUsed.length}.`);
  console.log(`\nDone.\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
