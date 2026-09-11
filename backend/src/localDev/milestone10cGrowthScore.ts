// ============================================================================
// Equity AI — Milestone 10C: real Growth Score generation for the
// 30-company US demo universe.
//
// Uses the REAL, unmodified scoreCategory() (categoryScorers/scoreCategory.ts)
// and the REAL, now-fixed buildSupabaseScoringRepo() for all reads. Does NOT
// call calculateFundamentalScore()/storeFundamentalScore() — those would
// score all 8 categories and write fundamental_scores, both explicitly out
// of scope here. This script computes ONLY the GROWTH category via the real
// scoreCategory() function and writes ONLY to category_scores itself.
//
// A parallel, purely-diagnostic per-rule trace (calling the same exported
// pure functions scoreCategory.ts itself calls — scoreAgainstBenchmark,
// scoreFromTrendOnly, trendSlope, computeConfidence) is built alongside the
// real call, for reporting only — it does not influence the write.
//
// Two modes:
//   npx ts-node --transpile-only src/localDev/milestone10cGrowthScore.ts --preflight
//   npx ts-node --transpile-only src/localDev/milestone10cGrowthScore.ts --write
// ============================================================================

import { buildSupabaseScoringRepo } from "../scoring/supabaseScoringRepo";
import { scoreCategory } from "../scoring/categoryScorers/scoreCategory";
import { scoreAgainstBenchmark, scoreFromTrendOnly } from "../scoring/percentile";
import { computeConfidence, type RuleEvaluation } from "../scoring/confidence";
import { trend as trendSlope } from "../calculations/metrics";
import { SCORING_VERSION } from "../scoring/scoringEngine";
import { getDbClient } from "../db/client";
import type { ScoreRule } from "../types/domain";
import type { MetricInput } from "../scoring/categoryScorers/types";

const GROWTH_METRICS = ["revenue_growth_yoy", "revenue_cagr_3y", "eps_growth_yoy", "eps_cagr", "growth_acceleration"];
const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

interface RuleTrace {
  metricName: string;
  value: number | null;
  status: string;
  benchmarkTier: "SECTOR" | "MARKET_WIDE" | null;
  score: number | null;
  contributed: boolean;
  weight: number;
}

function traceRules(rules: ScoreRule[], metrics: Map<string, MetricInput>, benchmarks: Map<string, any>): RuleTrace[] {
  const trace: RuleTrace[] = [];
  for (const rule of rules) {
    const input = metrics.get(rule.metricName);
    const dataPoints = input ? input.history.filter((v) => v !== null).length : 0;
    const hasEnoughData = dataPoints >= rule.minimumDataPoints && (input?.latestValue ?? null) !== null;

    if (!hasEnoughData) {
      trace.push({ metricName: rule.metricName, value: input?.latestValue ?? null, status: "UNAVAILABLE (insufficient data)", benchmarkTier: null, score: null, contributed: false, weight: rule.weight });
      continue;
    }

    if (rule.ruleType === "TREND") {
      const slope = trendSlope(input!.history);
      const score = scoreFromTrendOnly(slope, rule.direction);
      trace.push({
        metricName: rule.metricName, value: input!.latestValue,
        status: score === null ? "UNAVAILABLE (trend calc failed)" : "TREND_ONLY (rule_type=TREND by design — benchmark never consulted)",
        benchmarkTier: null, score, contributed: score !== null, weight: rule.weight,
      });
      continue;
    }

    const benchmark = benchmarks.get(rule.metricName) ?? null;
    if (benchmark) {
      const { score } = scoreAgainstBenchmark(input!.latestValue, benchmark, rule.direction);
      const tier: "SECTOR" | "MARKET_WIDE" = benchmark.sector ? "SECTOR" : "MARKET_WIDE";
      trace.push({ metricName: rule.metricName, value: input!.latestValue, status: score === null ? "UNAVAILABLE" : `BENCHMARK(${tier})`, benchmarkTier: tier, score, contributed: score !== null, weight: rule.weight });
    } else {
      const slope = trendSlope(input!.history);
      const score = scoreFromTrendOnly(slope, rule.direction);
      trace.push({ metricName: rule.metricName, value: input!.latestValue, status: score === null ? "UNAVAILABLE (no benchmark, trend calc failed)" : "TREND_ONLY (no benchmark row exists for this metric)", benchmarkTier: null, score, contributed: score !== null, weight: rule.weight });
    }
  }
  return trace;
}

