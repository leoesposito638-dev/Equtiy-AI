// ============================================================================
// Tests: calculations/forwardEps.ts (Milestone 13H) — pure functions, no
// I/O, no mocking needed. Fixtures use the ACTUAL field values observed
// live against FMP in the Milestone 13G audit (NVDA, GOOGL, AMZN, CVX,
// PFE, JPM), not invented numbers, so these tests double as a record of
// the real data shapes the selection algorithm must handle correctly.
// ============================================================================

import { describe, it, expect } from "vitest";
import { selectForwardEps, forwardPe, MIN_ANALYST_COUNT } from "../src/calculations/forwardEps";
import type { EstimateRecord } from "../src/providers/interfaces";

function est(periodEnd: string, consensusValue: number | null, analystCount: number | null): EstimateRecord {
  return { metricName: "eps", estimatePeriodEnd: periodEnd, estimatePeriodType: "ANNUAL", consensusValue, analystCount };
}

// Real NVDA analyst-estimates rows, Milestone 13G Part B (out of API order —
// FMP returns newest-first, oldest-last).
const NVDA_ESTIMATES: EstimateRecord[] = [
  est("2031-01-25", 20, 17),
  est("2030-01-25", 23, 10),
  est("2029-01-25", 21.25901, 19),
  est("2028-01-25", 15.69607, 32),
  est("2027-01-25", 9.25503, 31),
  est("2026-01-25", 4.69388, 30), // already reported (our DB's latest reported period_end)
  est("2025-01-26", 2.95192, 33),
  est("2024-01-28", 1.23926, 28),
];

// Real GOOGL rows — the exact spike-then-reversal pattern the 13G audit flagged.
const GOOGL_ESTIMATES: EstimateRecord[] = [
  est("2030-12-31", 25.05167, 25),
  est("2029-12-31", 21.17045, 24),
  est("2028-12-31", 17.86833, 33),
  est("2027-12-31", 15.08363, 42),
  est("2026-12-31", 20.56945, 41), // spike above 2025's 10.63583, then FY2027 is lower
  est("2025-12-31", 10.63583, 37), // already reported
  est("2024-12-31", 8.01804, 38),
  est("2023-12-31", 5.74475, 32),
];

// Real PFE rows — a genuine, smooth multi-year decline (patent cliff), NOT a
// spike-then-reversal — must NOT be rejected by the plausibility guard even
// though FY2027 < FY2026 < FY2025.
const PFE_ESTIMATES: EstimateRecord[] = [
  est("2030-12-31", 2.43872, 5),
  est("2029-12-31", 2.3575, 5),
  est("2028-12-31", 2.48634, 8),
  est("2027-12-31", 2.89675, 14),
  est("2026-12-31", 2.97467, 14), // NOT above 2025's 3.11949 -> guard cannot fire
  est("2025-12-31", 3.11949, 17), // already reported
];

// Real JPM rows — the selected year (2026) has a low analyst count (9) but
// still clears MIN_ANALYST_COUNT, and the guard's "spike" condition is true
// (24.81534 > 20.19756) but the "reversal" condition is false (2027's
// 25.16339 is HIGHER, not lower) -> must remain available.
const JPM_ESTIMATES: EstimateRecord[] = [
  est("2028-12-31", 27.2521, 8),
  est("2027-12-31", 25.16339, 11),
  est("2026-12-31", 24.81534, 9),
  est("2025-12-31", 20.19756, 4), // already reported
  est("2024-12-31", 18.58794, 12),
];

