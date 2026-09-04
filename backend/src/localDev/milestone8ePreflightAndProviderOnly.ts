// ============================================================================
// Equity AI — Milestone 8E, Phases 1-2: TXN / IBM / ASML pre-flight +
// provider-only live test (READ-ONLY, no writes, no ingestIncomeStatement)
//
// Phase 1: confirm each company exists, record company_id/sector/industry,
// record current row counts (data_sources global, raw_financial_data /
// financial_metrics / calculated_metrics per company).
//
// Phase 2: call the REAL, unmodified buildProviderRegistry() resolver's
// getIncomeStatement() directly for each ticker (instrumented read-only for
// call-count reporting, same technique as prior milestones). Does NOT call
// ingestIncomeStatement. Does NOT write to Supabase.
//
// Run with:
//   npm run milestone8e:preflight
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { getDbClient } from "../db/client";
import type { PeriodType } from "../types/domain";
import type { FinancialDataProvider, ProviderCompanyRef, ProviderResult, RawLineItem } from "../providers/interfaces";

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

const TICKERS = ["TXN", "IBM", "ASML"];

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
    async getBalanceSheet(ref, periodType) {
      return provider.getBalanceSheet(ref, periodType);
    },
    async getCashFlow(ref, periodType) {
      return provider.getCashFlow(ref, periodType);
    },
  };
  return { wrapped, calls, getLastResult: () => lastResult };
}

function attributeProviderCalls(registryProvider: FinancialDataProvider) {
  const underlying = (registryProvider as unknown as { providers: FinancialDataProvider[] }).providers ?? [];
  const wrappers = underlying.map((p) => ({ name: p.constructor.name, ...countingWrapper(p) }));
  underlying.forEach((_, i) => {
    underlying[i] = wrappers[i].wrapped;
  });
  return wrappers;
}

async function countRows(table: string, companyId: string): Promise<number> {
  const db = getDbClient();
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("company_id", companyId);
  if (error) throw new Error(`${table} count(${companyId}) failed: ${error.message}`);
  return count ?? 0;
}

async function countAll(table: string): Promise<number> {
  const db = getDbClient();
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} count(all) failed: ${error.message}`);
  return count ?? 0;
}

async function main() {
  console.log(`Equity AI — Milestone 8E Phases 1-2: TXN / IBM / ASML pre-flight + provider-only live test\n`);

  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SEC_EDGAR_USER_AGENT"].filter(
    (k) => !process.env[k]
  );
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);

  const db = getDbClient();

  console.log(`${"=".repeat(78)}\nPHASE 1 — PRE-FLIGHT READ-ONLY CHECK\n${"=".repeat(78)}`);
  const companies: Record<string, { id: string; currency: string } | null> = {};
  for (const ticker of TICKERS) {
    const { data, error } = await db
      .from("companies")
      .select("id, currency, sector, industry, is_active")
      .eq("ticker", ticker)
      .eq("is_active", true)
      .maybeSingle();
    if (error) fail(`companies lookup for ${ticker} failed: ${error.message}`);
    if (!data) {
      console.log(`   ${ticker}: ❌ NOT FOUND in companies table — this pilot will SKIP this ticker.`);
      companies[ticker] = null;
      continue;
    }
    companies[ticker] = { id: data.id as string, currency: (data.currency as string) ?? "USD" };
    console.log(`   ${ticker}: company_id=${data.id} sector=${data.sector ?? "∅"} industry=${data.industry ?? "∅"} currency=${data.currency ?? "∅"}`);
    const raw = await countRows("raw_financial_data", data.id as string);
    const fm = await countRows("financial_metrics", data.id as string);
    const cm = await countRows("calculated_metrics", data.id as string);
    console.log(`      counts — raw_financial_data=${raw} financial_metrics=${fm} calculated_metrics=${cm}`);
  }
  const dataSourcesAllBefore = await countAll("data_sources");
  console.log(`   data_sources (all, global): ${dataSourcesAllBefore}`);

  const missingCompanies = TICKERS.filter((t) => !companies[t]);
  if (missingCompanies.length > 0) {
    fail(`Missing companies row(s) for: ${missingCompanies.join(", ")} — this milestone does not create companies. Fix data first.`);
  }

  console.log(`\n${"=".repeat(78)}\nPHASE 2 — PROVIDER-ONLY LIVE TEST (no writes, no ingestIncomeStatement)\n${"=".repeat(78)}`);

  for (const ticker of TICKERS) {
    console.log(`\n--- ${ticker} ---`);
    const registry = buildProviderRegistry();
    const wrappers = attributeProviderCalls(registry.financialData);

    const result = await registry.financialData.getIncomeStatement({ ticker }, "ANNUAL");

    for (const w of wrappers) {
      console.log(`   ${w.name}: attempted=${w.calls.getIncomeStatement > 0} calls=${w.calls.getIncomeStatement} status=${w.getLastResult()?.status ?? "n/a (not called)"}`);
    }
    const winner = wrappers.find((w) => (w.getLastResult()?.status ?? "unavailable") === "available");
    console.log(`   Selected provider: ${winner ? winner.getLastResult()?.source?.providerName : "NONE"}`);
    console.log(`   Overall status: ${result.status}`);
    if (result.status === "available" && result.data) {
      console.log(`   Observation count: ${result.data.length}`);
      const byMetric = new Map<string, number>();
      for (const item of result.data) byMetric.set(item.metricName, (byMetric.get(item.metricName) ?? 0) + 1);
      for (const [m, c] of byMetric) console.log(`      ${m}: ${c} period(s)`);
    } else {
      console.log(`   Unavailable reason: ${result.unavailableReason}`);
    }
  }

  console.log(`\n${"=".repeat(78)}\nEND OF PHASE 1-2. No writes were performed. Review before proceeding to Phase 3.\n${"=".repeat(78)}\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
