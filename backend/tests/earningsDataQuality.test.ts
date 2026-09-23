// ============================================================================
// Tests: calculations/earningsDataQuality.ts (Milestone 14B §8/§12.D) — the
// magnitude-implausibility guard. Fixtures use the actual live values
// observed during Milestone 14B's calibration pass against real FMP data
// (GOOGL/AMZN's confirmed-anomalous rows, plus real "normal" rows from
// other demo-universe tickers), not invented numbers.
// ============================================================================

import { describe, it, expect } from "vitest";
import { assessSurpriseMagnitude, IMPLAUSIBLE_SURPRISE_MAGNITUDE_PERCENT } from "../src/calculations/earningsDataQuality";
import { calculateEpsSurprisePercent } from "../src/calculations/earningsSurprise";

describe("assessSurpriseMagnitude — known suspicious patterns rejected", () => {
  it("GOOGL 2026-07-22 (actual 9.11 vs consensus 2.87, live-verified Milestone 14B) is rejected", () => {
    const surprise = calculateEpsSurprisePercent(9.11, 2.87);
    const check = assessSurpriseMagnitude(surprise.value, "EPS");
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("plausibility threshold");
  });

  it("AMZN 2026-07-30 (actual 5.75 vs consensus 1.82, live-verified Milestone 14B) is rejected", () => {
    const surprise = calculateEpsSurprisePercent(5.75, 1.82);
    const check = assessSurpriseMagnitude(surprise.value, "EPS");
    expect(check.ok).toBe(false);
  });

  it("INTC's near-zero-consensus degenerate case (actual 0.29 vs consensus 0.01897) is also rejected — the guard is generic, not GOOGL/AMZN-specific", () => {
    const surprise = calculateEpsSurprisePercent(0.29, 0.01897);
    const check = assessSurpriseMagnitude(surprise.value, "EPS");
    expect(check.ok).toBe(false);
  });

  it("rejection never modifies the value — the caller decides to discard it, this function only judges", () => {
    const surprise = calculateEpsSurprisePercent(9.11, 2.87);
    const originalValue = surprise.value;
    assessSurpriseMagnitude(surprise.value, "EPS");
    expect(surprise.value).toBe(originalValue); // untouched
  });
});

describe("assessSurpriseMagnitude — normal records accepted", () => {
  it("a strong but real beat (INTC 2026-07-23: actual 0.42 vs consensus 0.21, +100%) is accepted", () => {
    const surprise = calculateEpsSurprisePercent(0.42, 0.21);
    const check = assessSurpriseMagnitude(surprise.value, "EPS");
    expect(check.ok).toBe(true);
  });

  it("a large real beat just under the threshold (UNH 2026-07-16: actual 6.38 vs consensus 4.94, +29.1%) is accepted", () => {
    const surprise = calculateEpsSurprisePercent(6.38, 4.94);
    const check = assessSurpriseMagnitude(surprise.value, "EPS");
    expect(check.ok).toBe(true);
  });

  it("a typical small surprise (NVDA 2026-08-26: actual 2.22 vs consensus 2.09) is accepted", () => {
    const surprise = calculateEpsSurprisePercent(2.22, 2.09);
    expect(assessSurpriseMagnitude(surprise.value, "EPS").ok).toBe(true);
  });

  it("a typical miss (TSLA 2026-07-22: actual 0.33 vs consensus 0.50) is accepted", () => {
    const surprise = calculateEpsSurprisePercent(0.33, 0.5);
    expect(assessSurpriseMagnitude(surprise.value, "EPS").ok).toBe(true);
  });

  it("a null surprise (nothing computed) trivially passes — nothing to reject", () => {
    expect(assessSurpriseMagnitude(null, "EPS").ok).toBe(true);
  });

  it("exactly at the threshold boundary is accepted (guard uses strictly-greater-than)", () => {
    expect(assessSurpriseMagnitude(IMPLAUSIBLE_SURPRISE_MAGNITUDE_PERCENT, "EPS").ok).toBe(true);
    expect(assessSurpriseMagnitude(-IMPLAUSIBLE_SURPRISE_MAGNITUDE_PERCENT, "EPS").ok).toBe(true);
  });

  it("just over the threshold is rejected, symmetric for negative magnitude too", () => {
    expect(assessSurpriseMagnitude(IMPLAUSIBLE_SURPRISE_MAGNITUDE_PERCENT + 0.1, "EPS").ok).toBe(false);
    expect(assessSurpriseMagnitude(-(IMPLAUSIBLE_SURPRISE_MAGNITUDE_PERCENT + 0.1), "EPS").ok).toBe(false);
  });

  it("applies identically to revenue surprise (the fieldLabel only changes the message, not the logic)", () => {
    expect(assessSurpriseMagnitude(50, "revenue").ok).toBe(true);
    expect(assessSurpriseMagnitude(250, "revenue").ok).toBe(false);
  });
});

describe("assessSurpriseMagnitude — does not become a company blacklist", () => {
  it("CVX's current live data (max observed 41.0%, Milestone 14B) is accepted — the guard does not blanket-exclude CVX", () => {
    // CVX 2026-05-01: actual 1.41 vs consensus 1.00 (verified live, Milestone 14B).
    const surprise = calculateEpsSurprisePercent(1.41, 1.0);
    expect(assessSurpriseMagnitude(surprise.value, "EPS").ok).toBe(true);
  });
});
