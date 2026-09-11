// ============================================================================
// Equity AI — Scoring Engine
//
// calculateFundamentalScore(companyId) implements the exact pipeline from
// the brief (§21):
//   1. Fetch normalized financial data
//   2. Calculate missing derived metrics
//   3. Validate data
//   4. Determine peer group
//   5. Calculate historical benchmarks
//   6. Calculate metric percentiles
//   7. Calculate metric scores
//   8. Aggregate category scores
//   9. Apply industry configuration
//  10. Calculate confidence
//  11. Calculate total score
//  12. Store score snapshot
//
// This module has NO knowledge of any specific company's numbers — it is
// pure orchestration over a repository interface, so it is fully unit
// testable (see tests/scoring.test.ts) without a live database.
// ============================================================================

import type { CategoryScore, FundamentalScore, MetricBenchmark, ScoreCategory, ScoreRule } from "../types/domain";
import { scoreCategory } from "./categoryScorers/scoreCategory";
import type { MetricInput } from "./categoryScorers/types";

// Milestone 13C: bumped to v1.1 (gross_margin_stability/roic_persistence's
// minimum_data_points 5 -> 4 — see schema/007_scoring_config_v1_1.sql).
// Every other rule is identical to v1.0. Past scores calculated under v1.0
// remain in the database, tagged calculation_version='v1.0', and stay
// reproducible; this constant only controls which version NEW scoring runs
// use (repo.getActiveRules(SCORING_VERSION) below).
export const SCORING_VERSION = "v1.1";

export interface ScoringRepo {
  getActiveCategories(): Promise<ScoreCategory[]>;
  getActiveRules(version: string): Promise<ScoreRule[]>;
  /** Latest value + trailing history (calculated_metrics, already versioned/deduped). */
  getMetricInputs(companyId: string, metricNames: string[]): Promise<Map<string, MetricInput>>;
  /** Resolved against the company's sector/industry for the relevant period. */
  getBenchmarks(companySector: string | undefined, metricNames: string[]): Promise<Map<string, MetricBenchmark>>;
  getCompanySector(companyId: string): Promise<string | undefined>;
  getPreviousFundamentalScore(companyId: string): Promise<{ score: number; calculatedAt: string } | null>;
  storeFundamentalScore(result: FundamentalScore): Promise<void>;
}

export async function calculateFundamentalScore(
  companyId: string,
  repo: ScoringRepo
): Promise<FundamentalScore> {
  // 1 + 9: categories and their active, versioned rule configuration.
  const [categories, rules, sector, previous] = await Promise.all([
    repo.getActiveCategories(),
    repo.getActiveRules(SCORING_VERSION),
    repo.getCompanySector(companyId),
    repo.getPreviousFundamentalScore(companyId),
  ]);

  const rulesByCategory = new Map<string, ScoreRule[]>();
  for (const rule of rules) {
    const list = rulesByCategory.get(rule.categoryId) ?? [];
    list.push(rule);
    rulesByCategory.set(rule.categoryId, list);
  }

  const categoryScores: CategoryScore[] = [];

  for (const category of categories) {
    const categoryRules = rulesByCategory.get(category.id) ?? [];
    const metricNames = categoryRules.map((r) => r.metricName);

    // 2/3 (fetch + implicitly-validated: getMetricInputs only returns
    // canonical, already-validated calculated_metrics/financial_metrics —
    // never raw, never AI-touched) + 6 (benchmarks feed percentiles).
    const [metrics, benchmarks] = await Promise.all([
      repo.getMetricInputs(companyId, metricNames),
      repo.getBenchmarks(sector, metricNames),
    ]);

    // 7 + 8: score every rule, aggregate into one category score.
    const categoryScore = scoreCategory({
      companyId,
      categoryId: category.id,
      categoryKey: category.categoryKey,
      rules: categoryRules,
      metrics,
      benchmarks,
      calculationVersion: SCORING_VERSION,
    });

    categoryScores.push(categoryScore);
  }

  // 10 + 11: aggregate to the top-level score, weighting each category by
  // its configured default_weight AND by its own confidence — a category
  // the engine isn't confident about should not swing the total score as
  // hard as one backed by complete data.
  let weightedSum = 0;
  let weightTotal = 0;
  let confidenceWeightedSum = 0;
  let coverageWeightedSum = 0;

  for (const category of categories) {
    const cs = categoryScores.find((c) => c.categoryId === category.id);
    if (!cs) continue;
    // effectiveWeight scales with confidence down to true zero — a category
    // with zero coverage (e.g. no data ingested for it yet) must contribute
    // zero weight, not a 0.4x floor. A floor here would silently treat "we
    // don't know" as "this is bad," pulling the total score down for a
    // reason that has nothing to do with the company's fundamentals — this
    // was verified against a real run of the engine (src/localDev/server.ts)
    // where an entirely unscored category (score 0, confidence 0) was still
    // dragging the fundamental score down before this fix.
    const effectiveWeight = category.defaultWeight * cs.confidence;
    weightedSum += cs.score * effectiveWeight;
    weightTotal += effectiveWeight;
    confidenceWeightedSum += cs.confidence * category.defaultWeight;
    coverageWeightedSum += cs.coverage * category.defaultWeight;
  }

  const totalDefaultWeight = categories.reduce((s, c) => s + c.defaultWeight, 0) || 1;
  const score = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const confidence = confidenceWeightedSum / totalDefaultWeight;
  const dataCoverage = coverageWeightedSum / totalDefaultWeight;

  const result: FundamentalScore = {
    companyId,
    score: Math.round(score * 10) / 10,
    confidence: Math.round(confidence * 1000) / 1000,
    dataCoverage: Math.round(dataCoverage * 1000) / 1000,
    calculationVersion: SCORING_VERSION,
    previousScore: previous?.score ?? null,
    scoreChange: previous ? Math.round((score - previous.score) * 10) / 10 : null,
    calculatedAt: new Date().toISOString(),
    categoryScores,
  };

  // 12: store the snapshot — this call is the ONLY write in this module.
  await repo.storeFundamentalScore(result);
  return result;
}
