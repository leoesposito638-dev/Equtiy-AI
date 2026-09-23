// ============================================================================
// Equity AI — Milestone 6B, Batch 1: AAPL, ASML, GOOGL, META, MSFT
//
// Runs the EXACT same, already-verified pipeline used for NVDA
// (Milestones 1-4A) for five more real, already-seeded companies:
//   FMP -> ingestIncomeStatement (raw_financial_data + financial_metrics)
//   -> calculateAndStoreGrowthMetrics (current-period calculated_metrics)
//   -> backfillGrowthMetrics (historical calculated_metrics, real data only)
//
// No pipeline code is modified by this script — it only calls existing,
// exported functions in a loop and reports what actually happened, per
// company. Does not create companies (getCompanyIdByTicker only looks up
// existing rows). Does not touch metric_benchmarks or generate any score.
//
// Run with:
//   npm run ingest:batch1
// ============================================================================

import { buildProviderRegistry } from "../providers/registry";
import { ingestIncomeStatement } from "../ingestion/ingest";
import { buildSupabaseIngestionRepo, getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
import { calculateAndStoreGrowthMetrics, backfillGrowthMetrics } from "../calculations/supabaseGrowthMetricsRepo";
import { getDbClient } from "../db/client";

const BATCH_1_TICKERS = ["AAPL", "ASML", "GOOGL", "META", "MSFT"];
const GROWTH_METRICS = ["revenue_growth_yoy", "revenue_cagr_3y", "eps_growth_yoy", "eps_cagr", "growth_acceleration"];

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

async function countRows(table: string, companyId: string): Promise<number> {
  const db = getDbClient();
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("company_id", companyId);
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function main() {
  console.log(`Equity AI — Milestone 6B Batch 1: ${BATCH_1_TICKERS.join(", ")}\n`);

  const missingEnv = ["FMP_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);

  const registry = buildProviderRegistry();
  const repo = buildSupabaseIngestionRepo();

  for (const ticker of BATCH_1_TICKERS) {
    console.log(`\n${"=".repeat(70)}\n${ticker}\n${"=".repeat(70)}`);

    const company = await getCompanyIdByTicker(ticker);
    if (!company) {
      console.log(`   ❌ No existing companies row for ${ticker} — SKIPPED (must already exist, not creating one).`);
      continue;
    }
    console.log(`1. Resolved ${ticker} -> company_id ${company.id} (currency: ${company.currency})`);

    const ingestResult = await ingestIncomeStatement(company.id, { ticker }, company.currency, "ANNUAL", registry.financialData, repo);
    console.log(`2. ingestIncomeStatement: accepted=${ingestResult.accepted}, rejected=${ingestResult.rejected}`);
    if (ingestResult.issues.length > 0) {
      for (const issue of ingestResult.issues) {
        for (const i of issue.issues) console.log(`      - [${issue.metricName}] ${i.code}: ${i.message}`);
      }
    }

    const growthResult = await calculateAndStoreGrowthMetrics(company.id);
    console.log(`3. calculateAndStoreGrowthMetrics (current period):`);
    for (const o of growthResult) {
      if (o.result.value !== null) {
        console.log(`      ✅ ${o.metricName.padEnd(22)} = ${o.result.value.toFixed(4)}  ${o.stored ? `stored id=${o.stored.id}` : `NOT STORED: ${o.storeError}`}`);
      } else {
        console.log(`      ⚪ ${o.metricName.padEnd(22)} unavailable — ${o.result.reason}`);
      }
    }

    const backfillResult = await backfillGrowthMetrics(company.id);
    const backfillStored = backfillResult.filter((o) => o.stored);
    console.log(`4. backfillGrowthMetrics: ${backfillStored.length} newly stored, ${backfillResult.length - backfillStored.length} skipped.`);
    for (const o of backfillResult) {
      if (o.stored) console.log(`      ✅ backfilled ${o.candidate.metricName.padEnd(22)} period_end=${o.candidate.periodEnd} value=${o.candidate.value.toFixed(4)}`);
    }

    const rawCount = await countRows("raw_financial_data", company.id);
    const fmCount = await countRows("financial_metrics", company.id);
    const cmCount = await countRows("calculated_metrics", company.id);
    console.log(`5. Final row counts: raw_financial_data=${rawCount}, financial_metrics=${fmCount}, calculated_metrics=${cmCount}`);

    const db = getDbClient();
    const { data: cmRows } = await db
      .from("calculated_metrics")
      .select("metric_name, period_end, value")
      .eq("company_id", company.id)
      .order("metric_name", { ascending: true })
      .order("period_end", { ascending: true });
    const availableMetrics = new Set((cmRows ?? []).map((r: { metric_name: string }) => r.metric_name));
    console.log(
      `6. GROWTH metrics available: ${[...availableMetrics].filter((m) => GROWTH_METRICS.includes(m)).join(", ") || "none"}`
    );
    console.log(
      `   GROWTH metrics unavailable: ${GROWTH_METRICS.filter((m) => !availableMetrics.has(m)).join(", ") || "none"}`
    );

    const { data: sourceRow } = await db
      .from("data_sources")
      .select("source_url")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const keyLeaked = sourceRow?.source_url?.toLowerCase().includes("apikey") ?? false;
    console.log(`7. Most recent data_sources.source_url contains no API key: ${keyLeaked ? "❌ FAILED — KEY PRESENT" : "✅ confirmed clean"}`);
  }

  console.log(`\n${"=".repeat(70)}\nBatch 1 complete. STOPPING — Batch 2 not started.\n${"=".repeat(70)}\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
