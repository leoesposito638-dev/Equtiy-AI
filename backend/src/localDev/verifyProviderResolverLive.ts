// ============================================================================
// Equity AI — Milestone 8C: ProviderResolver, real live verification
//
// READ-ONLY. Exercises the real, unmodified ProviderResolver wired to the
// real, unmodified SecEdgarAdapter and FmpFinancialDataAdapter, against the
// real SEC EDGAR and FMP APIs. Does NOT write to Supabase, does NOT run the
// ingestion pipeline, does NOT touch calculated_metrics or scoring. Prints
// only shape information (status, provider, counts, period dates) — never a
// full data dump, never a credential.
//
// Requires FMP_API_KEY (see .env.example). SEC_EDGAR_USER_AGENT is read the
// same way IF present — but see the "SEC_TEST_USER_AGENT" note below for
// what happens when it is not configured in this environment.
//
// Run with:
//   npm run verify:resolver-live
// ============================================================================

import { ProviderResolver } from "../providers/resolver";
import { SecEdgarAdapter } from "../providers/adapters/secEdgarAdapter";
import { FmpFinancialDataAdapter } from "../providers/adapters/fmpAdapter";
import { buildProviderRegistry } from "../providers/registry";
import type { FinancialDataProvider, ProviderCompanyRef, ProviderResult, RawLineItem } from "../providers/interfaces";
import type { PeriodType } from "../types/domain";

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

/** Read-only call counter — wraps a real adapter, delegates every call
 *  unmodified, only records how many times each method was invoked. This is
 *  test instrumentation living in the verification script only; it does not
 *  touch resolver.ts or either adapter. */
function countingWrapper(name: string, provider: FinancialDataProvider) {
  const calls = { getIncomeStatement: 0, getBalanceSheet: 0, getCashFlow: 0 };
  const wrapped: FinancialDataProvider = {
    async getIncomeStatement(ref: ProviderCompanyRef, periodType: PeriodType) {
      calls.getIncomeStatement++;
      return provider.getIncomeStatement(ref, periodType);
    },
    async getBalanceSheet(ref: ProviderCompanyRef, periodType: PeriodType) {
      calls.getBalanceSheet++;
      return provider.getBalanceSheet(ref, periodType);
    },
    async getCashFlow(ref: ProviderCompanyRef, periodType: PeriodType) {
      calls.getCashFlow++;
      return provider.getCashFlow(ref, periodType);
    },
  };
  return { name, wrapped, calls };
}

function summarize(label: string, result: ProviderResult<RawLineItem[]>) {
  console.log(`   [${label}] status=${result.status}`);
  if (result.status === "available" && result.data) {
    console.log(`   [${label}] providerName=${result.source?.providerName} providerType=${result.source?.providerType}`);
    console.log(`   [${label}] sourceUrl=${result.source?.sourceUrl ?? "∅"}`);
    console.log(`   [${label}] observations=${result.data.length}`);
    const byMetric = new Map<string, number>();
    for (const item of result.data) byMetric.set(item.metricName, (byMetric.get(item.metricName) ?? 0) + 1);
    for (const [metric, count] of byMetric) {
      const periods = result.data.filter((i) => i.metricName === metric).map((i) => `${i.periodEnd}(${i.periodType})`);
      console.log(`   [${label}]   ${metric}: ${count} period(s) — ${periods.join(", ")}`);
    }
    // Security check: URL must never contain the raw API key / auth secret.
    if (result.source?.sourceUrl && /apikey=/i.test(result.source.sourceUrl) && !/apikey=(&|$)/i.test(result.source.sourceUrl)) {
      console.log(`   [${label}]   ⚠️  sourceUrl appears to contain a live apikey value!`);
    } else {
      console.log(`   [${label}]   ✓ sourceUrl contains no live API key.`);
    }
  } else {
    console.log(`   [${label}] unavailableReason=${result.unavailableReason}`);
  }
}

async function runScenario(
  title: string,
  resolver: ProviderResolver,
  sec: ReturnType<typeof countingWrapper>,
  fmp: ReturnType<typeof countingWrapper>,
  ticker: string
) {
  console.log(`\n${"=".repeat(78)}\n${title} — ${ticker}\n${"=".repeat(78)}`);
  sec.calls.getIncomeStatement = 0;
  fmp.calls.getIncomeStatement = 0;

  const result = await resolver.getIncomeStatement({ ticker }, "ANNUAL");

  console.log(`   SEC calls this scenario:  ${sec.calls.getIncomeStatement}`);
  console.log(`   FMP calls this scenario:  ${fmp.calls.getIncomeStatement}`);
  summarize("RESOLVER RESULT", result);
  return { result, secCalls: sec.calls.getIncomeStatement, fmpCalls: fmp.calls.getIncomeStatement };
}

