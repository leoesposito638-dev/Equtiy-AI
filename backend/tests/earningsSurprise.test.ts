// ============================================================================
// Tests: calculations/earningsSurprise.ts (Milestone 14B §4/§12.A/§12.B) —
// pure functions, no I/O, no mocking needed.
// ============================================================================

import { describe, it, expect } from "vitest";
import { calculateEpsSurprisePercent, calculateRevenueSurprisePercent } from "../src/calculations/earningsSurprise";

describe("calculateEpsSurprisePercent", () => {
  it("positive surprise: actual beats consensus", () => {
    const result = calculateEpsSurprisePercent(2.22, 2.09);
    expect(result.value).not.toBeNull();
    expect(result.value!).toBeCloseTo(((2.22 - 2.09) / Math.abs(2.09)) * 100, 6);
    expect(result.value!).toBeGreaterThan(0);
  });

  it("negative surprise: actual misses consensus", () => {
    const result = calculateEpsSurprisePercent(0.33, 0.5);
    expect(result.value!).toBeCloseTo(((0.33 - 0.5) / Math.abs(0.5)) * 100, 6);
    expect(result.value!).toBeLessThan(0);
  });

  it("zero consensus -> unavailable, never divides by zero", () => {
    const result = calculateEpsSurprisePercent(1.0, 0);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("zero");
  });

  it("null consensus -> unavailable", () => {
    const result = calculateEpsSurprisePercent(1.0, null);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("missing");
  });

  it("null actual -> unavailable (this is exactly the 'upcoming earnings row' case)", () => {
    const result = calculateEpsSurprisePercent(null, 2.47);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("missing");
  });

  it("non-finite actual (NaN) -> unavailable, not silently converted", () => {
    const result = calculateEpsSurprisePercent(NaN, 2.0);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("not a finite number");
  });

  it("non-finite consensus (Infinity) -> unavailable", () => {
    const result = calculateEpsSurprisePercent(2.0, Infinity);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("not a finite number");
  });

  it("exact match (actual === consensus) -> 0, not null", () => {
    const result = calculateEpsSurprisePercent(1.5, 1.5);
    expect(result.value).toBe(0);
  });

  it("negative consensus with a less-negative actual is still computed correctly", () => {
    const result = calculateEpsSurprisePercent(-0.14, -0.2);
    expect(result.value!).toBeCloseTo(((-0.14 - -0.2) / Math.abs(-0.2)) * 100, 6);
  });
});

describe("calculateRevenueSurprisePercent", () => {
  it("positive surprise", () => {
    const result = calculateRevenueSurprisePercent(96_221_000_000, 92_270_940_000);
    expect(result.value!).toBeGreaterThan(0);
    expect(result.value!).toBeCloseTo(((96_221_000_000 - 92_270_940_000) / 92_270_940_000) * 100, 6);
  });

  it("negative surprise", () => {
    const result = calculateRevenueSurprisePercent(90_000_000, 100_000_000);
    expect(result.value!).toBeLessThan(0);
  });

  it("zero consensus -> unavailable", () => {
    const result = calculateRevenueSurprisePercent(1_000_000, 0);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("zero");
  });

  it("null consensus -> unavailable", () => {
    const result = calculateRevenueSurprisePercent(1_000_000, null);
    expect(result.value).toBeNull();
  });

  it("null actual (upcoming report) -> unavailable", () => {
    const result = calculateRevenueSurprisePercent(null, 126_846_200_000);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("missing");
  });

  it("non-finite input -> unavailable", () => {
    expect(calculateRevenueSurprisePercent(NaN, 100).value).toBeNull();
    expect(calculateRevenueSurprisePercent(100, -Infinity).value).toBeNull();
  });
});
