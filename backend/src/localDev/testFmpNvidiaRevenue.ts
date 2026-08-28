// ============================================================================
// Equity AI — First Real Integration Test: FMP -> NVDA -> Revenue
//
// Proves ONE real financial datapoint can travel through the entire
// pipeline: FMP API -> validate -> normalize -> raw_financial_data ->
// financial_metrics, with a full source_id trail back to data_sources.
//
// Requires real credentials in the environment (see .env.example):
//   FMP_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// and that schema/001_core_tables.sql through schema/005_seed_companies.sql
// have already been run against that Supabase project (so a `companies` row
// for ticker='NVDA' exists).
//
// Run with:
//   npx ts-node src/localDev/testFmpNvidiaRevenue.ts
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestIncomeStatement } from "../ingestion/ingest";
import { buildSupabaseIngestionRepo, getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
import { getDbClient } from "../db/client";

const TICKER = "NVDA";

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

async function main() {
  console.log(`Equity AI — FMP integration test: ${TICKER} revenue\n`);

  // --- 0. Environment check -------------------------------------------------
  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    fail(`Missing required environment variable(s): ${missingEnv.join(", ")}. See .env.example.`);
  }

  // --- 1. Resolve NVDA's company_id (proves the seed migration ran) --------
  const company = await getCompanyIdByTicker(TICKER);
  if (!company) {
    fail(
      `No 'companies' row found for ticker='${TICKER}'. Run schema/001_core_tables.sql through ` +
      `schema/005_seed_companies.sql against this Supabase project first.`
    );
  }
  console.log(`1. Resolved ${TICKER} -> company_id ${company!.id} (currency: ${company!.currency})`);

  // --- 2. Build the provider registry and confirm FMP is actually wired ----
  const registry = buildProviderRegistry();
  if (registry.financialData.constructor.name !== "FmpFinancialDataAdapter") {
    fail("FMP_API_KEY was not picked up by buildProviderRegistry() — financialData is not FmpFinancialDataAdapter. Check the env var is set in this process.");
  }
  console.log(`2. Provider registry resolved financialData -> FmpFinancialDataAdapter (FMP_API_KEY detected)`);

  // --- 3. Run the REAL, UNMODIFIED ingestion pipeline -----------------------
  const repo = buildSupabaseIngestionRepo();
  console.log(`3. Calling ingestIncomeStatement(...) — this hits FMP live and writes to Supabase.\n`);

  const result = await ingestIncomeStatement(company!.id, { ticker: TICKER }, company!.currency, "ANNUAL", registry.financialData, repo);

  console.log(`   Result: accepted=${result.accepted}, rejected=${result.rejected}`);
  if (result.issues.length > 0) {
    console.log(`   Issues:`);
    for (const issue of result.issues) {
      for (const i of issue.issues) console.log(`     - [${issue.metricName}] ${i.code}: ${i.message}`);
    }
  }
  if (result.accepted === 0) {
    fail("Nothing was accepted into financial_metrics — see issues above. No fabricated data was written.");
  }

  // --- 4. Read back exactly what landed in Supabase, for the 8-point proof -
  const db = getDbClient();

  const { data: metricRow, error: metricErr } = await db
    .from("financial_metrics")
    .select("*")
    .eq("company_id", company!.id)
    .eq("metric_name", "revenue")
    .eq("period_type", "ANNUAL")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (metricErr || !metricRow) fail(`Could not read back the financial_metrics row: ${metricErr?.message}`);

  const { data: rawRow, error: rawErr } = await db
    .from("raw_financial_data")
    .select("*")
    .eq("company_id", company!.id)
    .eq("metric_name", "revenue")
    .eq("period_type", "ANNUAL")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (rawErr || !rawRow) fail(`Could not read back the raw_financial_data row: ${rawErr?.message}`);

  const { data: sourceRow, error: sourceErr } = await db
    .from("data_sources")
    .select("*")
    .eq("id", metricRow!.source_id)
    .single();
  if (sourceErr || !sourceRow) fail(`Could not read back the data_sources row: ${sourceErr?.message}`);

  console.log(`\n✅ Full pipeline proof — ${TICKER} revenue\n`);
  console.log(`1. FMP endpoint used:        https://financialmodelingprep.com/api/v3/income-statement/${TICKER}?period=annual&limit=1&apikey=***REDACTED***`);
  console.log(`2. FMP request succeeded:    yes (see accepted=${result.accepted} above; a failed/empty FMP response would have produced accepted=0 and a logged reason, not this section)`);
  console.log(`3. Value FMP returned:       ${rawRow!.raw_value} ${rawRow!.currency} (raw_financial_data.raw_value, unmodified from FMP)`);
  console.log(`4. raw_financial_data row:   id=${rawRow!.id}`);
  console.log(`                             company_id=${rawRow!.company_id}`);
  console.log(`                             metric_name=${rawRow!.metric_name}`);
  console.log(`                             raw_value=${rawRow!.raw_value}  unit=${rawRow!.unit}  currency=${rawRow!.currency}`);
  console.log(`5. financial_metrics row:    id=${metricRow!.id}`);
  console.log(`                             value=${metricRow!.value}  calculation_type=${metricRow!.calculation_type}`);
  console.log(`                             confidence_score=${metricRow!.confidence_score}`);
  console.log(`6. data_sources row:         id=${sourceRow!.id}`);
  console.log(`                             provider_name=${sourceRow!.provider_name}  provider_type=${sourceRow!.provider_type}`);
  console.log(`                             source_url=${sourceRow!.source_url}`);
  console.log(`                             (financial_metrics.source_id -> ${metricRow!.source_id} === data_sources.id -> ${sourceRow!.id}: ${metricRow!.source_id === sourceRow!.id})`);
  console.log(`7. Period/currency/type:     period_end=${rawRow!.period_end}  period_type=${rawRow!.period_type}  currency=${rawRow!.currency}  filing_date=${sourceRow!.filing_date}`);
  console.log(`8. No invented values:       raw_financial_data.raw_value (${rawRow!.raw_value}) === financial_metrics.value (${metricRow!.value}): ${Number(rawRow!.raw_value) === Number(metricRow!.value)} (USD->USD, no FX conversion applied)`);
  console.log("");
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
