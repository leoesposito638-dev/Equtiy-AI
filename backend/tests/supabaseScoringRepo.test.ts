// ============================================================================
// Tests: supabaseScoringRepo.getBenchmarks — SECTOR/MARKET_WIDE tier
// resolution (Milestone 10C-FIX). Mocks the Supabase client so no real
// network/database call happens; the fake query builder mirrors exactly the
// two-query shape getBenchmarks now issues (.eq("sector", X) for the sector
// tier, .is("sector", null) for the market-wide tier).
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

function dbRow(overrides: Partial<{ metric_name: string; sector: string | null; industry: string | null; period_end: string; p25: number; median: number; p75: number; p90: number; sample_size: number }> = {}) {
  return {
    metric_name: "revenue_growth_yoy",
    sector: null,
    industry: null,
    period_end: "2026-09-01",
    p25: 1,
    median: 2,
    p75: 3,
    p90: 4,
    sample_size: 30,
    ...overrides,
  };
}

/** Fake Supabase client matching the exact chain getBenchmarks uses:
 *  db.from(table).select("*").in("metric_name", names).eq("sector", x)
 *  db.from(table).select("*").in("metric_name", names).is("sector", null)
 *  `eq` always answers the sector-tier query; `is` always answers the
 *  market-wide-tier query (this file's getBenchmarks never calls .eq for
 *  anything other than sector, nor .is for anything other than sector). */
function fakeDb(sectorRows: unknown[], marketWideRows: unknown[]) {
  const builder = {
    select: () => builder,
    in: () => builder,
    eq: async () => ({ data: sectorRows, error: null }),
    is: async () => ({ data: marketWideRows, error: null }),
  };
  return { from: () => builder };
}

beforeEach(() => {
  vi.resetAllMocks();
});

async function buildRepoWith(sectorRows: unknown[], marketWideRows: unknown[]) {
  dbClientMock.getDbClient.mockReturnValue(fakeDb(sectorRows, marketWideRows));
  const { buildSupabaseScoringRepo } = await import("../src/scoring/supabaseScoringRepo");
  return buildSupabaseScoringRepo();
}

describe("supabaseScoringRepo.getBenchmarks — tier resolution", () => {
  it("1: selects SECTOR when a sector benchmark exists", async () => {
    const repo = await buildRepoWith(
      [dbRow({ sector: "Technology", median: 99 })],
      [dbRow({ sector: null, median: 1 })]
    );
    const result = await repo.getBenchmarks("Technology", ["revenue_growth_yoy"]);
    expect(result.get("revenue_growth_yoy")?.median).toBe(99);
    expect(result.get("revenue_growth_yoy")?.sector).toBe("Technology");
  });

  it("2: falls back to MARKET_WIDE when no sector benchmark exists", async () => {
    const repo = await buildRepoWith([], [dbRow({ sector: null, median: 42 })]);
    const result = await repo.getBenchmarks("Technology", ["revenue_growth_yoy"]);
    expect(result.get("revenue_growth_yoy")?.median).toBe(42);
  });

  it("3: metric has no benchmark when neither tier exists", async () => {
    const repo = await buildRepoWith([], []);
    const result = await repo.getBenchmarks("Technology", ["revenue_growth_yoy"]);
    expect(result.has("revenue_growth_yoy")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("4: MARKET_WIDE rows (sector=NULL in the DB) are returned correctly, with sector mapped to undefined", async () => {
    const repo = await buildRepoWith([], [dbRow({ sector: null, median: 7, sample_size: 30 })]);
    const result = await repo.getBenchmarks("Healthcare", ["revenue_growth_yoy"]);
    const benchmark = result.get("revenue_growth_yoy");
    expect(benchmark?.median).toBe(7);
    expect(benchmark?.sector).toBeUndefined();
    expect(benchmark?.sampleSize).toBe(30);
  });

  it("5: multiple requested metrics resolve independently", async () => {
    const repo = await buildRepoWith(
      [dbRow({ metric_name: "revenue_growth_yoy", sector: "Technology", median: 10 })],
      [
        dbRow({ metric_name: "revenue_growth_yoy", sector: null, median: 1 }), // sector wins for this one
        dbRow({ metric_name: "eps_growth_yoy", sector: null, median: 5 }), // only market-wide for this one
        // eps_cagr: no row in either tier
      ]
    );
    const result = await repo.getBenchmarks("Technology", ["revenue_growth_yoy", "eps_growth_yoy", "eps_cagr"]);
    expect(result.get("revenue_growth_yoy")?.median).toBe(10); // SECTOR, not the market-wide 1
    expect(result.get("eps_growth_yoy")?.median).toBe(5); // MARKET_WIDE fallback
    expect(result.has("eps_cagr")).toBe(false); // neither tier -> no benchmark
    expect(result.size).toBe(2);
  });

  it("6: benchmarkResolver's own tier-priority behavior is unchanged (sanity check)", async () => {
    const { resolveBenchmarkTier } = await import("../src/scoring/benchmarkResolver");
    const sector = { metricName: "x", periodEnd: "2026-09-01", p25: 1, median: 2, p75: 3, p90: 4, sampleSize: 10 };
    const marketWide = { metricName: "x", periodEnd: "2026-09-01", p25: 5, median: 6, p75: 7, p90: 8, sampleSize: 30 };
    expect(resolveBenchmarkTier(sector, marketWide).tier).toBe("SECTOR");
    expect(resolveBenchmarkTier(null, marketWide).tier).toBe("MARKET_WIDE");
    expect(resolveBenchmarkTier(null, null).tier).toBe("UNAVAILABLE");
  });

  it("still returns an empty map when no metrics are requested (unchanged defensive check)", async () => {
    const repo = await buildRepoWith([], []);
    const result = await repo.getBenchmarks("Technology", []);
    expect(result.size).toBe(0);
  });

  it("falls back to market-wide-only when the company has no sector at all", async () => {
    const repo = await buildRepoWith([], [dbRow({ sector: null, median: 3 })]);
    const result = await repo.getBenchmarks(undefined, ["revenue_growth_yoy"]);
    expect(result.get("revenue_growth_yoy")?.median).toBe(3);
  });
});