async function main() {
  console.log(`Equity AI — Milestone 8C: ProviderResolver live verification (read-only)\n`);

  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) fail(`Missing required environment variable: FMP_API_KEY. See .env.example.`);

  const secUserAgentConfigured = process.env.SEC_EDGAR_USER_AGENT;
  console.log(`FMP_API_KEY present: yes (value not printed)`);
  console.log(`SEC_EDGAR_USER_AGENT present in this environment: ${secUserAgentConfigured ? "yes (value not printed)" : "NO"}`);

  // ---------------------------------------------------------------------
  // Honest disclosure: this environment does not have SEC_EDGAR_USER_AGENT
  // configured (confirmed above). Separately, and regardless of that, the
  // sandbox's outbound network policy rejects direct connections to
  // data.sec.gov / www.sec.gov (confirmed via the proxy status endpoint —
  // same limitation documented in Milestones 7A/7B). Neither of these is a
  // ProviderResolver or SecEdgarAdapter code defect.
  //
  // To still exercise the REAL SecEdgarAdapter code path end-to-end (rather
  // than skip it), this script constructs it with a clearly-labeled,
  // non-production placeholder identifier ONLY WHEN SEC_EDGAR_USER_AGENT is
  // absent — this string is never persisted, never written to .env or
  // Supabase, and (per the network block above) is never actually
  // transmitted to SEC's servers, since the connection is rejected before
  // any request leaves this sandbox. If SEC_EDGAR_USER_AGENT IS configured,
  // that real value is used instead, exactly as registry.ts would.
  // ---------------------------------------------------------------------
  const secUserAgentForThisRun =
    secUserAgentConfigured ??
    "EquityAI-Milestone8C-ReadOnlyVerification test@example.com (NOT a production credential, SEC_EDGAR_USER_AGENT unset in this environment)";
  if (!secUserAgentConfigured) {
    console.log(
      `⚠️  SEC_EDGAR_USER_AGENT is not configured in this environment. Using a labeled, non-production ` +
        `placeholder ONLY to construct the real SecEdgarAdapter for this read-only test. This means the ` +
        `production registry.ts, unmodified, would build a FMP-only resolver right now (SEC omitted) — see ` +
        `the final report.`
    );
  }

  const secReal = new SecEdgarAdapter(secUserAgentForThisRun);
  const fmpReal = new FmpFinancialDataAdapter(fmpKey);
  const sec = countingWrapper("SEC EDGAR", secReal);
  const fmp = countingWrapper("FMP", fmpReal);
  const resolver = new ProviderResolver([sec.wrapped, fmp.wrapped]);

  const results: Record<string, Awaited<ReturnType<typeof runScenario>>> = {};

  results.scenario1 = await runScenario("SCENARIO 1 — SEC-first (expected SEC success)", resolver, sec, fmp, "NVDA");
  results.scenario2 = await runScenario("SCENARIO 2 — non-US filer, real FMP fallback attempt", resolver, sec, fmp, "ASML");
  results.scenario3 = await runScenario(
    "SCENARIO 3 — both providers genuinely fail (invalid ticker)",
    resolver,
    sec,
    fmp,
    "ZZZQNOTAREALTICKER99"
  );

  // ---------------------------------------------------------------------
  // Also report exactly what the real, unmodified buildProviderRegistry()
  // constructs in THIS environment right now — the actual production wiring,
  // not the test harness above.
  // ---------------------------------------------------------------------
  console.log(`\n${"=".repeat(78)}\nREAL buildProviderRegistry() IN THIS ENVIRONMENT\n${"=".repeat(78)}`);
  const registry = buildProviderRegistry();
  console.log(`   registry.financialData constructor: ${registry.financialData.constructor.name}`);
  const isResolver = registry.financialData instanceof ProviderResolver;
  console.log(`   Is a ProviderResolver: ${isResolver}`);
  if (isResolver) {
    // Access the private providers list only for reporting purposes (read-only reflection, no mutation).
    const providers = (registry.financialData as unknown as { providers: FinancialDataProvider[] }).providers;
    console.log(`   Underlying provider count: ${providers.length}`);
    console.log(`   Underlying provider classes: ${providers.map((p) => p.constructor.name).join(", ")}`);
  }

  console.log(`\n${"=".repeat(78)}\nDone. Nothing was written to Supabase. No ingestion pipeline was run.\n${"=".repeat(78)}\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
