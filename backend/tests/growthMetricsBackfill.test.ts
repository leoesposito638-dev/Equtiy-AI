// ============================================================================
// Tests: GROWTH metrics backfill window derivation (Milestone 4A)
// Pure — no DB. Proves exactly which past periods are legitimately
// backfillable from real observations, and that duplicate-safety works.
// ============================================================================

import { describe, it, expect } from "vitest";
import { computeBackfillCandidates, filterAlreadyStored, type PeriodObservation } from "../src/calculations/growthMetricsBackfill";

// Real NVDA figures used throughout this project's real-data milestones,
// most-recent-first (matches the DB query order this function expects).
const NVDA_REVENUE: PeriodObservation[] = [
  { id: "rev-2026", periodEnd: "2026-01-25", value: 215_938_000_000 },
  { id: "rev-2025", periodEnd: "2025-01-26", value: 130_497_000_000 },
  { id: "rev-2024", periodEnd: "2024-01-28", value: 60_922_000_000 },
  { id: "rev-2023", periodEnd: "2023-01-29", value: 26_974_000_000 },
];
const NVDA_EPS: PeriodObservation[] = [
  { id: "eps-2026", periodEnd: "2026-01-25", value: 4.93 },
  { id: "eps-2025", periodEnd: "2025-01-26", value: 2.97 },
  { id: "eps-2024", periodEnd: "2024-01-28", value: 1.21 },
  { id: "eps-2023", periodEnd: "2023-01-29", value: 0.18 },
];

describe("computeBackfillCandidates — with exactly 4 real annual periods (NVDA's actual depth)", () => {
  const candidates = computeBackfillCandidates(NVDA_REVENUE, NVDA_EPS);

  it("revenue_growth_yoy: backfillable at every consecutive pair (3 total, incl. the already-existing 2026 one)", () => {
    const rows = candidates.filter((c) => c.metricName === "revenue_growth_yoy");
    expect(rows.map((r) => r.periodEnd).sort()).toEqual(["2024-01-28", "2025-01-26", "2026-01-25"]);
  });

  it("eps_growth_yoy: backfillable at every consecutive pair (3 total)", () => {
    const rows = candidates.filter((c) => c.metricName === "eps_growth_yoy");
    expect(rows.map((r) => r.periodEnd).sort()).toEqual(["2024-01-28", "2025-01-26", "2026-01-25"]);
  });

  it("revenue_cagr_3y: only ONE window possible — a full 4-consecutive-period span doesn't fit twice in only 4 real periods", () => {
    const rows = candidates.filter((c) => c.metricName === "revenue_cagr_3y");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.periodEnd).toBe("2026-01-25");
  });

  it("eps_cagr: only ONE window possible, same reason", () => {
    const rows = candidates.filter((c) => c.metricName === "eps_cagr");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.periodEnd).toBe("2026-01-25");
  });

  it("growth_acceleration: only ONE window possible, same reason", () => {
    const rows = candidates.filter((c) => c.metricName === "growth_acceleration");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.periodEnd).toBe("2026-01-25");
  });

  it("every candidate's sourceObservationIds trace back to real observation ids, never fabricated", () => {
    for (const c of candidates) {
      expect(c.sourceObservationIds.length).toBeGreaterThan(0);
      for (const id of c.sourceObservationIds) {
        expect(id.startsWith("rev-") || id.startsWith("eps-")).toBe(true);
      }
    }
  });
});

describe("computeBackfillCandidates — with 5+ periods, multiple CAGR/acceleration windows become legitimately possible", () => {
  const fiveRevenue: PeriodObservation[] = [
    { id: "r5", periodEnd: "2027-01-01", value: 300 },
    ...NVDA_REVENUE,
  ];

  it("revenue_cagr_3y now has 2 legitimate windows, not fabricated — both fully backed by real periods", () => {
    const rows = computeBackfillCandidates(fiveRevenue, NVDA_EPS).filter((c) => c.metricName === "revenue_cagr_3y");
    expect(rows.map((r) => r.periodEnd).sort()).toEqual(["2026-01-25", "2027-01-01"]);
  });
});

describe("computeBackfillCandidates — unavailable/null handling, no fabrication", () => {
  it("eps_growth_yoy is correctly skipped for a window where EPS is negative (V1 rule)", () => {
    const eps: PeriodObservation[] = [
      { id: "e1", periodEnd: "2026-01-25", value: 2 },
      { id: "e2", periodEnd: "2025-01-26", value: -1 }, // negative
      { id: "e3", periodEnd: "2024-01-28", value: 3 },
    ];
    const rows = computeBackfillCandidates(NVDA_REVENUE, eps).filter((c) => c.metricName === "eps_growth_yoy");
    // Only the 2024-vs-2025... wait: window (2026,-1) is skipped (negative previous);
    // window (2025=-1, 2024=3) is also skipped (negative current). So zero candidates.
    expect(rows).toHaveLength(0);
  });

  it("a missing (null) period breaks only the windows that touch it, not the whole series", () => {
    const revenueWithGap: PeriodObservation[] = [
      { id: "r1", periodEnd: "2026-01-25", value: 200 },
      { id: "r2", periodEnd: "2025-01-26", value: null }, // missing
      { id: "r3", periodEnd: "2024-01-28", value: 100 },
    ];
    const rows = computeBackfillCandidates(revenueWithGap, []).filter((c) => c.metricName === "revenue_growth_yoy");
    // (2026 vs 2025) and (2025 vs 2024) both touch the null period -> unavailable.
    expect(rows).toHaveLength(0);
  });

  it("fewer than 4 periods: zero CAGR/acceleration candidates, never a partial/guessed one", () => {
    const threeRevenue = NVDA_REVENUE.slice(0, 3);
    const rows = computeBackfillCandidates(threeRevenue, []).filter(
      (c) => c.metricName === "revenue_cagr_3y" || c.metricName === "growth_acceleration"
    );
    expect(rows).toHaveLength(0);
  });
});

describe("filterAlreadyStored — duplicate-safe backfill", () => {
  it("removes candidates whose (metric, period_end) key already exists", () => {
    const candidates = computeBackfillCandidates(NVDA_REVENUE, NVDA_EPS);
    const existing = new Set(["revenue_growth_yoy|2026-01-25", "eps_cagr|2026-01-25"]);
    const remaining = filterAlreadyStored(candidates, existing);
    expect(remaining.some((c) => c.metricName === "revenue_growth_yoy" && c.periodEnd === "2026-01-25")).toBe(false);
    expect(remaining.some((c) => c.metricName === "eps_cagr" && c.periodEnd === "2026-01-25")).toBe(false);
    // everything else survives
    expect(remaining.length).toBe(candidates.length - 2);
  });

  it("running the same filter twice with the same existing-keys set is idempotent (no new candidates appear)", () => {
    const candidates = computeBackfillCandidates(NVDA_REVENUE, NVDA_EPS);
    const existing = new Set(candidates.map((c) => `${c.metricName}|${c.periodEnd}`));
    const remaining = filterAlreadyStored(candidates, existing);
    expect(remaining).toHaveLength(0);
  });

  it("an empty existing-keys set filters out nothing", () => {
    const candidates = computeBackfillCandidates(NVDA_REVENUE, NVDA_EPS);
    const remaining = filterAlreadyStored(candidates, new Set());
    expect(remaining).toHaveLength(candidates.length);
  });
});
