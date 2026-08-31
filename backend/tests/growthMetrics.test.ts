// ============================================================================
// Tests: GROWTH category calculated metrics (backend/docs/growth-metrics-v1.0-spec.md)
// Pure math over plain numbers — no DB, no network. Proves the approved
// specification is implemented exactly as decided, including every edge
// case explicitly called out during the design review.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  calculateRevenueGrowthYoy,
  calculateRevenueCagr3y,
  calculateEpsGrowthYoy,
  calculateEpsCagr,
  calculateGrowthAcceleration,
} from "../src/calculations/growthMetrics";

describe("revenue_growth_yoy", () => {
  it("normal positive growth", () => {
    const r = calculateRevenueGrowthYoy(150, 100);
    expect(r.value).toBeCloseTo(50);
  });

  it("negative revenue growth is preserved, not nulled", () => {
    const r = calculateRevenueGrowthYoy(80, 100);
    expect(r.value).toBeCloseTo(-20);
  });

  it("unavailable when current period is missing", () => {
    const r = calculateRevenueGrowthYoy(null, 100);
    expect(r.value).toBeNull();
    expect(r.reason).toContain("current");
  });

  it("unavailable when previous period is missing", () => {
    const r = calculateRevenueGrowthYoy(150, null);
    expect(r.value).toBeNull();
    expect(r.reason).toContain("previous");
  });

  it("unavailable when previous revenue is zero (zero denominator)", () => {
    const r = calculateRevenueGrowthYoy(150, 0);
    expect(r.value).toBeNull();
    expect(r.reason).toContain("zero");
  });
});

describe("revenue_cagr_3y", () => {
  it("normal positive case, all 4 periods present", () => {
    // 90 -> 180 over 3 years = exactly 2x = (2^(1/3)-1)*100
    const r = calculateRevenueCagr3y([180, 150, 120, 90]);
    expect(r.value).toBeCloseTo((Math.pow(2, 1 / 3) - 1) * 100, 5);
  });

  it("negative CAGR when revenue declined but both endpoints stay positive", () => {
    const r = calculateRevenueCagr3y([90, 120, 150, 180]);
    expect(r.value).not.toBeNull();
    expect(r.value!).toBeLessThan(0);
  });

  it("unavailable with incomplete 4-year history (one period missing)", () => {
    const r = calculateRevenueCagr3y([180, 150, null, 90]);
    expect(r.value).toBeNull();
    expect(r.reason).toContain("index 2");
  });

  it("unavailable when fewer than 4 periods are supplied at all", () => {
    const r = calculateRevenueCagr3y([180, 150, 120]);
    expect(r.value).toBeNull();
    expect(r.reason).toContain("exactly 4");
  });

  it("unavailable when the 3-years-ago endpoint is <= 0", () => {
    const r = calculateRevenueCagr3y([180, 150, 120, 0]);
    expect(r.value).toBeNull();
  });

  it("unavailable when the current endpoint is <= 0", () => {
    const r = calculateRevenueCagr3y([-5, 150, 120, 90]);
    expect(r.value).toBeNull();
  });
});

describe("eps_growth_yoy — V1 rule (both periods must be strictly positive)", () => {
  it("normal positive growth", () => {
    const r = calculateEpsGrowthYoy(3, 2);
    expect(r.value).toBeCloseTo(50);
  });

  it("unavailable when previous eps is zero", () => {
    const r = calculateEpsGrowthYoy(3, 0);
    expect(r.value).toBeNull();
    expect(r.reason).toContain("strictly positive");
  });

  it("unavailable when current eps is negative", () => {
    const r = calculateEpsGrowthYoy(-1, 2);
    expect(r.value).toBeNull();
    expect(r.reason).toContain("strictly positive");
  });

  it("unavailable when previous eps is negative", () => {
    const r = calculateEpsGrowthYoy(2, -1);
    expect(r.value).toBeNull();
    expect(r.reason).toContain("strictly positive");
  });

  it("does NOT fall back to a dollar-change value when negative/zero", () => {
    const r = calculateEpsGrowthYoy(-1, -3);
    // dollar change would be +2 — must not appear as a substitute value
    expect(r.value).toBeNull();
  });

  it("unavailable when either period is missing", () => {
    expect(calculateEpsGrowthYoy(null, 2).value).toBeNull();
    expect(calculateEpsGrowthYoy(2, null).value).toBeNull();
  });
});

describe("eps_cagr", () => {
  it("normal positive case, all 4 periods present", () => {
    const r = calculateEpsCagr([5, 3, 2, 1]);
    expect(r.value).toBeCloseTo((Math.pow(5, 1 / 3) - 1) * 100, 5);
  });

  it("unavailable when the 3-years-ago EPS endpoint is negative", () => {
    const r = calculateEpsCagr([5, 3, 2, -1]);
    expect(r.value).toBeNull();
  });

  it("unavailable when the current EPS endpoint is negative", () => {
    const r = calculateEpsCagr([-2, 3, 2, 1]);
    expect(r.value).toBeNull();
  });

  it("unavailable when an endpoint is exactly zero", () => {
    const r = calculateEpsCagr([5, 3, 2, 0]);
    expect(r.value).toBeNull();
  });

  it("unavailable with incomplete 4-year history", () => {
    const r = calculateEpsCagr([5, null, 2, 1]);
    expect(r.value).toBeNull();
    expect(r.reason).toContain("index 1");
  });
});

describe("growth_acceleration (Candidate B, revenue-based trend/slope)", () => {
  it("accelerating growth (10% -> 20% -> 30% YoY) yields a positive slope", () => {
    // t-3=100, t-2=110 (+10%), t-1=132 (+20%), t=171.6 (+30%)
    const r = calculateGrowthAcceleration([171.6, 132, 110, 100]);
    expect(r.value).not.toBeNull();
    expect(r.value!).toBeCloseTo(10, 4);
  });

  it("decelerating growth (30% -> 20% -> 10% YoY) yields a negative slope", () => {
    // t-3=100, t-2=130 (+30%), t-1=156 (+20%), t=171.6 (+10%)
    const r = calculateGrowthAcceleration([171.6, 156, 130, 100]);
    expect(r.value).not.toBeNull();
    expect(r.value!).toBeCloseTo(-10, 4);
  });

  it("flat/stable growth (10% -> 10% -> 10% YoY) yields a near-zero slope", () => {
    // t-3=100, t-2=110, t-1=121, t=133.1 — constant 10% YoY
    const r = calculateGrowthAcceleration([133.1, 121, 110, 100]);
    expect(r.value).not.toBeNull();
    expect(r.value!).toBeCloseTo(0, 4);
  });

  it("unavailable with a missing revenue period", () => {
    const r = calculateGrowthAcceleration([171.6, 132, null, 100]);
    expect(r.value).toBeNull();
    expect(r.reason).toContain("index 2");
  });

  it("unavailable when fewer than 4 periods are supplied", () => {
    const r = calculateGrowthAcceleration([171.6, 132, 110]);
    expect(r.value).toBeNull();
    expect(r.reason).toContain("exactly 4");
  });

  it("unavailable when a zero-revenue denominator breaks one of the 3 YoY growth rates", () => {
    const r = calculateGrowthAcceleration([171.6, 132, 110, 0]);
    expect(r.value).toBeNull();
    expect(r.reason).toContain("g1");
  });
});