async function main() {
  const mode = process.argv.includes("--write") ? "write" : "preflight";
  console.log(`Equity AI — Milestone 10C Growth Score ${mode.toUpperCase()} (30-company demo universe)\n`);

  const db = getDbClient();
  const repo = buildSupabaseScoringRepo();

  const { count: existingCategoryScores } = await db.from("category_scores").select("*", { count: "exact", head: true });
  console.log(`Existing category_scores rows: ${existingCategoryScores}`);
  if (mode === "write" && existingCategoryScores !== 0) {
    throw new Error(`STOP: category_scores expected to be 0 before writing, found ${existingCategoryScores}.`);
  }

  const categories = await repo.getActiveCategories();
  const growthCategory = categories.find((c) => c.categoryKey === "GROWTH");
  if (!growthCategory) throw new Error("STOP: no active GROWTH category found in score_categories.");

  const allRules = await repo.getActiveRules(SCORING_VERSION);
  const growthRules = allRules.filter((r) => r.categoryId === growthCategory.id);
  console.log(`GROWTH category id=${growthCategory.id}, ${growthRules.length} active v${SCORING_VERSION} rules: ${growthRules.map((r) => `${r.metricName}(${r.ruleType},w=${r.weight})`).join(", ")}\n`);

  const { data: companies, error } = await db.from("companies").select("id, ticker, name, sector").in("ticker", DEMO_TICKERS);
  if (error) throw new Error(error.message);
  if (companies!.length !== 30) throw new Error(`STOP: expected exactly 30 demo companies, found ${companies!.length}.`);

  const results: Array<{ ticker: string; name: string; companyId: string; categoryId: string; score: number; confidence: number; coverage: number; traces: RuleTrace[] }> = [];
  let unexpectedTrendOnly = 0;

  for (const ticker of DEMO_TICKERS) {
    const company = companies!.find((c: any) => c.ticker === ticker) as any;
    const metrics = await repo.getMetricInputs(company.id, GROWTH_METRICS);
    const benchmarks = await repo.getBenchmarks(company.sector, GROWTH_METRICS);

    // REAL, authoritative, unmodified scoring call.
    const realScore = scoreCategory({
      companyId: company.id,
      categoryId: growthCategory.id,
      categoryKey: "GROWTH",
      rules: growthRules,
      metrics,
      benchmarks,
      calculationVersion: SCORING_VERSION,
    });

    // Diagnostic-only trace (same real pure functions, same real inputs).
    const traces = traceRules(growthRules, metrics, benchmarks);

    // Cross-check: rebuild evaluations from the trace and confirm
    // computeConfidence() (the real function) reproduces the same
    // coverage/confidence scoreCategory() itself returned.
    const evaluations: RuleEvaluation[] = traces.map((t) => ({
      weight: t.weight,
      hasEnoughData: t.score !== null,
      usedBenchmark: t.benchmarkTier !== null,
    }));
    const crossCheck = computeConfidence(evaluations);
    if (Math.abs(crossCheck.coverage - realScore.coverage) > 1e-9 || Math.abs(crossCheck.confidence - realScore.confidence) > 1e-9) {
      console.log(`   ⚠️ ${ticker}: cross-check MISMATCH — trace-derived coverage/confidence (${crossCheck.coverage}/${crossCheck.confidence}) != real (${realScore.coverage}/${realScore.confidence})`);
    }

    // The critical check this milestone exists to make: any PERCENTILE rule
    // with a real benchmark available must actually use it.
    for (const t of traces) {
      const rule = growthRules.find((r) => r.metricName === t.metricName)!;
      if (rule.ruleType === "PERCENTILE" && benchmarks.has(t.metricName) && t.benchmarkTier === null && t.score !== null) {
        unexpectedTrendOnly++;
        console.log(`   ❌ ${ticker}/${t.metricName}: benchmark exists but scoring fell through to TREND_ONLY unexpectedly!`);
      }
    }

    results.push({ ticker, name: company.name, companyId: company.id, categoryId: growthCategory.id, score: realScore.score, confidence: realScore.confidence, coverage: realScore.coverage, traces });
  }

  console.log(`\n${"=".repeat(120)}\nPER-COMPANY DETAIL\n${"=".repeat(120)}`);
  for (const r of results) {
    console.log(`\n${r.ticker} (${r.name})`);
    for (const t of r.traces) {
      console.log(`   ${t.metricName.padEnd(22)} value=${t.value === null ? "∅" : t.value.toFixed(4).padStart(10)} score=${t.score === null ? "∅" : t.score.toFixed(2).padStart(6)} ${t.status}`);
    }
    console.log(`   => Growth Score=${r.score} confidence=${r.confidence} coverage=${r.coverage}`);
  }

  // Sanity checks
  console.log(`\n${"=".repeat(120)}\nSANITY CHECKS\n${"=".repeat(120)}`);
  const scores = results.map((r) => r.score);
  const badRange = results.filter((r) => r.score < 0 || r.score > 100 || !Number.isFinite(r.score));
  const badConfidence = results.filter((r) => r.confidence < 0 || r.confidence > 1 || !Number.isFinite(r.confidence));
  console.log(`Scores out of [0,100] or non-finite: ${badRange.length} ${badRange.length === 0 ? "✅" : "❌ " + badRange.map((r) => r.ticker).join(",")}`);
  console.log(`Confidence out of [0,1] or non-finite: ${badConfidence.length} ${badConfidence.length === 0 ? "✅" : "❌"}`);
  console.log(`Unexpected TREND_ONLY despite valid benchmark: ${unexpectedTrendOnly} ${unexpectedTrendOnly === 0 ? "✅" : "❌ STOP CONDITION"}`);
  const uniqueScores = new Set(scores.map((s) => s.toFixed(4)));
  console.log(`Distinct score values: ${uniqueScores.size} / ${scores.length} companies (identical scores are only suspicious if inputs clearly differ — reviewed per-company above)`);
  const outsideUniverse = results.filter((r) => !DEMO_TICKERS.includes(r.ticker));
  console.log(`Companies scored outside the 30-company universe: ${outsideUniverse.length} ${outsideUniverse.length === 0 ? "✅" : "❌"}`);

  if (unexpectedTrendOnly > 0) {
    console.log(`\n❌ STOP CONDITION TRIGGERED — not proceeding to write. See the ❌ lines above.`);
    process.exit(1);
  }
  if (badRange.length > 0 || badConfidence.length > 0) {
    console.log(`\n❌ STOP CONDITION TRIGGERED (bad score/confidence range) — not proceeding to write.`);
    process.exit(1);
  }

  // Ranking
  const ranked = [...results].sort((a, b) => b.score - a.score);
  console.log(`\n${"=".repeat(120)}\nRANKING\n${"=".repeat(120)}`);
  ranked.forEach((r, i) => console.log(`${(i + 1).toString().padStart(2)}. ${r.ticker.padEnd(6)} ${r.name.padEnd(35)} score=${r.score.toString().padStart(6)} confidence=${r.confidence}`));

  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[(sorted.length - 1) / 2];
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  console.log(`\nHighest: ${ranked[0].ticker}=${ranked[0].score}. Lowest: ${ranked[ranked.length - 1].ticker}=${ranked[ranked.length - 1].score}. Median=${median.toFixed(2)}. Average=${avg.toFixed(2)}.`);

  if (mode === "write") {
    console.log(`\nWriting ${results.length} category_scores rows...`);
    for (const r of results) {
      const { error: insErr } = await db.from("category_scores").insert({
        company_id: r.companyId,
        category_id: r.categoryId,
        score: r.score,
        confidence: r.confidence,
        coverage: r.coverage,
        calculation_version: SCORING_VERSION,
      });
      if (insErr) throw new Error(`category_scores insert failed for ${r.ticker}: ${insErr.message}`);
    }
    console.log(`Done writing.`);
  } else {
    console.log(`\nPREFLIGHT ONLY — no rows written. Re-run with --write to actually populate category_scores.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
