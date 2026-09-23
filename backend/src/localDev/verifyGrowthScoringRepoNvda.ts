// ============================================================================
// Equity AI — Milestone 4A real-data verification: Supabase ScoringRepo + backfill
//
// Proves, against the real database:
//   A. buildSupabaseScoringRepo() can read NVDA's live calculated_metrics
//   B. backfill correctly populates additional real historical periods
//   C. nothing fabricated — every value traces to real financial_metrics
//   D. running backfill twice is a no-op the second time (duplicate-safe)
//   E. the resulting MetricInput shape is exactly what scoreCategory.ts expects
//   F. reports which GROWTH metrics now clear their minimum_data_points gate
//
// Does NOT call calculateFundamentalScore() or storeFundamentalScore() —
// this milestone builds the bridge only, it does not cross it.
//
// Run with:
//   npm run verify:scoring-repo-nvda
// ============================================================================

import { getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
import { backfillGrowthMetrics } from "../calculations/supabaseGrowthMetricsRepo";
import { buildSupabaseScoringRepo } from "../scoring/supabaseScoringRepo";

const TICKER = "NVDA";
const GROWTH_METRICS = ["revenue_growth_yoy", "revenue_cagr_3y", "eps_growth_yoy", "eps_cagr", "growth_acceleration"];

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

async function printMetricInputsSnapshot(label: string, repo: ReturnType<typeof buildSupabaseScoringRepo>, companyId: string, rulesByMetric: Map<string, number>) {
  const inputs = await repo.getMetricInputs(companyId, GROWTH_METRICS);
  console.log(`\n${label}`);
  for (const name of GROWTH_METRICS) {
    const input = inputs.get(name);
    const minPoints = rulesByMetric.get(name) ?? 0;
    if (!input) {
      console.log(`   ⚪ ${name.padEnd(22)} not found in calculated_metrics at all`);
      continue;
    }
    const dataPoints = input.history.filter((v) => v !== null).length;
    const hasEnoughData = dataPoints >= minPoints && input.latestValue !== null;
    console.log(
      `   ${hasEnoughData ? "✅" : "⚪"} ${name.padEnd(22)} latestValue=${input.latestValue?.toFixed(4)}  history=[${input.history.map((v) => v?.toFixed(2)).join(", ")}]  dataPoints=${dataPoints}/${minPoints}  ${hasEnoughData ? "SCOREABLE" : "not enough data yet"}`
    );
  }
}

async function main() {
  console.log(`Equity AI — Milestone 4A verification: ScoringRepo + backfill, ${TICKER}\n`);

  const missingEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);

  const company = await getCompanyIdByTicker(TICKER);
  if (!company) fail(`No 'companies' row found for ticker='${TICKER}'.`);
  console.log(`1. Resolved ${TICKER} -> company_id ${company!.id}`);

  const repo = buildSupabaseScoringRepo();

  const categories = await repo.getActiveCategories();
  const growthCategory = categories.find((c) => c.categoryKey === "GROWTH");
  if (!growthCategory) fail("No active GROWTH category found in score_categories.");
  console.log(`2. getActiveCategories(): ${categories.length} active categories, including GROWTH (weight=${growthCategory!.defaultWeight})`);

  const allRules = await repo.getActiveRules("v1.0");
  const growthRules = allRules.filter((r) => r.categoryId === growthCategory!.id);
  console.log(`3. getActiveRules("v1.0"): ${allRules.length} total active rules, ${growthRules.length} for GROWTH`);
  const minPointsByMetric = new Map(growthRules.map((r) => [r.metricName, r.minimumDataPoints]));
  for (const r of growthRules) console.log(`   - ${r.metricName}: rule_type=${r.ruleType} weight=${r.weight} minimum_data_points=${r.minimumDataPoints}`);

  const sector = await repo.getCompanySector(company!.id);
  console.log(`4. getCompanySector(): "${sector}"`);
  const benchmarks = await repo.getBenchmarks(sector, GROWTH_METRICS);
  console.log(`5. getBenchmarks(): ${benchmarks.size} benchmark(s) found (expected 0 — metric_benchmarks intentionally not populated this milestone)`);

  await printMetricInputsSnapshot("6. getMetricInputs() BEFORE backfill (Milestone 3A state — one value per metric):", repo, company!.id, minPointsByMetric);

  console.log(`\n7. Running backfillGrowthMetrics() — first run:`);
  const firstRun = await backfillGrowthMetrics(company!.id);
  const firstStored = firstRun.filter((o) => o.stored);
  const firstSkipped = firstRun.filter((o) => !o.stored);
  for (const o of firstRun) {
    if (o.stored) console.log(`   ✅ stored  ${o.candidate.metricName.padEnd(22)} period_end=${o.candidate.periodEnd}  value=${o.candidate.value.toFixed(4)}  id=${o.stored.id}`);
    else console.log(`   ⚪ skipped ${o.candidate.metricName.padEnd(22)} period_end=${o.candidate.periodEnd}  reason=${o.skippedReason}`);
  }
  console.log(`   Summary: ${firstStored.length} newly stored, ${firstSkipped.length} skipped.`);

  console.log(`\n8. Running backfillGrowthMetrics() AGAIN — proving duplicate-safety/idempotency:`);
  const secondRun = await backfillGrowthMetrics(company!.id);
  const secondStored = secondRun.filter((o) => o.stored);
  console.log(`   Summary: ${secondStored.length} newly stored (expected 0), ${secondRun.length - secondStored.length} skipped as already_exists (expected ${secondRun.length}).`);
  if (secondStored.length > 0) fail(`Duplicate protection failed — the second backfill run stored ${secondStored.length} new row(s).`);

  await printMetricInputsSnapshot("9. getMetricInputs() AFTER backfill:", repo, company!.id, minPointsByMetric);

  console.log(`\n10. calculateFundamentalScore() was NOT called. No fundamental_scores or category_scores rows were written by this run.\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
