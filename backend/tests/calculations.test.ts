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
  roic,
  effectiveTaxRate,
  investedCapital,
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

// Milestone 13E — ROIC / effective tax rate / invested capital.
describe("effectiveTaxRate — Milestone 13E edge cases (no invented clipping)", () => {
  it("returns null, not 0, when an input is missing", () => {
    expect(effectiveTaxRate(null, 1000)).toBeNull();
    expect(effectiveTaxRate(200, null)).toBeNull();
  });

  it("returns null on a zero pretax-income denominator", () => {
    expect(effectiveTaxRate(200, 0)).toBeNull();
  });

  it("computes a normal positive rate as a fraction, not a percentage", () => {
    expect(effectiveTaxRate(210, 1000)).toBeCloseTo(0.21);
  });

  it("preserves a negative rate when tax expense is negative (a real tax benefit) — never clips to 0", () => {
    expect(effectiveTaxRate(-242, 1000)).toBeCloseTo(-0.242);
  });

  it("computes through negative pretax income — real, not nulled", () => {
    expect(effectiveTaxRate(50, -1000)).toBeCloseTo(-0.05);
  });

  it("preserves a rate above 1 (100%) when real — never caps it", () => {
    expect(effectiveTaxRate(1531, 1557)).toBeCloseTo(0.9833, 3);
    expect(effectiveTaxRate(2000, 1000)).toBe(2); // 200% — real, not capped
  });
});

describe("investedCapital — Milestone 13E (Total Assets − Current Liabilities − Cash)", () => {
  it("returns null, not 0, when a component is missing", () => {
    expect(investedCapital(null, 100, 50)).toBeNull();
    expect(investedCapital(1000, null, 50)).toBeNull();
    expect(investedCapital(1000, 100, null)).toBeNull();
  });

  it("computes a normal positive value", () => {
    expect(investedCapital(1000, 200, 100)).toBe(700);
  });

  it("preserves a negative result — never fabricated or floored to zero", () => {
    expect(investedCapital(100, 500, 100)).toBe(-500);
  });

  it("preserves a zero result as a real 0 (roic() itself is what nulls on a zero invested capital, not this function)", () => {
    expect(investedCapital(500, 300, 200)).toBe(0);
  });
});

describe("roic() — existing Milestone 12B formula, unmodified (Milestone 13E just wires real inputs into it)", () => {
  it("returns null, not 0, when any input is missing", () => {
    expect(roic(null, 0.21, 1000)).toBeNull();
    expect(roic(500, null, 1000)).toBeNull();
    expect(roic(500, 0.21, null)).toBeNull();
  });

  it("returns null on a zero invested capital", () => {
    expect(roic(500, 0.21, 0)).toBeNull();
  });

  it("computes a normal positive ROIC", () => {
    expect(roic(1000, 0.2, 5000)).toBeCloseTo(16); // NOPAT=800, /5000*100=16
  });

  it("preserves a negative ROIC when invested capital is negative — never fabricated or floored", () => {
    expect(roic(1000, 0.2, -5000)).toBeCloseTo(-16);
  });

  it("preserves a negative ROIC when operating income is negative", () => {
    expect(roic(-1000, 0.2, 5000)).toBeCloseTo(-16);
  });

  it("computes through an extreme (>100%) effective tax rate without capping", () => {
    expect(roic(1000, 2, 5000)).toBeCloseTo(-20); // (1-2)=-1 -> NOPAT=-1000
  });
});
