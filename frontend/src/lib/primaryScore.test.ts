import { describe, it, expect } from "vitest";
import { primaryScore } from "./primaryScore";
import type { ScoresResponse } from "./types";

function growthCategory(score: number, confidence: number): ScoresResponse["categories"][number] {
  return {
    score, confidence, coverage: confidence, calculation_version: "v1.0", calculated_at: "2026-09-01T00:00:00Z",
    score_categories: { category_key: "GROWTH", name: "Growth" },
  };
}

describe("primaryScore", () => {
  it("returns null when there is no score data at all", () => {
    expect(primaryScore(null)).toBeNull();
    expect(primaryScore({ fundamental: null, categories: [] })).toBeNull();
  });

  it("falls back to the real GROWTH category score when no fundamental score exists (Milestone 10C state)", () => {
    const result = primaryScore({ fundamental: null, categories: [growthCategory(94.6, 0.5)] });
    expect(result).toEqual({ score: 94.6, confidence: 0.5, label: "Growth Score" });
  });

  it("prefers the fundamental score over the GROWTH category when both exist", () => {
    const fundamental = { score: 71, confidence: 0.8, data_coverage: 0.8, calculation_version: "v1.0", previous_score: null, score_change: null, calculated_at: "2026-09-01T00:00:00Z" };
    const result = primaryScore({ fundamental, categories: [growthCategory(94.6, 0.5)] });
    expect(result).toEqual({ score: 71, confidence: 0.8, label: "Fundamental Score" });
  });

  it("never fabricates a score for a category other than GROWTH", () => {
    const other = { ...growthCategory(50, 0.5), score_categories: { category_key: "PROFITABILITY" as const, name: "Profitability" } };
    expect(primaryScore({ fundamental: null, categories: [other] })).toBeNull();
  });
});
