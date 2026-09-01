// ============================================================================
// Equity AI — Milestone 8D Stage 1: NVDA ingestion DRY RUN (re-run after the
// provider-scoped raw-layer dedup fix)
//
// Runs the REAL production ingestion pipeline (ingest.ts, unmodified since
// Stage 1) for NVDA, with the REAL buildProviderRegistry() (SEC EDGAR -> FMP
// resolver, exactly as verified live in Milestone 8C), against a DRY-RUN
// IngestionRepo that performs every READ for real (existing dedupe keys,
// existing canonical rows, row counts) but intercepts every WRITE and logs
// it instead of executing it. Zero Supabase mutations occur — verified
// independently below by counting NVDA's rows before and after.
//
// Only NVDA. Does not touch any other company. Does not modify ingest.ts,
// registry.ts, resolver.ts, validators.ts, normalizers.ts, or
// supabaseIngestionRepo.ts (this script mirrors their real, already-changed
// logic for reporting purposes; it does not re-implement different logic).
//
// Run with:
//   npm run milestone8d:dry-run
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestIncomeStatement, CanonicalAlreadyExistsError, type IngestionRepo } from "../ingestion/ingest";
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

/** Reflects (read + replace-in-place) the real ProviderResolver's private
 *  `providers` array so each underlying adapter can be call-counted for
 *  reporting. Every wrapped provider still delegates 100% to the real
 *  instance — this changes no behavior, only adds observability. Same
 *  technique used in verifyProviderResolverLive.ts (Milestone 8C). */
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
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function main() {
  console.log(`Equity AI — Milestone 8D Stage 1: NVDA ingestion DRY RUN (real pipeline, zero writes)\n`);

  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SEC_EDGAR_USER_AGENT"].filter(
    (k) => !process.env[k]
  );
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);

  const company = await getCompanyIdByTicker("NVDA");
  if (!company) fail(`No existing companies row for NVDA — this milestone does not create companies.`);
  console.log(`Resolved NVDA -> company_id ${company.id} (currency: ${company.currency})`);

  const db = getDbClient();

  // -------------------------------------------------------------------
  // Baseline row counts BEFORE anything runs.
  // -------------------------------------------------------------------
  const before = {
    raw: await countRows("raw_financial_data", company.id),
    fm: await countRows("financial_metrics", company.id),
    ds: await (async () => {
      const { count, error } = await db.from("data_sources").select("*", { count: "exact", head: true });
      if (error) throw new Error(`data_sources count failed: ${error.message}`);
      return count ?? 0;
    })(),
  };
  console.log(`Baseline row counts — raw_financial_data(NVDA)=${before.raw}, financial_metrics(NVDA)=${before.fm}, data_sources(all)=${before.ds}`);

  const { data: existingRawRows, error: existingErr } = await db
    .from("raw_financial_data")
    .select("metric_name, period_end, period_type, data_source_id, data_sources(provider_name)")
    .eq("company_id", company.id)
    .eq("period_type", "ANNUAL");
  if (existingErr) fail(`Reading existing raw_financial_data failed: ${existingErr.message}`);
  console.log(`\nExisting NVDA/ANNUAL raw_financial_data rows (real, pre-existing): ${existingRawRows?.length ?? 0}`);
  for (const r of (existingRawRows ?? []) as any[]) {
    console.log(`   existing: ${r.metric_name} | ${r.period_end} | ${r.period_type} | provider=${r.data_sources?.provider_name ?? "?"}`);
  }

  const { data: existingCanonicalRows, error: existingCanonicalErr } = await db
    .from("financial_metrics")
    .select("metric_name, period_end, period_type, currency, source_id")
    .eq("company_id", company.id)
    .eq("period_type", "ANNUAL");
  if (existingCanonicalErr) fail(`Reading existing financial_metrics failed: ${existingCanonicalErr.message}`);
  const existingCanonicalKeys = new Set(
    (existingCanonicalRows ?? []).map((r: any) => `${r.metric_name}|${r.period_end}|${r.period_type}|${r.currency}`)
  );
  console.log(`Existing NVDA/ANNUAL financial_metrics (canonical) rows: ${existingCanonicalRows?.length ?? 0}`);

  // -------------------------------------------------------------------
  // Real registry, real resolver, instrumented read-only for reporting.
  // -------------------------------------------------------------------
  const registry = buildProviderRegistry();
  const providerCallCounters = attributeProviderCalls(registry.financialData);

  // -------------------------------------------------------------------
  // Dry-run IngestionRepo. getExistingObservationKeys mirrors the REAL
  // Stage 1 supabaseIngestionRepo.ts query (provider-scoped, real read).
  // insertFinancialMetric mirrors the REAL Stage 1 conflict check (real
  // read against financial_metrics; throws CanonicalAlreadyExistsError on
  // collision, exactly like the real unique-constraint violation would).
  // upsertDataSource / insertRawFinancialData / insertFinancialMetric never
  // write to Supabase — every write is intercepted and logged instead.
  // -------------------------------------------------------------------
  const wouldCreateDataSources: Array<Parameters<IngestionRepo["upsertDataSource"]>[0]> = [];
  const wouldInsertRaw: WouldInsertRaw[] = [];
  const wouldInsertMetrics: FinancialMetric[] = [];
  const wouldSkipCanonical: FinancialMetric[] = [];

  const dryRunRepo: IngestionRepo = {
    async insertRawFinancialData(params) {
      wouldInsertRaw.push(params);
    },
    async insertFinancialMetric(metric) {
      const key = `${metric.metricName}|${metric.periodEnd}|${metric.periodType}|${metric.currency}`;
      if (existingCanonicalKeys.has(key)) {
        throw new CanonicalAlreadyExistsError(
          `financial_metrics: a row for ${key} already exists (unique constraint uq_financial_metrics) [DRY RUN — not a real DB error]`
        );
      }
      wouldInsertMetrics.push(metric);
    },
    async upsertDataSource(source) {
      wouldCreateDataSources.push(source);
      return `DRY-RUN-DATA-SOURCE-ID-${wouldCreateDataSources.length}`;
    },
    async getExistingObservationKeys(companyId: string, periodType: PeriodType, providerName: string) {
      // Mirrors supabaseIngestionRepo.ts's Stage 1 query exactly (real read,
      // provider-scoped via the raw_financial_data -> data_sources join).
      const { data, error } = await db
        .from("raw_financial_data")
        .select("metric_name, period_end, period_type, data_sources!inner(provider_name)")
        .eq("company_id", companyId)
        .eq("period_type", periodType)
        .eq("data_sources.provider_name", providerName);
      if (error) throw new Error(`getExistingObservationKeys query failed: ${error.message}`);
      return new Set((data ?? []).map((row: any) => `${row.metric_name}|${row.period_end}|${row.period_type}`));
    },
    async getFxRate(from: string, to: string): Promise<FxRate | undefined> {
      void from;
      void to;
      return undefined;
    },
  };

  // Patch: capture canonical-skip attempts for reporting (insertFinancialMetric
  // above throws; ingest.ts catches it, but this script also wants the
  // attempted metric logged for the report below).
  const originalInsertFinancialMetric = dryRunRepo.insertFinancialMetric.bind(dryRunRepo);
  dryRunRepo.insertFinancialMetric = async (metric: FinancialMetric) => {
    try {
      await originalInsertFinancialMetric(metric);
    } catch (e) {
      if (e instanceof CanonicalAlreadyExistsError) wouldSkipCanonical.push(metric);
      throw e;
    }
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
  console.log(`   Stage 1 raw dedupe key (validators.ts, unchanged): "metric_name|period_end|period_type"`);
  console.log(`   Stage 1 scoping (NEW): getExistingObservationKeys is now scoped to provider_name="SEC EDGAR" — FMP's existing raw rows do not appear in this set, so they no longer collide.`);

  console.log(`\n${"=".repeat(78)}\nRAW-LAYER DEDUPLICATION (Stage 1 — now provider-scoped)\n${"=".repeat(78)}`);
  let rawWouldBeDuplicate = 0;
  let rawWouldBeNew = 0;
  const secExistingKeys = new Set(
    (existingRawRows ?? [])
      .filter((r: any) => r.data_sources?.provider_name === "SEC EDGAR")
      .map((r: any) => `${r.metric_name}|${r.period_end}|${r.period_type}`)
  );
  for (const item of winningData) {
    const key = `${item.metricName}|${item.periodEnd}|${item.periodType}`;
    if (secExistingKeys.has(key)) {
      rawWouldBeDuplicate++;
      console.log(`      DUPLICATE (same provider, already stored): ${key}`);
    } else {
      rawWouldBeNew++;
      console.log(`      NEW at raw layer (would be accepted, stored as SEC-sourced): ${key}`);
    }
  }
  console.log(`   -> ${rawWouldBeNew} of ${winningData.length} SEC observations are new at the raw layer (no prior SEC-sourced row for this key); ${rawWouldBeDuplicate} are same-provider repeats.`);

  console.log(`\n${"=".repeat(78)}\nCANONICAL-LAYER OUTCOME (Stage 1 — graceful skip, no promotion)\n${"=".repeat(78)}`);
  for (const item of winningData) {
    const canonicalKey = `${item.metricName}|${item.periodEnd}|${item.periodType}|${item.currency}`;
    const alreadyCanonical = existingCanonicalKeys.has(canonicalKey);
    console.log(`      ${item.metricName}|${item.periodEnd}: canonical already exists from another provider = ${alreadyCanonical} -> ${alreadyCanonical ? "would be SKIPPED (CanonicalAlreadyExistsError, graceful)" : "would be INSERTED as new canonical row"}`);
  }
  console.log(
    `   What happens to existing FMP canonical data: untouched — insertFinancialMetric is never called with an UPDATE, only ` +
      `INSERT-or-throw; the existing FMP-sourced financial_metrics rows are not read for writing, only checked for collision.`
  );
  console.log(
    `   No retroactive promotion: even though SEC is the higher-priority provider, Stage 1 does NOT replace FMP's already-` +
      `canonical values with SEC's — that is explicitly deferred to Stage 2 (not implemented).`
  );

  console.log(`\n${"=".repeat(78)}\nWRITES (dry run — must all be 0 actual writes)\n${"=".repeat(78)}`);
  console.log(`   Pipeline result: accepted=${result.accepted}, rejected=${result.rejected}, canonicalSkipped=${result.canonicalSkipped}`);
  for (const issue of result.issues) {
    for (const i of issue.issues) console.log(`      [${issue.metricName}] ${i.code}: ${i.message}`);
  }
  console.log(`   Would-be raw_financial_data INSERTs: ${wouldInsertRaw.length}`);
  for (const r of wouldInsertRaw) console.log(`      ${r.metricName} | ${r.periodEnd} | ${r.periodType} | value=${r.rawValue}`);
  console.log(`   Would-be financial_metrics INSERTs (new canonical rows): ${wouldInsertMetrics.length}`);
  for (const m of wouldInsertMetrics) console.log(`      ${m.metricName} | ${m.periodEnd} | value=${m.value} | calculationType=${m.calculationType}`);
  console.log(`   Canonical inserts gracefully skipped (CanonicalAlreadyExistsError, no crash): ${wouldSkipCanonical.length}`);
  for (const m of wouldSkipCanonical) console.log(`      ${m.metricName} | ${m.periodEnd} | value=${m.value} (existing FMP canonical value left untouched)`);
  console.log(`   Would-be data_sources INSERTs: ${wouldCreateDataSources.length}`);
  console.log(`   Actual INSERTs performed: 0 | Actual UPDATEs performed: 0 | Actual UPSERTs performed: 0 | Actual DELETEs performed: 0`);

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
