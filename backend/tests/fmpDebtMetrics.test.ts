// ============================================================================
// Tests: calculations/fmpDebtMetrics.ts (Milestone 15C) — pure function,
// no I/O, no mocking.
// ============================================================================

import { describe, it, expect } from "vitest";
import { calculateFmpDebtMetrics, calculateFmpDebtMetricsForPeriod } from "../src/calculations/fmpDebtMetrics";
import type { FmpDebtMetricsPeriod } from "../src/providers/interfaces";

function period(overrides: Partial<FmpDebtMetricsPeriod> = {}): FmpDebtMetricsPeriod {
  return {
    periodEnd: "2026-01-25",
    totalDebt: 11_412_000_000,
    cashAndCashEquivalents: 10_605_000_000,
    totalStockholdersEquity: 157_293_000_000,
    operatingIncome: 130_387_000_000,
    depreciationAndAmortization: 2_843_000_000,
    ...overrides,
  };
}

describe("calculateFmpDebtMetricsForPeriod", () => {
  it("normal case: real NVDA-shaped values (Milestone 15C live probe)", () => {
    const result = calculateFmpDebtMetricsForPeriod(period());
    expect(result).not.toBeNull();
    expect(result!.totalDebt).toBe(11_412_000_000);
    expect(result!.netDebt).toBe(11_412_000_000 - 10_605_000_000);
    // EBITDA = operatingIncome + D&A — NEVER FMP's own ebitda field (see file header).
    expect(result!.ebitda).toBe(130_387_000_000 + 2_843_000_000);
    expect(result!.debtToEquity).toBeCloseTo(11_412_000_000 / 157_293_000_000, 10);
    expect(result!.netDebtToEbitda).toBeCloseTo((11_412_000_000 - 10_605_000_000) / (130_387_000_000 + 2_843_000_000), 10);
  });

  it("a net-cash position (cash > debt) is preserved as a real negative net_debt, never floored to zero", () => {
    const result = calculateFmpDebtMetricsForPeriod(period({ totalDebt: 1000, cashAndCashEquivalents: 5000 }));
    expect(result!.netDebt).toBe(-4000);
  });

  it("zero equity makes debtToEquity null, never a divide-by-zero or Infinity", () => {
    const result = calculateFmpDebtMetricsForPeriod(period({ totalStockholdersEquity: 0 }));
    expect(result!.debtToEquity).toBeNull();
    expect(Number.isFinite(result!.totalDebt)).toBe(true); // the rest of the result is still real
  });

  it("zero EBITDA makes netDebtToEbitda null, never a divide-by-zero or Infinity", () => {
    const result = calculateFmpDebtMetricsForPeriod(period({ operatingIncome: -2_843_000_000, depreciationAndAmortization: 2_843_000_000 }));
    expect(result!.ebitda).toBe(0);
    expect(result!.netDebtToEbitda).toBeNull();
  });

  it("any null field on the period returns null for the whole period — never a partial result", () => {
    expect(calculateFmpDebtMetricsForPeriod(period({ totalDebt: null }))).toBeNull();
    expect(calculateFmpDebtMetricsForPeriod(period({ cashAndCashEquivalents: null }))).toBeNull();
    expect(calculateFmpDebtMetricsForPeriod(period({ totalStockholdersEquity: null }))).toBeNull();
    expect(calculateFmpDebtMetricsForPeriod(period({ operatingIncome: null }))).toBeNull();
    expect(calculateFmpDebtMetricsForPeriod(period({ depreciationAndAmortization: null }))).toBeNull();
  });
});

describe("calculateFmpDebtMetrics — multi-period", () => {
  it("computes every period independently, preserving order", () => {
    const periods = [
      period({ periodEnd: "2026-01-25", totalDebt: 11_412_000_000 }),
      period({ periodEnd: "2025-01-26", totalDebt: 9_500_000_000 }),
    ];
    const results = calculateFmpDebtMetrics(periods);
    expect(results).toHaveLength(2);
    expect(results[0]!.periodEnd).toBe("2026-01-25");
    expect(results[1]!.periodEnd).toBe("2025-01-26");
  });

  it("a period with a null field is dropped, not fabricated, while other periods still compute", () => {
    const periods = [period({ periodEnd: "2026-01-25" }), period({ periodEnd: "2025-01-26", totalDebt: null })];
    const results = calculateFmpDebtMetrics(periods);
    expect(results).toHaveLength(1);
    expect(results[0]!.periodEnd).toBe("2026-01-25");
  });

  it("an empty period list returns an empty result list", () => {
    expect(calculateFmpDebtMetrics([])).toEqual([]);
  });
});
