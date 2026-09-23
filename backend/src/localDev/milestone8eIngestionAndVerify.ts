// ============================================================================
// Equity AI — Milestone 8E, Phases 3-4: TXN / IBM / ASML live ingestion pilot
// + post-write integrity check
//
// Phase 3: real writes via the REAL, unmodified production pipeline
//   buildProviderRegistry() -> ProviderResolver -> ingestIncomeStatement()
//   -> buildSupabaseIngestionRepo() -> Supabase
// for exactly TXN, IBM, ASML — no other company, no provider bypass.
//
// Phase 4: reads the database back per company to verify exactly what
// changed, that nothing unrelated moved, no duplicates, no credentials in
// source_url, and (for ASML, if both providers fail) that zero rows were
// written at all.
//
// Run with:
//   npm run milestone8e:ingest
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestIncomeStatement } from "../ingestion/ingest";
import { buildSupabaseIngestionRepo, getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
import { getDbClient } from "../db/client";

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

const TICKERS = ["TXN", "IBM", "ASML"];

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
  console.log(`Equity AI — Milestone 8E Phases 3-4: TXN / IBM / ASML live ingestion pilot\n`);
  console.log(`⚠️  This performs REAL, PERMANENT writes to Supabase for TXN, IBM, ASML only.\n`);

  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SEC_EDGAR_USER_AGENT"].filter(
    (k) => !process.env[k]
  );
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);

  const db = getDbClient();
  const registry = buildProviderRegistry();
  const repo = buildSupabaseIngestionRepo();

  const dataSourcesAllBefore = await countAll("data_sources");
  const rawAllBefore = await countAll("raw_financial_data");

  const perCompany: Record<string, any> = {};

  for (const ticker of TICKERS) {
    console.log(`\n${"=".repeat(78)}\n${ticker}\n${"=".repeat(78)}`);
    const company = await getCompanyIdByTicker(ticker);
    if (!company) fail(`No existing companies row for ${ticker} — this milestone does not create companies.`);

    const before = {
      raw: await countRows("raw_financial_data", company.id),
      fm: await countRows("financial_metrics", company.id),
      cm: await countRows("calculated_metrics", company.id),
    };
    const { data: rawBeforeRows } = await db
      .from("raw_financial_data")
      .select("id, metric_name, period_end, period_type, raw_value, data_source_id, data_sources(provider_name)")
      .eq("company_id", company.id);
    const rawBeforeIds = new Set((rawBeforeRows ?? []).map((r: any) => r.id));

    console.log(`PHASE 3 — Live ingestion. Before: raw=${before.raw} fm=${before.fm} cm=${before.cm}`);

    const result = await ingestIncomeStatement(company.id, { ticker }, company.currency, "ANNUAL", registry.financialData, repo);
    console.log(`   ingestIncomeStatement result: accepted=${result.accepted}, rejected=${result.rejected}, canonicalSkipped=${result.canonicalSkipped}`);
    for (const issue of result.issues) {
      for (const i of issue.issues) console.log(`      [${issue.metricName}] ${i.code}: ${i.message}`);
    }

    const after = {
      raw: await countRows("raw_financial_data", company.id),
      fm: await countRows("financial_metrics", company.id),
      cm: await countRows("calculated_metrics", company.id),
    };
    console.log(`   After: raw=${after.raw} (Δ${after.raw - before.raw}) fm=${after.fm} (Δ${after.fm - before.fm}) cm=${after.cm} (Δ${after.cm - before.cm})`);

    console.log(`\nPHASE 4 — Post-write integrity check for ${ticker}`);
    const { data: rawAfterRows } = await db
      .from("raw_financial_data")
      .select("id, metric_name, period_end, period_type, raw_value, currency, data_source_id, data_sources(provider_name, provider_type, source_url, filing_date)")
      .eq("company_id", company.id);
    const newRawRows = (rawAfterRows ?? []).filter((r: any) => !rawBeforeIds.has(r.id));
    console.log(`   New raw rows: ${newRawRows.length}`);
    const byMetric = new Map<string, any[]>();
    for (const r of newRawRows as any[]) byMetric.set(r.metric_name, [...(byMetric.get(r.metric_name) ?? []), r]);
    for (const [metric, rows] of byMetric) {
      console.log(`      ${metric}: ${rows.length} period(s), provider=${rows[0]?.data_sources?.provider_name}`);
    }
    const providersInNewRows = new Set(newRawRows.map((r: any) => r.data_sources?.provider_name));
    console.log(`   Providers represented in new rows: ${[...providersInNewRows].join(", ") || "none"}`);
    console.log(`   All new rows from a single provider: ${providersInNewRows.size <= 1 ? "✅ yes" : "❌ NO — mixed providers in one write, unexpected"}`);

    // Duplicate check
    const seen = new Map<string, number>();
    for (const r of (rawAfterRows ?? []) as any[]) {
      const key = `${company.id}|${r.metric_name}|${r.period_end}|${r.period_type}|${r.data_source_id}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
    console.log(`   Duplicate (company_id, metric_name, period_end, period_type, data_source_id) rows: ${duplicates.length} ${duplicates.length === 0 ? "✅" : "❌"}`);

    // Credential check on any new data_sources referenced
    const newDataSourceIds = [...new Set(newRawRows.map((r: any) => r.data_source_id))];
    for (const id of newDataSourceIds) {
      const row = newRawRows.find((r: any) => r.data_source_id === id) as any;
      const url = row.data_sources?.source_url ?? "";
      const clean = !/apikey|api_key|token=|secret/i.test(url);
      console.log(`   data_sources ${id}: provider=${row.data_sources?.provider_name} source_url clean=${clean ? "✅" : "❌"}`);
    }

    // Special check for ASML: if both providers fail, must be truly zero writes.
    if (ticker === "ASML" && result.rejected > 0 && result.accepted === 0 && result.canonicalSkipped === 0 && newRawRows.length === 0) {
      console.log(`   ASML zero-write confirmation: raw Δ=${after.raw - before.raw}, fm Δ=${after.fm - before.fm} — both must be 0: ${after.raw === before.raw && after.fm === before.fm ? "✅ confirmed zero writes" : "❌ UNEXPECTED WRITE OCCURRED"}`);
    }

    perCompany[ticker] = { before, after, result, newRawRowsCount: newRawRows.length };
  }

  const dataSourcesAllAfter = await countAll("data_sources");
  const rawAllAfter = await countAll("raw_financial_data");
  const expectedRawDelta = TICKERS.reduce((sum, t) => sum + (perCompany[t].after.raw - perCompany[t].before.raw), 0);
  console.log(`\n${"=".repeat(78)}\nAGGREGATE / UNRELATED-COMPANY CHECK\n${"=".repeat(78)}`);
  console.log(`   data_sources (all, global): ${dataSourcesAllBefore} -> ${dataSourcesAllAfter} (delta ${dataSourcesAllAfter - dataSourcesAllBefore})`);
  console.log(`   raw_financial_data (all, global): ${rawAllBefore} -> ${rawAllAfter} (delta ${rawAllAfter - rawAllBefore})`);
  console.log(`   Sum of per-company raw deltas (TXN+IBM+ASML): ${expectedRawDelta}`);
  console.log(`   Unaccounted-for delta (should be 0 — no unrelated company touched): ${(rawAllAfter - rawAllBefore) - expectedRawDelta}`);

  console.log(`\n${"=".repeat(78)}\nPILOT COMPLETE.\n${"=".repeat(78)}\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