describe("selectForwardEps — next-unreported-year selection", () => {
  it("selects the first FUTURE fiscal year, not the first API row (NVDA: row[0] is 2031, correct answer is 2027)", () => {
    const result = selectForwardEps(NVDA_ESTIMATES, "2026-01-25");
    expect(result.status).toBe("available");
    expect(result.periodEnd).toBe("2027-01-25");
    expect(result.forwardEps).toBe(9.25503);
    expect(result.analystCount).toBe(31);
  });

  it("excludes the already-reported year even though it looks like a plausible estimate (NVDA 2026 row: epsAvg=4.69388, 30 analysts)", () => {
    const result = selectForwardEps(NVDA_ESTIMATES, "2026-01-25");
    expect(result.forwardEps).not.toBe(4.69388);
  });

  it("row order does not affect the result — shuffled input selects the same row", () => {
    const shuffled = [...NVDA_ESTIMATES].reverse();
    const result = selectForwardEps(shuffled, "2026-01-25");
    expect(result.periodEnd).toBe("2027-01-25");
    expect(result.forwardEps).toBe(9.25503);
  });

  it("selects the smallest remaining future date when many future years exist", () => {
    const result = selectForwardEps(NVDA_ESTIMATES, "2024-01-28");
    // Every year from 2025-01-26 onward is "future" relative to 2024-01-28;
    // the correct pick is the soonest one, 2025-01-26.
    expect(result.periodEnd).toBe("2025-01-26");
  });

  it("returns unavailable when no estimate row exists after the latest reported period", () => {
    const result = selectForwardEps(NVDA_ESTIMATES, "2031-01-25");
    expect(result.status).toBe("unavailable");
    expect(result.forwardEps).toBeNull();
    expect(result.unavailableReason).toContain("No FMP analyst-estimate row");
  });
});

describe("selectForwardEps — rejection rules (no fallback to another year)", () => {
  it("null epsAvg on the selected row -> unavailable, not skipped to the next row", () => {
    const estimates = [est("2026-01-25", 4.69388, 30), est("2027-01-25", null, 31), est("2028-01-25", 15.69607, 32)];
    const result = selectForwardEps(estimates, "2026-01-25");
    expect(result.status).toBe("unavailable");
    expect(result.forwardEps).toBeNull();
    expect(result.periodEnd).toBeNull();
    expect(result.unavailableReason).toContain("no epsAvg");
  });

  it("epsAvg <= 0 on the selected row -> unavailable (real case: INTC FY2024 was -0.14244)", () => {
    const estimates = [est("2025-12-27", 0.34468, 30), est("2026-12-27", -0.14244, 24), est("2027-12-27", 2.07689, 28)];
    const result = selectForwardEps(estimates, "2025-12-27");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("epsAvg <= 0");
  });

  it("epsAvg === 0 on the selected row -> unavailable, never divides by zero downstream", () => {
    const estimates = [est("2025-12-31", 3.0, 20), est("2026-12-31", 0, 25)];
    const result = selectForwardEps(estimates, "2025-12-31");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("epsAvg <= 0");
  });

  it(`analystCount below MIN_ANALYST_COUNT (${MIN_ANALYST_COUNT}) on the selected row -> unavailable (real case: JNJ-shaped thin coverage)`, () => {
    const estimates = [est("2025-12-28", 10.80287, 17), est("2026-12-28", 11.58379, 2), est("2027-12-28", 12.77494, 4)];
    const result = selectForwardEps(estimates, "2025-12-28");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("fewer than 3 analysts");
  });

  it("null analystCount on the selected row -> unavailable", () => {
    const estimates = [est("2025-12-31", 3.0, 20), est("2026-12-31", 3.5, null)];
    const result = selectForwardEps(estimates, "2025-12-31");
    expect(result.status).toBe("unavailable");
  });

  it("real JNJ case: analystCount of exactly 4 (>= MIN_ANALYST_COUNT of 3) IS usable, and analystCount is preserved for the caller", () => {
    const estimates = [est("2025-12-28", 10.80287, 17), est("2026-12-28", 11.58379, 4), est("2027-12-28", 12.77494, 4)];
    const result = selectForwardEps(estimates, "2025-12-28");
    expect(result.status).toBe("available");
    expect(result.forwardEps).toBe(11.58379);
    expect(result.analystCount).toBe(4);
  });

  it("rejection never falls back to a later future year — a low-analyst-count 2026 does not fall through to a usable 2027", () => {
    const estimates = [
      est("2025-12-31", 3.0, 20),
      est("2026-12-31", 3.5, 1), // rejected: below MIN_ANALYST_COUNT
      est("2027-12-31", 4.0, 25), // would otherwise be perfectly usable
    ];
    const result = selectForwardEps(estimates, "2025-12-31");
    expect(result.status).toBe("unavailable");
    expect(result.forwardEps).toBeNull();
    expect(result.periodEnd).toBeNull();
  });
});

