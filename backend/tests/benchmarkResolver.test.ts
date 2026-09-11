// ============================================================================
// Tests: benchmark tier resolution (Milestone 5) — pure, no DB.
// Proves sector-first lookup, market-wide fallback, and explicit,
// never-ambiguous provenance.
// ============================================================================

import { describe, it, expect } from "vitest";
import { resolveBenchmarkTier } from "../src/scoring/benchmarkResolver";
import type { MetricBenchmark } from "../src/types/domain";

function makeBenchmark(overrides: Partial<MetricBenchmark> = {}): MetricBenchmark {
  return { metricName: "revenue_growth_yoy", periodEnd: "2026-06-30", p25: 5, median: 15, p75: 25, p90: 35, sampleSize: 10, ...overrides };
}

describe("resolveBenchmarkTier — correct provenance: SECTOR / MARKET_WIDE / UNAVAILABLE", () => {
  it("a sector benchmark, when present, is always preferred — SECTOR provenance", () => {
    const sector = makeBenchmark({ sector: "Technology", benchmarkType: "SECTOR" });
    const marketWide = makeBenchmark({ sector: undefined, benchmarkType: "MARKET_WIDE" });
    const result = resolveBenchmarkTier(sector, marketWide);
    expect(result.tier).toBe("SECTOR");
    expect(result.benchmark).toBe(sector);
  });

  it("market-wide fallback is used only when no sector benchmark exists — MARKET_WIDE provenance", () => {
    const marketWide = makeBenchmark({ sector: undefined, benchmarkType: "MARKET_WIDE" });
    const result = resolveBenchmarkTier(null, marketWide);
    expect(result.tier).toBe("MARKET_WIDE");
    expect(result.benchmark).toBe(marketWide);
  });

  it("neither present -> UNAVAILABLE, never an arbitrary/tiny fallback", () => {
    const result = resolveBenchmarkTier(null, null);
    expect(result.tier).toBe("UNAVAILABLE");
    expect(result.benchmark).toBeNull();
  });

  it("undefined (not just null) is treated the same as absent for both tiers", () => {
    expect(resolveBenchmarkTier(undefined, undefined).tier).toBe("UNAVAILABLE");
  });

  it("provenance is always explicit and distinguishable — never collapses SECTOR and MARKET_WIDE into one generic 'benchmarked' state", () => {
    const sectorResult = resolveBenchmarkTier(makeBenchmark({ sector: "Technology" }), makeBenchmark({ sector: undefined }));
    const marketResult = resolveBenchmarkTier(null, makeBenchmark({ sector: undefined }));
    expect(sectorResult.tier).not.toBe(marketResult.tier);
  });
});
