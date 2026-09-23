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
        // Milestone 14D.1 root-cause fix: a single-point history defeats
        // scoreCategory.ts's documented no-benchmark fallback (trend-only
        // scoring, via calculations/metrics.ts's trend()), which needs >=2
        // points to compute a slope at all. With only one point, the
        // "no benchmark" case had NO path to a score — not because the
        // rule was genuinely uncovered, but because this fixture handed it
        // less data than the code path it was exercising actually needs.
        // Three ascending periods (still a single realistic trend line
        // ending at metricValue) give the trend fallback enough data to
        // succeed, which is what lets "same coverage, lower confidence"
        // — the property this test is actually named for — hold true.
        // The benchmark path (scoreAgainstBenchmark) only ever reads
        // latestValue, never history, so this is invisible to every other
        // test in this file that sets hasBenchmark: true.
        const history = opts.metricValue === null ? [null] : [opts.metricValue - 4, opts.metricValue - 2, opts.metricValue];
        map.set(name, { metricName: name, latestValue: opts.metricValue, history });
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

describe("scoring engine — a single historical data point never fabricates a trend score (Milestone 14E Part 0a)", () => {
  it("a TREND rule with exactly ONE historical value is unavailable (0 coverage/confidence/score), never a fabricated trend score", async () => {
    // Deliberately distinct from the "missing metric" test above: here the
    // OUTER gate in scoreCategory.ts (dataPoints >= minimumDataPoints AND
    // latestValue !== null) passes — there IS one real value — but
    // trend() (calculations/metrics.ts) requires >=2 non-null points to
    // compute a slope at all, so the TREND-specific inner check must still
    // reject it. This proves that distinction, not just "no data at all".
    const category = makeCategory("EARNINGS_MOMENTUM", 1.0);
    const trendRule: ScoreRule = {
      id: "EARNINGS_MOMENTUM-eps_surprise_percent",
      categoryId: category.id,
      metricName: "eps_surprise_percent",
      ruleType: "TREND",
      weight: 1.0,
      direction: "HIGHER_IS_BETTER",
      minimumDataPoints: 1,
      sectorSpecific: false,
      version: SCORING_VERSION,
      active: true,
    };
    const repo: ScoringRepo = {
      async getActiveCategories() {
        return [category];
      },
      async getActiveRules() {
        return [trendRule];
      },
      async getMetricInputs(_companyId, metricNames) {
        const map = new Map<string, MetricInput>();
        for (const name of metricNames) {
          map.set(name, { metricName: name, latestValue: 12.5, history: [12.5] }); // exactly one point
        }
        return map;
      },
      async getBenchmarks() {
        return new Map(); // TREND rules never consult benchmarks anyway
      },
      async getCompanySector() {
        return "Technology";
      },
      async getPreviousFundamentalScore() {
        return null;
      },
      async storeFundamentalScore() {},
    };

    const result = await calculateFundamentalScore("company-1", repo);
    expect(result.dataCoverage).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.score).toBe(0);
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
