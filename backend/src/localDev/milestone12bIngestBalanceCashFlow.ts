// ============================================================================
// Equity AI — Milestone 12B: SEC balance-sheet + cash-flow ingestion for the
// 30-company demo universe.
//
// Real production pipeline, mirroring ingestDemo30Companies.ts exactly:
// buildProviderRegistry() (SEC EDGAR -> FMP resolver, unmodified) ->
// ingestBalanceSheet() / ingestCashFlow() -> buildSupabaseIngestionRepo().
// No pipeline code modified by this script. Does not create companies (all
// 30 must already exist). No calculated_metrics, no scoring, no benchmarks
// — those are separate scripts (Phase 5/8/9).
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone12bIngestBalanceCashFlow.ts
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestIncomeStatement, ingestBalanceSheet, ingestCashFlow } from "../ingestion/ingest";
import { buildSupabaseIngestionRepo, getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
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
  const calls = { getIncomeStatement: 0, getBalanceSheet: 0, getCashFlow: 0 };
  const lastResult: { incomeStatement?: ProviderResult<RawLineItem[]>; balanceSheet?: ProviderResult<RawLineItem[]>; cashFlow?: ProviderResult<RawLineItem[]> } = {};
  const wrapped: FinancialDataProvider = {
    async getIncomeStatement(ref: ProviderCompanyRef, periodType: PeriodType) {
      calls.getIncomeStatement++;
      const result = await provider.getIncomeStatement(ref, periodType);
      lastResult.incomeStatement = result;
      return result;
    },
    async getBalanceSheet(ref: ProviderCompanyRef, periodType: PeriodType) {
      calls.getBalanceSheet++;
      const result = await provider.getBalanceSheet(ref, periodType);
      lastResult.balanceSheet = result;
      return result;
    },
    async getCashFlow(ref: ProviderCompanyRef, periodType: PeriodType) {
      calls.getCashFlow++;
      const result = await provider.getCashFlow(ref, periodType);
      lastResult.cashFlow = result;
      return result;
    },
  };
  return { wrapped, calls, getLastResult: () => lastResult };
}

async function main() {
  console.log(`Equity AI — Milestone 12B: SEC balance-sheet + cash-flow ingestion (30-company demo universe)\n`);

  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SEC_EDGAR_USER_AGENT"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);

  const db = getDbClient();
  const results: Array<Record<string, unknown>> = [];

  for (const ticker of TICKERS) {
    console.log(`\n${"=".repeat(78)}\n${ticker}\n${"=".repeat(78)}`);

    const company = await getCompanyIdByTicker(ticker);
    if (!company) {
      console.log(`   ❌ No companies row for ${ticker} — SKIPPED.`);
      results.push({ ticker, status: "NO_COMPANY_ROW" });
      continue;
    }

    const registry = buildProviderRegistry();
    const underlying = (registry.financialData as unknown as { providers: FinancialDataProvider[] }).providers ?? [];
    const wrappers = underlying.map((p) => ({ name: p.constructor.name, ...countingWrapper(p) }));
    underlying.forEach((_, i) => { underlying[i] = wrappers[i].wrapped; });

    const repo = buildSupabaseIngestionRepo();

    let isResult, bsResult, cfResult;
    try {
      // Re-runs the EXISTING, unmodified ingestIncomeStatement — revenue/
      // net_income/eps already exist canonically from Milestone 10A and
      // will gracefully canonicalSkip; the 4 new facts (gross_profit,
      // operating_income, interest_expense, research_development) are new
      // canonical rows.
      isResult = await ingestIncomeStatement(company.id, { ticker }, company.currency, "ANNUAL", registry.financialData, repo);
      bsResult = await ingestBalanceSheet(company.id, { ticker }, company.currency, "ANNUAL", registry.financialData, repo);
      cfResult = await ingestCashFlow(company.id, { ticker }, company.currency, "ANNUAL", registry.financialData, repo);
    } catch (e) {
      console.log(`   ❌ ingestion threw: ${(e as Error).message}`);
      results.push({ ticker, status: "INGEST_ERROR", error: (e as Error).message });
      continue;
    }

    const isLast = wrappers.map((w) => w.getLastResult().incomeStatement).find((r) => r?.status === "available");
    const bsLast = wrappers.map((w) => w.getLastResult().balanceSheet).find((r) => r?.status === "available");
    const cfLast = wrappers.map((w) => w.getLastResult().cashFlow).find((r) => r?.status === "available");
    const isProvider = isLast?.source?.providerName ?? "NONE";
    const bsProvider = bsLast?.source?.providerName ?? "NONE";
    const cfProvider = cfLast?.source?.providerName ?? "NONE";

    console.log(`Income stmt:   provider=${isProvider} accepted=${isResult.accepted} rejected=${isResult.rejected} canonicalSkipped=${isResult.canonicalSkipped}`);
    for (const issue of isResult.issues) for (const i of issue.issues) console.log(`   [${issue.metricName}] ${i.code}: ${i.message}`);
    console.log(`Balance sheet: provider=${bsProvider} accepted=${bsResult.accepted} rejected=${bsResult.rejected} canonicalSkipped=${bsResult.canonicalSkipped}`);
    for (const issue of bsResult.issues) for (const i of issue.issues) console.log(`   [${issue.metricName}] ${i.code}: ${i.message}`);
    console.log(`Cash flow:     provider=${cfProvider} accepted=${cfResult.accepted} rejected=${cfResult.rejected} canonicalSkipped=${cfResult.canonicalSkipped}`);
    for (const issue of cfResult.issues) for (const i of issue.issues) console.log(`   [${issue.metricName}] ${i.code}: ${i.message}`);

    const rawCount = await (async () => {
      const { count, error } = await db.from("raw_financial_data").select("*", { count: "exact", head: true }).eq("company_id", company.id);
      if (error) throw new Error(error.message);
      return count ?? 0;
    })();

    results.push({
      ticker, companyId: company.id,
      isProvider, isAccepted: isResult.accepted, isRejected: isResult.rejected, isCanonicalSkipped: isResult.canonicalSkipped,
      bsProvider, bsAccepted: bsResult.accepted, bsRejected: bsResult.rejected,
      cfProvider, cfAccepted: cfResult.accepted, cfRejected: cfResult.rejected,
      rawCountAfter: rawCount,
    });
  }

  console.log(`\n${"=".repeat(78)}\nSUMMARY\n${"=".repeat(78)}`);
  for (const r of results) console.log(JSON.stringify(r));

  const bsSuccess = results.filter((r) => (r.bsAccepted as number) > 0);
  const cfSuccess = results.filter((r) => (r.cfAccepted as number) > 0);
  console.log(`\nBalance sheet: ${bsSuccess.length}/${TICKERS.length} companies got >=1 real fact.`);
  console.log(`Cash flow:     ${cfSuccess.length}/${TICKERS.length} companies got >=1 real fact.`);
  console.log(`\nDone.\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
