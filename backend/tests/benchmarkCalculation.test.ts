// ============================================================================
// Tests: benchmark calculation (Milestone 5) — pure, no DB.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  computeQuantiles,
  selectLatestPerCompanyAsOf,
  computeBenchmarkTiers,
  buildBenchmarkSnapshotKey,
  SECTOR_MIN_SAMPLE_SIZE,
  MARKET_WIDE_MIN_SAMPLE_SIZE,
  type CompanyMetricObservationWithSector,
} from "../src/scoring/benchmarkCalculation";

function makeSectorObservations(sector: string, count: number, startValue = 10): CompanyMetricObservationWithSector[] {
  return Array.from({ length: count }, (_, i) => ({
    companyId: `${sector}-co-${i}`,
    periodEnd: "2026-01-01",
    value: startValue + i,
    sector,
  }));
}

describe("computeQuantiles — no outlier treatment", () => {
  it("computes p25/median/p75/p90 via linear interpolation over real values", () => {
    const q = computeQuantiles([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(q.median).toBeCloseTo(55, 5);
    expect(q.p25).toBeCloseTo(32.5, 5);
    expect(q.p75).toBeCloseTo(77.5, 5);
  });

  it("an extreme value is NOT removed or capped — it participates fully in p90", () => {
    const withoutOutlier = computeQuantiles([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    const withOutlier = computeQuantiles([10, 11, 12, 13, 14, 15, 16, 17, 18, 100_000]);
    // p90 must reflect the real extreme value, not exclude/cap it
    expect(withOutlier.p90).toBeGreaterThan(withoutOutlier.p90 * 100);
  });

  it("is deterministic — identical input always produces identical output (reproducibility)", () => {
    const values = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
    expect(computeQuantiles(values)).toEqual(computeQuantiles([...values]));
  });
});

describe("selectLatestPerCompanyAsOf — fiscal year-end alignment (decision 9)", () => {
  it("companies with different fiscal year-ends each contribute their own latest period, never a shared one", () => {
    const observations = [
      { companyId: "A", periodEnd: "2026-01-25", value: 1 }, // A: late-Jan fiscal year end
      { companyId: "A", periodEnd: "2025-01-26", value: 2 },
      { companyId: "B", periodEnd: "2025-12-31", value: 3 }, // B: calendar fiscal year end
      { companyId: "B", periodEnd: "2024-12-31", value: 4 },
    ];
    const result = selectLatestPerCompanyAsOf(observations, "2026-06-30");
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.companyId === "A")!.value).toBe(1);
    expect(result.find((r) => r.companyId === "B")!.value).toBe(3);
  });

  it("a period after the as-of date is excluded, not treated as available early", () => {
    const observations = [
      { companyId: "A", periodEnd: "2026-01-25", value: 1 },
      { companyId: "A", periodEnd: "2025-01-26", value: 2 },
    ];
    const result = selectLatestPerCompanyAsOf(observations, "2025-06-01");
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(2); // only the 2025-01-26 period was available as of 2025-06-01
  });

  it("a company with no period at or before as-of contributes nothing", () => {
    const observations = [{ companyId: "A", periodEnd: "2026-01-25", value: 1 }];
    const result = selectLatestPerCompanyAsOf(observations, "2020-01-01");
    expect(result).toHaveLength(0);
  });
});

describe("computeBenchmarkTiers — sector threshold (>= 10)", () => {
  it("a sector with exactly the minimum sample size gets a SECTOR benchmark", () => {
    const obs = makeSectorObservations("Technology", SECTOR_MIN_SAMPLE_SIZE);
    const result = computeBenchmarkTiers(obs);
    expect(result.sectorBenchmarks).toHaveLength(1);
    expect(result.sectorBenchmarks[0]!.sector).toBe("Technology");
    expect(result.sectorBenchmarks[0]!.sampleSize).toBe(SECTOR_MIN_SAMPLE_SIZE);
  });

  it("a sector one below the minimum gets no SECTOR benchmark", () => {
    const obs = makeSectorObservations("Technology", SECTOR_MIN_SAMPLE_SIZE - 1);
    const result = computeBenchmarkTiers(obs);
    expect(result.sectorBenchmarks).toHaveLength(0);
  });
});

describe("computeBenchmarkTiers — market-wide fallback (>= 30) when sector under threshold", () => {
  it("a sector under 10, but the total across sectors >= 30, gets a MARKET_WIDE benchmark and no SECTOR benchmark for that sector", () => {
    const thin = makeSectorObservations("Healthcare", 4); // under 10
    const other = makeSectorObservations("Technology", 26); // pads the market-wide total to 30
    const result = computeBenchmarkTiers([...thin, ...other]);
    expect(result.sectorBenchmarks.some((s) => s.sector === "Healthcare")).toBe(false);
    expect(result.marketWideBenchmark).not.toBeNull();
    expect(result.marketWideBenchmark!.sampleSize).toBe(MARKET_WIDE_MIN_SAMPLE_SIZE);
  });

  it("Technology clears SECTOR (26 >= 10) at the same time Healthcare would need MARKET_WIDE — both computed independently in one pass", () => {
    const healthcare = makeSectorObservations("Healthcare", 4);
    const tech = makeSectorObservations("Technology", 26);
    const result = computeBenchmarkTiers([...healthcare, ...tech]);
    expect(result.sectorBenchmarks.map((s) => s.sector)).toEqual(["Technology"]);
    expect(result.marketWideBenchmark!.sampleSize).toBe(30);
  });
});

describe("computeBenchmarkTiers — UNAVAILABLE when neither threshold is met", () => {
  it("too few companies for both SECTOR and MARKET_WIDE produces neither", () => {
    const obs = makeSectorObservations("Technology", 1); // today's real NVDA-only state
    const result = computeBenchmarkTiers(obs);
    expect(result.sectorBenchmarks).toHaveLength(0);
    expect(result.marketWideBenchmark).toBeNull();
  });

  it("never falls back to an arbitrary/tiny sample — 29 companies (one short) still yields no MARKET_WIDE benchmark", () => {
    const obs = makeSectorObservations("Technology", 29);
    const result = computeBenchmarkTiers(obs);
    expect(result.marketWideBenchmark).toBeNull();
  });
});

describe("computeBenchmarkTiers — metric-specific sample sizes (decision 2)", () => {
  it("the same sector can independently qualify for one metric and not another (verified by calling twice with different real observation sets)", () => {
    // revenue_growth_yoy: 10 companies have it
    const revenueGrowthObs = makeSectorObservations("Technology", 10);
    // eps_cagr: only 6 of those companies have a valid (positive-endpoint) value
    const epsCagrObs = makeSectorObservations("Technology", 6);

    const revenueResult = computeBenchmarkTiers(revenueGrowthObs);
    const epsResult = computeBenchmarkTiers(epsCagrObs);

    expect(revenueResult.sectorBenchmarks).toHaveLength(1); // qualifies
    expect(epsResult.sectorBenchmarks).toHaveLength(0); // does not — independently, same sector
  });
});

describe("computeBenchmarkTiers — NULL/unavailable metrics excluded", () => {
  it("a company that never appears in the observation set (because its metric was unavailable) is correctly absent, not counted as zero", () => {
    // Only 9 real observations exist; a 10th company's metric was unavailable
    // and therefore never produced a calculated_metrics row at all — it must
    // not be silently padded in.
    const obs = makeSectorObservations("Technology", 9);
    const result = computeBenchmarkTiers(obs);
    expect(result.sectorBenchmarks).toHaveLength(0); // 9 < 10, correctly short
  });
});

describe("buildBenchmarkSnapshotKey — versioning and reproducibility", () => {
  const base = { metricName: "revenue_growth_yoy", benchmarkType: "SECTOR" as const, sector: "Technology", periodEnd: "2026-06-30", benchmarkVersion: "v1.0" };

  it("identical snapshot parameters produce an identical key (idempotent re-run)", () => {
    expect(buildBenchmarkSnapshotKey(base)).toBe(buildBenchmarkSnapshotKey({ ...base }));
  });

  it("a different benchmark_version produces a distinct key — old snapshot is never silently overwritten", () => {
    expect(buildBenchmarkSnapshotKey(base)).not.toBe(buildBenchmarkSnapshotKey({ ...base, benchmarkVersion: "v1.1" }));
  });

  it("a different period_end (data refresh) produces a distinct key", () => {
    expect(buildBenchmarkSnapshotKey(base)).not.toBe(buildBenchmarkSnapshotKey({ ...base, periodEnd: "2026-09-30" }));
  });

  it("two MARKET_WIDE rows (both sector=null) for the same metric/period/version DO collide — proving why benchmark_type must be in the key, not sector alone", () => {
    const marketA = buildBenchmarkSnapshotKey({ ...base, benchmarkType: "MARKET_WIDE", sector: null });
    const marketB = buildBenchmarkSnapshotKey({ ...base, benchmarkType: "MARKET_WIDE", sector: null });
    expect(marketA).toBe(marketB);
  });

  it("a SECTOR row and a MARKET_WIDE row for the same metric/period/version never collide", () => {
    const sectorKey = buildBenchmarkSnapshotKey(base);
    const marketKey = buildBenchmarkSnapshotKey({ ...base, benchmarkType: "MARKET_WIDE", sector: null });
    expect(sectorKey).not.toBe(marketKey);
  });
});
