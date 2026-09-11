// ============================================================================
// Equity AI — Generic Category Scorer
//
// Every one of the 8 categories (growth, profitability, financial health,
// valuation, capital allocation, competitive advantage, management, earnings
// momentum) runs through this SAME function, driven entirely by the
// score_rules configuration rows for that category. There is no
// category-specific branching logic in code — weights, metrics, and
// directions all come from the database (brief §16/§23-30: "weights MUST
// NOT be hardcoded into application logic").
// ============================================================================

import { scoreAgainstBenchmark, scoreFromTrendOnly } from "../percentile";
import { computeConfidence, type RuleEvaluation } from "../confidence";
import { trend as trendSlope } from "../../calculations/metrics";
import type { CategoryScore } from "../../types/domain";
import type { CategoryScoringContext } from "./types";

export function scoreCategory(ctx: CategoryScoringContext): CategoryScore {
  const activeRules = ctx.rules.filter((r) => r.active && r.version === ctx.calculationVersion);
  const evaluations: RuleEvaluation[] = [];
  let weightedScoreSum = 0;
  let weightedScoreWeight = 0;

  for (const rule of activeRules) {
    const input = ctx.metrics.get(rule.metricName);
    const dataPoints = input ? input.history.filter((v) => v !== null).length : 0;
    const hasEnoughData = dataPoints >= rule.minimumDataPoints && (input?.latestValue ?? null) !== null;

    if (!hasEnoughData) {
      evaluations.push({ weight: rule.weight, hasEnoughData: false, usedBenchmark: false });
      continue;
    }

    if (rule.ruleType === "TREND") {
      const slope = trendSlope(input!.history);
      const score = scoreFromTrendOnly(slope, rule.direction);
      if (score === null) {
        evaluations.push({ weight: rule.weight, hasEnoughData: false, usedBenchmark: false });
        continue;
      }
      weightedScoreSum += score * rule.weight;
      weightedScoreWeight += rule.weight;
      evaluations.push({ weight: rule.weight, hasEnoughData: true, usedBenchmark: false });
      continue;
    }

    // PERCENTILE / LINEAR / LOG / RATIO / COMPOSITE all resolve via the
    // benchmark distribution when one exists; fall back to trend-only
    // (lower-trust) when it doesn't, rather than refusing to score at all.
    const benchmark = ctx.benchmarks.get(rule.metricName) ?? null;
    if (benchmark) {
      const { score } = scoreAgainstBenchmark(input!.latestValue, benchmark, rule.direction);
      if (score === null) {
        evaluations.push({ weight: rule.weight, hasEnoughData: false, usedBenchmark: false });
        continue;
      }
      weightedScoreSum += score * rule.weight;
      weightedScoreWeight += rule.weight;
      evaluations.push({ weight: rule.weight, hasEnoughData: true, usedBenchmark: true });
    } else {
      const slope = trendSlope(input!.history);
      const score = scoreFromTrendOnly(slope, rule.direction);
      if (score === null) {
        evaluations.push({ weight: rule.weight, hasEnoughData: false, usedBenchmark: false });
        continue;
      }
      weightedScoreSum += score * rule.weight;
      weightedScoreWeight += rule.weight;
      evaluations.push({ weight: rule.weight, hasEnoughData: true, usedBenchmark: false });
    }
  }

  const { coverage, confidence } = computeConfidence(evaluations);
  // Re-weight the score using only the rules that actually contributed, so
  // missing data doesn't silently drag the score toward zero.
  const score = weightedScoreWeight > 0 ? weightedScoreSum / weightedScoreWeight : 0;

  return {
    companyId: ctx.companyId,
    categoryId: ctx.categoryId,
    categoryKey: ctx.categoryKey,
    score: Math.round(score * 10) / 10,
    confidence,
    coverage,
    calculationVersion: ctx.calculationVersion,
    calculatedAt: new Date().toISOString(),
  };
}
