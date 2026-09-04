// ============================================================================
// Tests: Supabase ScoringRepo shaping helpers (Milestone 4A)
// Pure functions — no DB. Proves row-mapping, history ordering, and
// benchmark-map construction are correct independent of any live query.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  buildMetricInput,
  buildBenchmarkMap,
  mapScoreCategoryRow,
  mapScoreRuleRow,
} from "../src/scoring/scoringRepoHelpers";

describe("buildMetricInput — loading calculated metric inputs", () => {
  it("latestValue is the most recent (first) row's value", () => {
    const input = buildMetricInput("revenue_growth_yoy", [
      { periodEnd: "2026-01-25", value: 65.47 },
      { periodEnd: "2025-01-26", value: 114.2 },
    ]);
    expect(input.latestValue).toBe(65.47);
  });

  it("correct history ordering: DB rows arrive most-recent-first, history is stored oldest-first (most recent last)", () => {
    const input = buildMetricInput("revenue_growth_yoy", [
      { periodEnd: "2026-01-25", value: 65.47 },
      { periodEnd: "2025-01-26", value: 114.2 },
      { periodEnd: "2024-01-28", value: 125.85 },
    ]);
    expect(input.history).toEqual([125.85, 114.2, 65.47]);
  });

  it("loading historical calculated metrics: a metric with only one stored value has history of length 1", () => {
    const input = buildMetricInput("eps_cagr", [{ periodEnd: "2026-01-25", value: 201.43 }]);
    expect(input.history).toEqual([201.43]);
    expect(input.latestValue).toBe(201.43);
  });

  it("unavailable/null metrics: no stored rows at all produces null latestValue and empty history", () => {
    const input = buildMetricInput("growth_acceleration", []);
    expect(input.latestValue).toBeNull();
    expect(input.history).toEqual([]);
  });

  it("does not mutate the input array (reverses a copy)", () => {
    const rows = [
      { periodEnd: "2026-01-25", value: 1 },
      { periodEnd: "2025-01-26", value: 2 },
    ];
    buildMetricInput("x", rows);
    expect(rows[0]!.periodEnd).toBe("2026-01-25"); // unchanged
  });
});

describe("buildBenchmarkMap — missing benchmark behavior", () => {
  it("empty rows (metric_benchmarks currently has zero rows) => empty map, not a fabricated benchmark", () => {
    const map = buildBenchmarkMap([], ["revenue_growth_yoy", "eps_cagr"]);
    expect(map.size).toBe(0);
    expect(map.has("revenue_growth_yoy")).toBe(false);
  });

  it("a metric with no matching row is simply absent from the map", () => {
    const map = buildBenchmarkMap(
      [{ metric_name: "eps_cagr", sector: "Technology", industry: null, period_end: "2026-06-30", p25: 10, median: 20, p75: 30, p90: 40, sample_size: 15 }],
      ["revenue_growth_yoy", "eps_cagr"]
    );
    expect(map.has("revenue_growth_yoy")).toBe(false);
    expect(map.get("eps_cagr")).toMatchObject({ p25: 10, median: 20, p75: 30, p90: 40, sampleSize: 15 });
  });

  it("a row for a metric that wasn't requested is not included", () => {
    const map = buildBenchmarkMap(
      [{ metric_name: "pe", sector: "Technology", industry: null, period_end: "2026-06-30", p25: 1, median: 2, p75: 3, p90: 4, sample_size: 5 }],
      ["revenue_growth_yoy"]
    );
    expect(map.size).toBe(0);
  });
});

describe("mapScoreCategoryRow / mapScoreRuleRow — loading active rules/categories", () => {
  it("maps a score_categories row to the domain shape", () => {
    const category = mapScoreCategoryRow({ id: "cat-1", category_key: "GROWTH", name: "Growth", default_weight: 0.16, is_active: true });
    expect(category).toEqual({ id: "cat-1", categoryKey: "GROWTH", name: "Growth", defaultWeight: 0.16, isActive: true });
  });

  it("maps a score_rules row to the domain shape, including sector_specific (sector-specific rule handling)", () => {
    const rule = mapScoreRuleRow({
      id: "rule-1",
      category_id: "cat-1",
      metric_name: "revenue_growth_yoy",
      rule_type: "PERCENTILE",
      weight: 0.3,
      direction: "HIGHER_IS_BETTER",
      minimum_data_points: 2,
      sector_specific: true,
      version: "v1.0",
      active: true,
    });
    expect(rule).toEqual({
      id: "rule-1",
      categoryId: "cat-1",
      metricName: "revenue_growth_yoy",
      ruleType: "PERCENTILE",
      weight: 0.3,
      direction: "HIGHER_IS_BETTER",
      minimumDataPoints: 2,
      sectorSpecific: true,
      version: "v1.0",
      active: true,
    });
  });

  it("preserves sector_specific = false faithfully (not defaulted to true)", () => {
    const rule = mapScoreRuleRow({
      id: "rule-2",
      category_id: "cat-earnings",
      metric_name: "eps_surprise_percent",
      rule_type: "LINEAR",
      weight: 0.3,
      direction: "HIGHER_IS_BETTER",
      minimum_data_points: 1,
      sector_specific: false,
      version: "v1.0",
      active: true,
    });
    expect(rule.sectorSpecific).toBe(false);
  });
});
