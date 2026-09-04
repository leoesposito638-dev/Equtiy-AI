// ============================================================================
// Equity AI — Milestone 8D Stage 1: NVDA REAL INGESTION (writes to Supabase)
//
// This is the REAL write, approved after the Stage 1 dry run
// (milestone8dDryRunNvda.ts). Uses the REAL, unmodified production pipeline:
//   buildProviderRegistry() -> ProviderResolver -> ingestIncomeStatement()
//   -> buildSupabaseIngestionRepo() -> Supabase
//
// ONLY NVDA. No other company is ever referenced. Does not call growth-metric
// calculation, scoring, or benchmark code — this script does exactly one
// thing: ingestIncomeStatement for NVDA, then verifies the result by reading
// the database back.
//
// Run with:
//   npm run milestone8d:real-write
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestIncomeStatement } from "../ingestion/ingest";
import { buildSupabaseIngestionRepo, getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
import { getDbClient } from "../db/client";

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
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
  console.log(`Equity AI — Milestone 8D Stage 1: NVDA REAL INGESTION (writes to Supabase)\n`);
  console.log(`⚠️  This performs REAL, PERMANENT writes to Supabase for NVDA only.\n`);

  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SEC_EDGAR_USER_AGENT"].filter(
    (k) => !process.env[k]
  );
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);

  const company = await getCompanyIdByTicker("NVDA");
  if (!company) fail(`No existing companies row for NVDA — this milestone does not create companies.`);
  console.log(`Resolved NVDA -> company_id ${company.id} (currency: ${company.currency})`);

  const db = getDbClient();

  // -------------------------------------------------------------------
  // A. BEFORE counts + snapshot of existing NVDA raw rows (to precisely
  // diff "new" rows after the write, rather than trusting counts alone).
  // -------------------------------------------------------------------
  const before = {
    dataSourcesAll: await countAll("data_sources"),
    rawNvda: await countRows("raw_financial_data", company.id),
    fmNvda: await countRows("financial_metrics", company.id),
    calcNvda: await countRows("calculated_metrics", company.id),
    rawAll: await countAll("raw_financial_data"),
  };
  const { data: rawBeforeRows, error: rawBeforeErr } = await db
    .from("raw_financial_data")
    .select("id, metric_name, period_end, period_type, raw_value, data_source_id, data_sources(provider_name)")
    .eq("company_id", company.id);
  if (rawBeforeErr) fail(`Reading raw_financial_data snapshot failed: ${rawBeforeErr.message}`);
  const rawBeforeIds = new Set((rawBeforeRows ?? []).map((r: any) => r.id));

  const { data: fmBeforeRows, error: fmBeforeErr } = await db
    .from("financial_metrics")
    .select("id, metric_name, period_end, period_type, value, source_id")
    .eq("company_id", company.id);
  if (fmBeforeErr) fail(`Reading financial_metrics snapshot failed: ${fmBeforeErr.message}`);

  console.log(`\n${"=".repeat(78)}\nA. BEFORE COUNTS\n${"=".repeat(78)}`);
  console.log(`   data_sources (all, global): ${before.dataSourcesAll}`);
  console.log(`   raw_financial_data (NVDA):  ${before.rawNvda}`);
  console.log(`   financial_metrics (NVDA):   ${before.fmNvda}`);
  console.log(`   calculated_metrics (NVDA):  ${before.calcNvda} (not touched by this script — recorded for verification only)`);
  console.log(`   raw_financial_data (all, global): ${before.rawAll}`);

  // -------------------------------------------------------------------
  // B. THE REAL WRITE — real registry, real resolver, real Supabase repo.
  // -------------------------------------------------------------------
  const registry = buildProviderRegistry();
  const repo = buildSupabaseIngestionRepo();
  const result = await ingestIncomeStatement(company.id, { ticker: "NVDA" }, company.currency, "ANNUAL", registry.financialData, repo);

  console.log(`\n${"=".repeat(78)}\nB. ACTUAL WRITE PERFORMED\n${"=".repeat(78)}`);
  console.log(`   ingestIncomeStatement result: accepted=${result.accepted}, rejected=${result.rejected}, canonicalSkipped=${result.canonicalSkipped}`);
  for (const issue of result.issues) {
    for (const i of issue.issues) console.log(`      [${issue.metricName}] ${i.code}: ${i.message}`);
  }

  // -------------------------------------------------------------------
  // C. AFTER counts
  // -------------------------------------------------------------------
  const after = {
    dataSourcesAll: await countAll("data_sources"),
    rawNvda: await countRows("raw_financial_data", company.id),
    fmNvda: await countRows("financial_metrics", company.id),
    calcNvda: await countRows("calculated_metrics", company.id),
  };
  console.log(`\n${"=".repeat(78)}\nC. AFTER COUNTS\n${"=".repeat(78)}`);
  console.log(`   data_sources (all, global): ${before.dataSourcesAll} -> ${after.dataSourcesAll} (delta ${after.dataSourcesAll - before.dataSourcesAll})`);
  console.log(`   raw_financial_data (NVDA):  ${before.rawNvda} -> ${after.rawNvda} (delta ${after.rawNvda - before.rawNvda})`);
  console.log(`   financial_metrics (NVDA):   ${before.fmNvda} -> ${after.fmNvda} (delta ${after.fmNvda - before.fmNvda})`);
  console.log(`   calculated_metrics (NVDA):  ${before.calcNvda} -> ${after.calcNvda} (delta ${after.calcNvda - before.calcNvda}) — must be 0, this script never calls growth-metric calculation`);

  // -------------------------------------------------------------------
  // D. New SEC raw observations — exact diff against the before-snapshot.
  // -------------------------------------------------------------------
  const { data: rawAfterRows, error: rawAfterErr } = await db
    .from("raw_financial_data")
    .select("id, metric_name, period_end, period_type, raw_value, currency, data_source_id, data_sources(provider_name, provider_type, source_url, filing_date)")
    .eq("company_id", company.id);
  if (rawAfterErr) fail(`Reading raw_financial_data after-write failed: ${rawAfterErr.message}`);
  const newRawRows = (rawAfterRows ?? []).filter((r: any) => !rawBeforeIds.has(r.id));

  console.log(`\n${"=".repeat(78)}\nD. NEW RAW OBSERVATIONS (SEC-sourced, real rows just written)\n${"=".repeat(78)}`);
  console.log(`   Count: ${newRawRows.length} (expected 12)`);
  const byMetric = new Map<string, any[]>();
  for (const r of newRawRows as any[]) byMetric.set(r.metric_name, [...(byMetric.get(r.metric_name) ?? []), r]);
  for (const [metric, rows] of byMetric) {
    console.log(`   ${metric}: ${rows.length} period(s)`);
    for (const r of rows.sort((a, b) => (a.period_end < b.period_end ? 1 : -1))) {
      console.log(`      period_end=${r.period_end} value=${r.raw_value} currency=${r.currency} provider=${r.data_sources?.provider_name}`);
    }
  }
  const allNewRowsAreSec = newRawRows.every((r: any) => r.data_sources?.provider_name === "SEC EDGAR");
  console.log(`   All new rows are SEC EDGAR-sourced: ${allNewRowsAreSec ? "✅ yes" : "❌ NO — unexpected provider present"}`);

  // -------------------------------------------------------------------
  // E. Existing FMP raw observations preserved (byte-for-byte, from snapshot).
  // -------------------------------------------------------------------
  const fmpBeforeRows = (rawBeforeRows ?? []).filter((r: any) => r.data_sources?.provider_name === "Financial Modeling Prep");
  const rawAfterById = new Map((rawAfterRows ?? []).map((r: any) => [r.id, r]));
  let fmpRawUnchanged = true;
  for (const before of fmpBeforeRows as any[]) {
    const nowRow = rawAfterById.get(before.id);
    if (!nowRow || nowRow.raw_value !== before.raw_value || nowRow.metric_name !== before.metric_name || nowRow.period_end !== before.period_end) {
      fmpRawUnchanged = false;
    }
  }
  console.log(`\n${"=".repeat(78)}\nE. EXISTING FMP RAW OBSERVATIONS PRESERVED\n${"=".repeat(78)}`);
  console.log(`   Pre-existing FMP raw_financial_data rows: ${fmpBeforeRows.length}`);
  console.log(`   All still present and unchanged: ${fmpRawUnchanged ? "✅ yes" : "❌ NO — a pre-existing FMP row was altered or removed"}`);

  // -------------------------------------------------------------------
  // F. Existing canonical (financial_metrics) values preserved.
  // -------------------------------------------------------------------
  const { data: fmAfterRows, error: fmAfterErr } = await db
    .from("financial_metrics")
    .select("id, metric_name, period_end, period_type, value, source_id")
    .eq("company_id", company.id);
  if (fmAfterErr) fail(`Reading financial_metrics after-write failed: ${fmAfterErr.message}`);
  const fmAfterById = new Map((fmAfterRows ?? []).map((r: any) => [r.id, r]));
  let canonicalUnchanged = true;
  for (const before of (fmBeforeRows ?? []) as any[]) {
    const nowRow = fmAfterById.get(before.id);
    if (!nowRow || nowRow.value !== before.value || nowRow.source_id !== before.source_id) {
      canonicalUnchanged = false;
    }
  }
  console.log(`\n${"=".repeat(78)}\nF. EXISTING CANONICAL VALUES PRESERVED (no overwrite, no promotion)\n${"=".repeat(78)}`);
  console.log(`   Pre-existing financial_metrics rows: ${fmBeforeRows?.length ?? 0}`);
  console.log(`   All still present, same value, same source_id: ${canonicalUnchanged ? "✅ yes" : "❌ NO — a canonical value or its source_id changed"}`);
  console.log(`   New canonical rows created by this write: ${after.fmNvda - before.fmNvda} (expected 0 — all 12 gracefully skipped, see canonicalSkipped above)`);

  // -------------------------------------------------------------------
  // G. Source linkage
  // -------------------------------------------------------------------
  const newDataSourceIds = [...new Set(newRawRows.map((r: any) => r.data_source_id))];
  console.log(`\n${"=".repeat(78)}\nG. SOURCE LINKAGE\n${"=".repeat(78)}`);
  console.log(`   New data_sources row(s) referenced by the new raw rows: ${newDataSourceIds.length} (expected 1)`);
  for (const id of newDataSourceIds) {
    const row = newRawRows.find((r: any) => r.data_source_id === id) as any;
    console.log(`      id=${id} provider_name=${row.data_sources?.provider_name} provider_type=${row.data_sources?.provider_type}`);
    console.log(`      source_url=${row.data_sources?.source_url}`);
    console.log(`      filing_date=${row.data_sources?.filing_date}`);
  }
  console.log(`   All 12 new raw rows reference the SAME single data_source_id: ${newDataSourceIds.length === 1 ? "✅ yes" : "❌ NO"}`);

  // -------------------------------------------------------------------
  // H. Duplicate check — (company_id, metric_name, period_end, period_type, data_source_id)
  // -------------------------------------------------------------------
  const seen = new Map<string, number>();
  for (const r of (rawAfterRows ?? []) as any[]) {
    const key = `${company.id}|${r.metric_name}|${r.period_end}|${r.period_type}|${r.data_source_id}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
  console.log(`\n${"=".repeat(78)}\nH. DUPLICATE CHECK\n${"=".repeat(78)}`);
  console.log(`   (company_id, metric_name, period_end, period_type, data_source_id) duplicates found: ${duplicates.length}`);
  for (const [key, count] of duplicates) console.log(`      ❌ ${key} appears ${count} times`);
  if (duplicates.length === 0) console.log(`   ✅ none — matches the unique constraint uq_raw_fin_dedupe`);

  // -------------------------------------------------------------------
  // I. Credential/security check
  // -------------------------------------------------------------------
  console.log(`\n${"=".repeat(78)}\nI. CREDENTIAL/SECURITY CHECK\n${"=".repeat(78)}`);
  for (const id of newDataSourceIds) {
    const row = newRawRows.find((r: any) => r.data_source_id === id) as any;
    const url = row.data_sources?.source_url ?? "";
    const clean = !/apikey|api_key|token=|secret/i.test(url);
    console.log(`   source_url for ${id}: ${clean ? "✅ clean, no credential-looking parameter" : "❌ FAILED — looks like it contains a credential"}`);
  }

  // -------------------------------------------------------------------
  // J. Unrelated companies/tables untouched — aggregate sanity check.
  // Captured BEFORE the write too, so this is a real before/after diff,
  // not just a post-hoc read.
  // -------------------------------------------------------------------
  const rawAllAfter = await countAll("raw_financial_data");
  const rawAllOtherCompaniesDelta = (rawAllAfter - after.rawNvda) - (before.rawAll - before.rawNvda);
  console.log(`\n${"=".repeat(78)}\nJ. UNRELATED COMPANIES/TABLES CHECK\n${"=".repeat(78)}`);
  console.log(`   raw_financial_data total rows (all companies): ${before.rawAll} -> ${rawAllAfter} (delta ${rawAllAfter - before.rawAll})`);
  console.log(`   Of that delta, NVDA accounts for ${after.rawNvda - before.rawNvda}; all other companies combined delta: ${rawAllOtherCompaniesDelta} (expected 0)`);
  console.log(`   No other company_id was ever passed to ingestIncomeStatement in this script — only "NVDA" appears as a ticker literal in this file.`);

  console.log(`\n${"=".repeat(78)}\nREAL WRITE COMPLETE.\n${"=".repeat(78)}\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
