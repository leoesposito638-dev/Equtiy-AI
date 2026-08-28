// ============================================================================
// Tests: scoring engine — reproducibility, confidence, missing data
// Uses an in-memory fake ScoringRepo — no database required. This proves the
// engine's logic end-to-end independent of any live Postgres/Supabase
// instance, which this sandbox does not have.
// ============================================================================

import { describe, it, expect } from "vitest";
import { calculateFundamentalScore, SCORING_VERSION, type ScoringRepo } from "../src/scoring/scoringEngine";
import type { MetricBenchmark, ScoreCategory, ScoreRule, FundamentalScore } from "../src/types/domain";
import type { MetricInput } from "../src/scoring/categoryScorers/types";

function makeCategory(key: ScoreCategory["categoryKey"], weight: number): ScoreCategory {
  return { id: key, categoryKey: key, name: key, defaultWeight: weight, isActive: true };
}

function makeRule(categoryId: string, metricName: string, weight: number, direction: ScoreRule["direction"]): ScoreRule {
  return {
    id: `${categoryId}-${metricName}`,
    categoryId,
    metricName,
    ruleType: "PERCENTILE",
    weight,
    direction,
    minimumDataPoints: 1,
    sectorSpecific: true,
    version: SCORING_VERSION,
    active: true,
  };
}

function makeBenchmark(metricName: string): MetricBenchmark {
  return { metricName, periodEnd: "2026-06-30", p25: 5, median: 15, p75: 25, p90: 35, sampleSize: 40 };
}

function buildFakeRepo(opts: {
  metricValue: number | null;
  hasBenchmark: boolean;
  previous?: { score: number; calculatedAt: string } | null;
}): { repo: ScoringRepo; stored: FundamentalScore[] } {
  const categories = [makeCategory("GROWTH", 1.0)];
  const rules = [makeRule("GROWTH", "revenue_growth_yoy", 1.0, "HIGHER_IS_BETTER")];
  const stored: FundamentalScore[] = [];

  const repo: ScoringRepo = {
    async getActiveCategories() {
      return categories;
    },
    async getActiveRules() {
      return rules;
    },
    async getMetricInputs(_companyId, metricNames) {
      const map = new Map<string, MetricInput>();
      for (const name of metricNames) {
        map.set(name, { metricName: name, latestValue: opts.metricValue, history: [opts.metricValue] });
      }
      return map;
    },
    async getBenchmarks(_sector, metricNames) {
      const map = new Map<string, MetricBenchmark>();
      if (opts.hasBenchmark) {
        for (const name of metricNames) map.set(name, makeBenchmark(name));
      }
      return map;
    },
    async getCompanySector() {
      return "Technology";
    },
    async getPreviousFundamentalScore() {
      return opts.previous ?? null;
    },
    async storeFundamentalScore(result) {
      stored.push(result);
    },
  };

  return { repo, stored };
}

describe("scoring engine — missing data", () => {
  it("a missing metric never fabricates a score — confidence/coverage collapse to reflect it", async () => {
    const { repo } = buildFakeRepo({ metricValue: null, hasBenchmark: true, previous: null });
    const result = await calculateFundamentalScore("company-1", repo);
    expect(result.dataCoverage).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.score).toBe(0);
  });
});

describe("scoring engine — confidence reflects data completeness", () => {
  it("full data + benchmark => high coverage and confidence", async () => {
    const { repo } = buildFakeRepo({ metricValue: 20, hasBenchmark: true, previous: null });
    const result = await calculateFundamentalScore("company-1", repo);
    expect(result.dataCoverage).toBe(1);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("data present but no benchmark => lower confidence than the benchmarked case, same coverage", async () => {
    const withBenchmark = await calculateFundamentalScore(
      "company-1",
      buildFakeRepo({ metricValue: 20, hasBenchmark: true, previous: null }).repo
    );
    const withoutBenchmark = await calculateFundamentalScore(
      "company-2",
      buildFakeRepo({ metricValue: 20, hasBenchmark: false, previous: null }).repo
    );
    expect(withoutBenchmark.dataCoverage).toBe(withBenchmark.dataCoverage);
    expect(withoutBenchmark.confidence).toBeLessThan(withBenchmark.confidence);
  });
});

describe("scoring engine — reproducibility", () => {
  it("the same inputs + same calculation_version always produce the same score", async () => {
    const run1 = await calculateFundamentalScore("company-1", buildFakeRepo({ metricValue: 20, hasBenchmark: true }).repo);
    const run2 = await calculateFundamentalScore("company-1", buildFakeRepo({ metricValue: 20, hasBenchmark: true }).repo);
    expect(run1.score).toBe(run2.score);
    expect(run1.calculationVersion).toBe(run2.calculationVersion);
  });
});

describe("scoring engine — score_change vs previous snapshot", () => {
  it("computes score_change against the previous stored score", async () => {
    const { repo } = buildFakeRepo({
      metricValue: 30, // higher value => higher score than the 60/100-ish baseline
      hasBenchmark: true,
      previous: { score: 50, calculatedAt: "2026-05-01T00:00:00Z" },
    });
    const result = await calculateFundamentalScore("company-1", repo);
    expect(result.previousScore).toBe(50);
    expect(result.scoreChange).toBe(Math.round((result.score - 50) * 10) / 10);
  });

  it("previousScore/scoreChange are null when no prior snapshot exists", async () => {
    const { repo } = buildFakeRepo({ metricValue: 20, hasBenchmark: true, previous: null });
    const result = await calculateFundamentalScore("company-1", repo);
    expect(result.previousScore).toBeNull();
    expect(result.scoreChange).toBeNull();
  });
});