describe("selectForwardEps — GOOGL/AMZN/CVX non-monotonic plausibility guard", () => {
  it("GOOGL: rejects the selected FY2026 estimate (spikes above FY2025, then FY2027 is lower) — never corrected or averaged", () => {
    const result = selectForwardEps(GOOGL_ESTIMATES, "2025-12-31");
    expect(result.status).toBe("unavailable");
    expect(result.forwardEps).toBeNull(); // never smoothed to some other number
    expect(result.unavailableReason).toContain("non-monotonic");
  });

  it("AMZN: same spike-then-reversal pattern is rejected", () => {
    const estimates = [
      est("2030-12-31", 19.97273, 19),
      est("2029-12-31", 16.27367, 14),
      est("2028-12-31", 13.86008, 30),
      est("2027-12-31", 10.62079, 41),
      est("2026-12-31", 12.71413, 39),
      est("2025-12-31", 7.15268, 37),
    ];
    const result = selectForwardEps(estimates, "2025-12-31");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("non-monotonic");
  });

  it("CVX: same spike-then-reversal pattern is rejected", () => {
    const estimates = [
      est("2030-12-31", 13.918, 5),
      est("2029-12-31", 12.97167, 5),
      est("2028-12-31", 12.67079, 8),
      est("2027-12-31", 13.27202, 15),
      est("2026-12-31", 16.07915, 14),
      est("2025-12-31", 7.14434, 15),
    ];
    const result = selectForwardEps(estimates, "2025-12-31");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("non-monotonic");
  });

  it("PFE: a genuine smooth multi-year decline is NOT flagged (guard requires a spike above the latest reported year, which never happens here)", () => {
    const result = selectForwardEps(PFE_ESTIMATES, "2025-12-31");
    expect(result.status).toBe("available");
    expect(result.forwardEps).toBe(2.97467);
    expect(result.periodEnd).toBe("2026-12-31");
  });

  it("JPM: a spike above the latest reported year that keeps RISING afterward is NOT flagged", () => {
    const result = selectForwardEps(JPM_ESTIMATES, "2025-12-31");
    expect(result.status).toBe("available");
    expect(result.forwardEps).toBe(24.81534);
    expect(result.periodEnd).toBe("2026-12-31");
  });

  it("NVDA: hypergrowth that keeps rising after the selected year is NOT flagged", () => {
    const result = selectForwardEps(NVDA_ESTIMATES, "2026-01-25");
    expect(result.status).toBe("available");
    expect(result.forwardEps).toBe(9.25503);
  });

  it("guard does not fire when there is no further future row to compare against", () => {
    const estimates = [est("2025-12-31", 5.0, 20), est("2026-12-31", 50.0, 25)]; // huge spike, but no FY2027 row exists
    const result = selectForwardEps(estimates, "2025-12-31");
    expect(result.status).toBe("available");
    expect(result.forwardEps).toBe(50.0);
  });

  it("guard does not fire when the latest-reported row itself is absent from the payload", () => {
    const estimates = [est("2026-12-31", 50.0, 25), est("2027-12-31", 10.0, 25)]; // no 2025 row present at all
    const result = selectForwardEps(estimates, "2025-12-31");
    expect(result.status).toBe("available");
    expect(result.forwardEps).toBe(50.0);
  });
});

describe("forwardPe — the formula itself", () => {
  it("computes price / forwardEps for valid inputs", () => {
    expect(forwardPe(218.73, 9.25503)).toBeCloseTo(218.73 / 9.25503, 6);
  });

  it("returns null, never a value, when price is null", () => {
    expect(forwardPe(null, 9.25503)).toBeNull();
  });

  it("returns null when forwardEps is null", () => {
    expect(forwardPe(218.73, null)).toBeNull();
  });

  it("returns null when forwardEps is exactly 0 — never Infinity", () => {
    const result = forwardPe(218.73, 0);
    expect(result).toBeNull();
    expect(result).not.toBe(Infinity);
  });

  it("returns null when forwardEps is negative — never a fabricated negative P/E", () => {
    expect(forwardPe(218.73, -1.5)).toBeNull();
  });

  it("returns null when price is 0 or negative (invalid) — never zero, never fabricated", () => {
    expect(forwardPe(0, 9.25503)).toBeNull();
    expect(forwardPe(-10, 9.25503)).toBeNull();
  });

  it("returns null for non-finite price/eps (NaN, Infinity)", () => {
    expect(forwardPe(NaN, 9.25503)).toBeNull();
    expect(forwardPe(Infinity, 9.25503)).toBeNull();
    expect(forwardPe(218.73, NaN)).toBeNull();
  });
});
