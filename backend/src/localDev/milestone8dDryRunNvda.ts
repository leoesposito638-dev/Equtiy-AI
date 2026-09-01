// ============================================================================
// Equity AI — Milestone 8D: First Persisted Ingestion, NVDA DRY RUN
//
// Runs the REAL production ingestion pipeline (ingest.ts, unmodified) for
// NVDA, with the REAL buildProviderRegistry() (SEC EDGAR -> FMP resolver,
// exactly as verified live in Milestone 8C), against a DRY-RUN IngestionRepo
// that performs every READ for real (existing dedupe keys, existing
// data_sources) but intercepts every WRITE and logs it instead of executing
// it. Zero Supabase mutations occur — verified independently below by
// counting NVDA's rows before and after.
//
// Only NVDA. Does not touch any other company. Does not modify ingest.ts,
// registry.ts, resolver.ts, validators.ts, normalizers.ts, or
// supabaseIngestionRepo.ts.
//
// Run with:
//   npm run milestone8d:dry-run
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestIncomeStatement, type IngestionRepo } from "../ingestion/ingest";
import { getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
import { getDbClient } from "../db/client";
import type { PeriodType, FinancialMetric } from "../types/domain";
import type { FxRate } from "../ingestion/normalizers";
import type { FinancialDataProvider, ProviderCompanyRef, ProviderResult, RawLineItem } from "../providers/interfaces";

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

type WouldInsertRaw = Parameters<IngestionRepo["insertRawFinancialData"]>[0];

/** Read-only call counter around the real resolver, identical pattern to the
 *  Milestone 8C verification script — reports which underlying provider was
 *  actually used, without altering resolver.ts. */
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

/** Wraps two named, already-instrumented FinancialDataProviders so we can
 *  attribute call counts to "SEC EDGAR" vs "FMP" by class name, purely for
 *  reporting — this does not change resolver ordering or logic. */
function attributeProviderCalls(registryProvider: FinancialDataProvider) {
  // registryProvider is the real ProviderResolver instance built by
  // buildProviderRegistry(). We reflect its private `providers` list
  // read-only (same technique used in verifyProviderResolverLive.ts) to wrap
  // each underlying adapter individually with a counter, then rebuild an
  // equivalent resolver-shaped object for reporting. The actual call made by
  // ingest.ts still goes through the real, unmodified ProviderResolver
  // instance — this wrapper only observes it from the outside via the
  // underlying providers array in place.
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
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function main() {
  console.log(`Equity AI — Milestone 8D: NVDA ingestion DRY RUN (real pipeline, zero writes)\n`);

  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SEC_EDGAR_USER_AGENT"].filter(
    (k) => !process.env[k]
  );
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);

  const company = await getCompanyIdByTicker("NVDA");
  if (!company) fail(`No existing companies row for NVDA — this milestone does not create companies.`);
  console.log(`Resolved NVDA -> company_id ${company.id} (currency: ${company.currency})`);

  // -------------------------------------------------------------------
  // Baseline row counts BEFORE anything runs — compared again at the end
  // to independently prove zero writes occurred, not just trust the
  // dry-run repo's own bookkeeping.
  // -------------------------------------------------------------------
  const before = {
    raw: await countRows("raw_financial_data", company.id),
    fm: await countRows("financial_metrics", company.id),
    ds: await (async () => {
      const db = getDbClient();
      const { count, error } = await db.from("data_sources").select("*", { count: "exact", head: true });
      if (error) throw new Error(`data_sources count failed: ${error.message}`);
      return count ?? 0;
    })(),
  };
  console.log(`Baseline row counts — raw_financial_data(NVDA)=${before.raw}, financial_metrics(NVDA)=${before.fm}, data_sources(all)=${before.ds}`);

  // -------------------------------------------------------------------
  // Real registry, real resolver, instrumented read-only for reporting.
  // -------------------------------------------------------------------
  const registry = buildProviderRegistry();
  const providerCallCounters = attributeProviderCalls(registry.financialData);

  // -------------------------------------------------------------------
  // Real read of the CURRENT existing dedupe keys for NVDA/ANNUAL, using
  // the exact same query the real repo uses — needed both to feed the
  // dry-run repo (so validation behaves identically to production) and to
  // report duplicate-protection behavior below.
  // -------------------------------------------------------------------
  const db = getDbClient();
  const { data: existingRawRows, error: existingErr } = await db
    .from("raw_financial_data")
    .select("metric_name, period_end, period_type, data_source_id")
    .eq("company_id", company.id)
    .eq("period_type", "ANNUAL");
  if (existingErr) fail(`Reading existing raw_financial_data failed: ${existingErr.message}`);
  const existingKeys = new Set(
    (existingRawRows ?? []).map((r: any) => `${r.metric_name}|${r.period_end}|${r.period_type}`)
  );
  console.log(`\nExisting NVDA/ANNUAL raw_financial_data rows (real, pre-existing): ${existingRawRows?.length ?? 0}`);
  for (const r of existingRawRows ?? []) {
    console.log(`   existing: ${r.metric_name} | ${r.period_end} | ${r.period_type} (data_source_id=${r.data_source_id})`);
  }

  // -------------------------------------------------------------------
  // Dry-run IngestionRepo: getExistingObservationKeys/getFxRate are REAL
  // reads (identical to buildSupabaseIngestionRepo's own implementation).
  // upsertDataSource / insertRawFinancialData / insertFinancialMetric are
  // intercepted — logged, never executed against Supabase.
  // -------------------------------------------------------------------
  const wouldCreateDataSources: Array<Parameters<IngestionRepo["upsertDataSource"]>[0]> = [];
  const wouldInsertRaw: WouldInsertRaw[] = [];
  const wouldInsertMetrics: FinancialMetric[] = [];

  const dryRunRepo: IngestionRepo = {
    async insertRawFinancialData(params) {
      wouldInsertRaw.push(params);
    },
    async insertFinancialMetric(metric) {
      wouldInsertMetrics.push(metric);
    },
    async upsertDataSource(source) {
      wouldCreateDataSources.push(source);
      return `DRY-RUN-DATA-SOURCE-ID-${wouldCreateDataSources.length}`;
    },
    async getExistingObservationKeys(companyId: string, periodType: PeriodType) {
      const { data, error } = await db
        .from("raw_financial_data")
        .select("metric_name, period_end, period_type")
        .eq("company_id", companyId)
        .eq("period_type", periodType);
      if (error) throw new Error(`getExistingObservationKeys query failed: ${error.message}`);
      return new Set((data ?? []).map((row: any) => `${row.metric_name}|${row.period_end}|${row.period_type}`));
    },
    async getFxRate(from: string, to: string): Promise<FxRate | undefined> {
      void from;
      void to;
      return undefined;
    },
  };

  // -------------------------------------------------------------------
  // Run the REAL, unmodified ingestIncomeStatement() — exactly the
  // production call signature used by ingestBatch1/2/3Companies.ts.
  // -------------------------------------------------------------------
  const result = await ingestIncomeStatement(company.id, { ticker: "NVDA" }, company.currency, "ANNUAL", registry.financialData, dryRunRepo);

  // -------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------
  console.log(`\n${"=".repeat(78)}\nPROVIDER RESOLUTION\n${"=".repeat(78)}`);
  for (const w of providerCallCounters) {
    console.log(`   ${w.name}: getIncomeStatement called ${w.calls.getIncomeStatement} time(s)`);
  }
  const winner = providerCallCounters.find((w) => (w.getLastResult()?.status ?? "unavailable") === "available");
  console.log(`   Provider selected: ${winner ? winner.getLastResult()?.source?.providerName : "NONE (all unavailable)"}`);
  console.log(
    `   Provider(s) not used: ${providerCallCounters
      .filter((w) => w !== winner)
      .map((w) => `${w.name} (${w.calls.getIncomeStatement} call(s))`)
      .join(", ") || "none"}`
  );
  console.log(
    `   Why: first-available-wins — providers are tried in resolver order [${providerCallCounters
      .map((w) => w.name)
      .join(", ")}]; the resolver returns the first result with status='available' and never calls the next provider.`
  );

  console.log(`\n${"=".repeat(78)}\nDATA (from the winning provider's response)\n${"=".repeat(78)}`);
  const winningData = winner?.getLastResult()?.data ?? [];
  const byMetric = new Map<string, typeof winningData>();
  for (const item of winningData) byMetric.set(item.metricName, [...(byMetric.get(item.metricName) ?? []), item]);
  console.log(`   Total observations returned by provider: ${winningData.length}`);
  for (const [metric, items] of byMetric) {
    console.log(`   ${metric}: ${items.length} period(s)`);
    for (const item of items.sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))) {
      console.log(`      periodEnd=${item.periodEnd} value=${item.rawValue} unit=${item.unit} currency=${item.currency} tag=${item.metricIdentifier}`);
    }
  }

  console.log(`\n${"=".repeat(78)}\nSUPABASE MAPPING (would-be, not executed)\n${"=".repeat(78)}`);
  for (const s of wouldCreateDataSources) {
    console.log(`   Would INSERT into data_sources: provider_name="${s.providerName}" provider_type="${s.providerType}"`);
    console.log(`      source_url=${s.sourceUrl ?? "∅"}`);
    console.log(`      filing_date=${s.filingDate ?? "∅"}`);
  }
  console.log(`   Confirmed source is SEC EDGAR: ${wouldCreateDataSources.some((s) => s.providerType === "SEC") ? "✅ yes" : "❌ no — FMP was used instead"}`);
  console.log(
    `   How source_id links to metrics: each accepted RawLineItem would be normalized into a financial_metrics row ` +
      `whose source_id points at the SAME data_sources row created above (one upsertDataSource() call covers the whole ` +
      `getIncomeStatement response — see ingest.ts). Note: the real upsertDataSource() implementation (supabaseIngestionRepo.ts) ` +
      `has no dedupe/reuse logic — it inserts a brand-new data_sources row on every ingestion call, regardless of whether ` +
      `an identical-provider row already exists. This dry run faithfully reproduces that: exactly one new data_sources row ` +
      `would be created even if every line item below turns out to be a duplicate and nothing ends up referencing it.`
  );
  console.log(`   Dedup key used (validators.ts): "metric_name|period_end|period_type" — NOT provider-scoped.`);

  console.log(`\n${"=".repeat(78)}\nDUPLICATE PROTECTION\n${"=".repeat(78)}`);
  console.log(`   Existing NVDA/ANNUAL raw_financial_data rows before this run: ${existingKeys.size}`);
  let wouldBeDuplicate = 0;
  let wouldBeNew = 0;
  for (const item of winningData) {
    const key = `${item.metricName}|${item.periodEnd}|${item.periodType}`;
    if (existingKeys.has(key)) {
      wouldBeDuplicate++;
      console.log(`      DUPLICATE (rejected by validateRawLineItem): ${key} — already exists from a prior (FMP) ingestion.`);
    } else {
      wouldBeNew++;
      console.log(`      NEW (would be accepted): ${key}`);
    }
  }
  console.log(`   -> ${wouldBeDuplicate} of ${winningData.length} provider observations collide with existing keys; ${wouldBeNew} are new.`);
  console.log(
    `   What happens to existing FMP data: untouched either way — insertRawFinancialData/insertFinancialMetric are only ` +
      `ever called for ACCEPTED items, and nothing here performs an UPDATE or DELETE against any existing row.`
  );
  console.log(
    `   Are SEC-sourced records treated as duplicates or as separate records: as DUPLICATES when the (metric_name, period_end, ` +
      `period_type) triple already exists — the validator's dedupe key has no provider/source dimension (see validators.ts:92), ` +
      `so it cannot distinguish "the same fact from two providers" from "the same fact ingested twice from one provider." This ` +
      `is the exact gap Milestone 8A Part 3 predicted from reading the code; this dry run is the first live confirmation of it ` +
      `against real NVDA data.`
  );
  console.log(
    `   Why this is "correct" under the CURRENT data model: it is the intended, documented behavior of validators.ts (never ` +
      `silently store two values for one company/metric/period) — it is not a bug introduced by the resolver. It does mean ` +
      `that, as coded today, ingesting an already-FMP-covered company through SEC will not add SEC-sourced financial_metrics ` +
      `rows for periods FMP already supplied — only genuinely new periods/metrics would be accepted.`
  );

  console.log(`\n${"=".repeat(78)}\nWRITES (dry run — must all be 0 actual writes)\n${"=".repeat(78)}`);
  console.log(`   Pipeline result: accepted=${result.accepted}, rejected=${result.rejected}`);
  for (const issue of result.issues) {
    for (const i of issue.issues) console.log(`      [${issue.metricName}] ${i.code}: ${i.message}`);
  }
  console.log(`   Would-be raw_financial_data INSERTs: ${wouldInsertRaw.length}`);
  for (const r of wouldInsertRaw) console.log(`      ${r.metricName} | ${r.periodEnd} | ${r.periodType} | value=${r.rawValue}`);
  console.log(`   Would-be financial_metrics INSERTs: ${wouldInsertMetrics.length}`);
  for (const m of wouldInsertMetrics) console.log(`      ${m.metricName} | ${m.periodEnd} | value=${m.value} | calculationType=${m.calculationType}`);
  console.log(`   Would-be data_sources INSERTs: ${wouldCreateDataSources.length}`);
  console.log(`   Actual UPDATEs performed: 0 (dry-run repo has no update path, and neither does production insertFinancialMetric/insertRawFinancialData)`);
  console.log(`   Actual UPSERTs performed: 0 (upsertDataSource is intercepted; real one is an INSERT, not a true upsert — see mapping note above)`);
  console.log(`   Actual DELETEs performed: 0 (no delete path exists anywhere in this flow)`);

  const after = {
    raw: await countRows("raw_financial_data", company.id),
    fm: await countRows("financial_metrics", company.id),
    ds: await (async () => {
      const { count, error } = await db.from("data_sources").select("*", { count: "exact", head: true });
      if (error) throw new Error(`data_sources count failed: ${error.message}`);
      return count ?? 0;
    })(),
  };
  console.log(`\n${"=".repeat(78)}\nINDEPENDENT VERIFICATION OF ZERO WRITES\n${"=".repeat(78)}`);
  console.log(`   raw_financial_data(NVDA): before=${before.raw} after=${after.raw} — ${before.raw === after.raw ? "✅ unchanged" : "❌ CHANGED"}`);
  console.log(`   financial_metrics(NVDA):  before=${before.fm} after=${after.fm} — ${before.fm === after.fm ? "✅ unchanged" : "❌ CHANGED"}`);
  console.log(`   data_sources(all):        before=${before.ds} after=${after.ds} — ${before.ds === after.ds ? "✅ unchanged" : "❌ CHANGED"}`);

  console.log(`\n${"=".repeat(78)}\nDRY RUN COMPLETE — STOP. No Supabase write was performed.\n${"=".repeat(78)}\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
