import { describe, it, expect } from "vitest";
import { LOW_CONFIDENCE_THRESHOLD, INSUFFICIENT_DATA_LABEL, isLowConfidence, verdictLabel, verdictColor, isComparableChange } from "./scoreDisplay";
import type { FundamentalScoreRow } from "./types";

function fundamental(overrides: Partial<FundamentalScoreRow>): FundamentalScoreRow {
  return {
    score: 78.4,
    confidence: 0.7,
    data_coverage: 0.6,
    calculation_version: "v1.3",
    previous_score: 78.9,
    score_change: -0.5,
    calculated_at: "2026-09-23T20:19:05.99Z",
    previous_calculation_version: "v1.3",
    ...overrides,
  };
}

describe("isLowConfidence / LOW_CONFIDENCE_THRESHOLD", () => {
  it("is low confidence strictly below the threshold", () => {
    expect(isLowConfidence(LOW_CONFIDENCE_THRESHOLD - 0.001)).toBe(true);
    expect(isLowConfidence(0)).toBe(true);
  });

  it("is not low confidence at or above the threshold", () => {
    expect(isLowConfidence(LOW_CONFIDENCE_THRESHOLD)).toBe(false);
    expect(isLowConfidence(1)).toBe(false);
  });

  it("matches the real NVDA and LLY confidences seen live (Milestone 16A/16B)", () => {
    expect(isLowConfidence(0.365)).toBe(true); // NVDA, v1.3
    expect(isLowConfidence(0.14)).toBe(true); // LLY, live dashboard row
  });
});

describe("verdictLabel", () => {
  it('never shows a tier word below the confidence threshold — always "Insufficient data"', () => {
    expect(verdictLabel(95, 0.1)).toBe(INSUFFICIENT_DATA_LABEL);
    expect(verdictLabel(20, 0.1)).toBe(INSUFFICIENT_DATA_LABEL);
  });

  it("shows the real score tier once confidence clears the threshold", () => {
    expect(verdictLabel(95, 0.9)).toBe("Excellent");
    expect(verdictLabel(82, 0.9)).toBe("Strong");
    expect(verdictLabel(70, 0.9)).toBe("Fair");
    expect(verdictLabel(40, 0.9)).toBe("Weak");
  });

  it('the old "Improving" tier name is gone — a mediocre score never claims a trend', () => {
    expect(verdictLabel(70, 0.9)).not.toBe("Improving");
  });
});

describe("verdictColor", () => {
  it("is neutral gray for a low-confidence score regardless of the score value", () => {
    const highScoreColor = verdictColor(95, 0.1);
    const lowScoreColor = verdictColor(10, 0.1);
    expect(highScoreColor).toBe(lowScoreColor);
  });
});

describe("isComparableChange", () => {
  it("is not comparable when there is no data at all", () => {
    expect(isComparableChange(null)).toBe(false);
    expect(isComparableChange(undefined)).toBe(false);
  });

  it("is not comparable when there is no previous score", () => {
    expect(isComparableChange(fundamental({ previous_score: null }))).toBe(false);
  });

  it("is not comparable when the previous row's version is unknown (pre-16B API response, e.g. the stale demo snapshot)", () => {
    expect(isComparableChange(fundamental({ previous_calculation_version: undefined }))).toBe(false);
    expect(isComparableChange(fundamental({ previous_calculation_version: null }))).toBe(false);
  });

  it("is NOT comparable across different calculation_versions — the real v1.2 -> v1.3 case for every company today", () => {
    expect(isComparableChange(fundamental({ calculation_version: "v1.3", previous_calculation_version: "v1.2" }))).toBe(false);
  });

  it("IS comparable when both scores share the same calculation_version", () => {
    expect(isComparableChange(fundamental({ calculation_version: "v1.3", previous_calculation_version: "v1.3" }))).toBe(true);
  });
});
