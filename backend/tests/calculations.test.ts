// ============================================================================
// Tests: calculation engine — critical test cases from brief §50
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  pctChange,
  cagr,
  marginOf,
  netDebtToEbitda,
  priceToEarnings,
  fcfYield,
  priceToFcf,
  freeCashFlow,
} from "../src/calculations/metrics";

describe("missing data never fabricates a value", () => {
  it("returns null, not 0, when an input is missing", () => {
    expect(pctChange(null, 100)).toBeNull();
    expect(pctChange(100, null)).toBeNull();
    expect(marginOf(null, 1000)).toBeNull();
    expect(marginOf(500, null)).toBeNull();
    expect(cagr(null, 100, 3)).toBeNull();
  });

  it("returns null on division-by-zero denominators instead of Infinity/NaN", () => {
    expect(marginOf(500, 0)).toBeNull();
    expect(netDebtToEbitda(100, 0)).toBeNull();
    expect(pctChange(100, 0)).toBeNull();
  });
});

describe("negative earnings", () => {
  it("P/E is null (not a negative multiple) when EPS is negative or zero", () => {
    expect(priceToEarnings(150, -2.5)).toBeNull();
    expect(priceToEarnings(150, 0)).toBeNull();
    expect(priceToEarnings(150, 5)).toBeCloseTo(30);
  });
});

describe("negative free cash flow", () => {
  it("FCF yield still returns a real (negative) number — that's meaningful information", () => {
    const fcf = freeCashFlow(-200, 50); // operating CF -200, capex 50 -> FCF -250
    expect(fcf).toBe(-250);
    expect(fcfYield(fcf, 10_000)).toBeCloseTo(-2.5);
  });

  it("Price/FCF is null when FCF is negative or zero — not a meaningless negative multiple", () => {
    expect(priceToFcf(10_000, -250)).toBeNull();
    expect(priceToFcf(10_000, 0)).toBeNull();
    expect(priceToFcf(10_000, 500)).toBe(20);
  });
});

describe("periods stay distinct", () => {
  it("CAGR requires a positive start and current value and positive year count", () => {
    expect(cagr(200, 100, 3)).not.toBeNull();
    expect(cagr(200, -100, 3)).toBeNull(); // negative base — CAGR undefined
    expect(cagr(200, 100, 0)).toBeNull();
  });
});
