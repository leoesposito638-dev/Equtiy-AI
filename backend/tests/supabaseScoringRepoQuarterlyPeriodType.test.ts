// ============================================================================
// Tests: supabaseScoringRepo.getMetricInputs — explicit QUARTER period type
// for EARNINGS_MOMENTUM surprise metrics (Milestone 14B §5/§12.E).
//
// Milestone 14A found getMetricInputs hardcoded period_type='ANNUAL' for
// every metric. Milestone 14B adds an explicit METRIC_PERIOD_TYPE map so
// eps_surprise_percent/revenue_surprise_percent read QUARTER while every
// other metric (including the pre-existing TREND aliases from
// supabaseScoringRepoTrendAlias.test.ts, which this file does not
// duplicate) keeps reading ANNUAL, unchanged.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

type Row = { company_id: string; metric_name: string; period_type: string; period_end: string; value: number | null };

/** Same fake Supabase client shape as supabaseScoringRepoTrendAlias.test.ts
 *  — filters by every .eq() call, including period_type, so a wrong
 *  period_type in the query means zero rows match, not a false pass. */
function fakeDb(rows: Row[]) {
  function from(_table: string) {
    const eqFilters: Record<string, any> = {};
    let limitN: number | null = null;
    const builder: any = {
      select: () => builder,
      eq(field: string, value: any) {
        eqFilters[field] = value;
        return builder;
      },
      order: () => builder,
      limit(n: number) {
        limitN = n;
        return builder;
      },
      then(resolve: any, reject: any) {
        let data = rows
          .filter((r) => Object.entries(eqFilters).every(([k, v]) => (r as any)[k] === v))
          .sort((a, b) => (a.period_end < b.period_end ? 1 : a.period_end > b.period_end ? -1 : 0));
        if (limitN != null) data = data.slice(0, limitN);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }
  return { from };
}

async function buildRepoWith(rows: Row[]) {
  dbClientMock.getDbClient.mockReturnValue(fakeDb(rows));
  const { buildSupabaseScoringRepo } = await import("../src/scoring/supabaseScoringRepo");
  return buildSupabaseScoringRepo();
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("supabaseScoringRepo.getMetricInputs — QUARTER period type for Earnings Momentum (Milestone 14B)", () => {
  it("eps_surprise_percent reads QUARTER rows, not ANNUAL", async () => {
    const repo = await buildRepoWith([
      { company_id: "c1", metric_name: "eps_surprise_percent", period_type: "QUARTER", period_end: "2026-08-26", value: 6.2 },
      { company_id: "c1", metric_name: "eps_surprise_percent", period_type: "ANNUAL", period_end: "2025-12-31", value: 999 }, // decoy — must NOT be read
    ]);
    const result = await repo.getMetricInputs("c1", ["eps_surprise_percent"]);
    expect(result.get("eps_surprise_percent")?.latestValue).toBe(6.2);
  });

  it("revenue_surprise_percent reads QUARTER rows, not ANNUAL", async () => {
    const repo = await buildRepoWith([
      { company_id: "c1", metric_name: "revenue_surprise_percent", period_type: "QUARTER", period_end: "2026-08-26", value: 4.3 },
      { company_id: "c1", metric_name: "revenue_surprise_percent", period_type: "ANNUAL", period_end: "2025-12-31", value: 999 },
    ]);
    const result = await repo.getMetricInputs("c1", ["revenue_surprise_percent"]);
    expect(result.get("revenue_surprise_percent")?.latestValue).toBe(4.3);
  });

  it("an existing ANNUAL metric (e.g. revenue_growth_yoy) is completely unaffected — still reads ANNUAL", async () => {
    const repo = await buildRepoWith([
      { company_id: "c1", metric_name: "revenue_growth_yoy", period_type: "ANNUAL", period_end: "2025-12-31", value: 12.5 },
      { company_id: "c1", metric_name: "revenue_growth_yoy", period_type: "QUARTER", period_end: "2026-08-26", value: 999 }, // decoy
    ]);
    const result = await repo.getMetricInputs("c1", ["revenue_growth_yoy"]);
    expect(result.get("revenue_growth_yoy")?.latestValue).toBe(12.5);
  });

  it("requesting an ANNUAL metric and a QUARTER metric in the same call resolves both correctly and independently", async () => {
    const repo = await buildRepoWith([
      { company_id: "c1", metric_name: "revenue_growth_yoy", period_type: "ANNUAL", period_end: "2025-12-31", value: 12.5 },
      { company_id: "c1", metric_name: "eps_surprise_percent", period_type: "QUARTER", period_end: "2026-08-26", value: 6.2 },
    ]);
    const result = await repo.getMetricInputs("c1", ["revenue_growth_yoy", "eps_surprise_percent"]);
    expect(result.get("revenue_growth_yoy")?.latestValue).toBe(12.5);
    expect(result.get("eps_surprise_percent")?.latestValue).toBe(6.2);
  });

  it("a company with no QUARTER surprise rows yet returns no entry (unavailable), not a fabricated zero", async () => {
    const repo = await buildRepoWith([]);
    const result = await repo.getMetricInputs("c1", ["eps_surprise_percent"]);
    expect(result.has("eps_surprise_percent")).toBe(false);
  });

  it("eps_surprise_percent history is ordered most-recent-last across multiple QUARTER periods (matches TREND/LINEAR expectations)", async () => {
    const repo = await buildRepoWith([
      { company_id: "c1", metric_name: "eps_surprise_percent", period_type: "QUARTER", period_end: "2026-02-25", value: 5.2 },
      { company_id: "c1", metric_name: "eps_surprise_percent", period_type: "QUARTER", period_end: "2026-08-26", value: 6.2 },
      { company_id: "c1", metric_name: "eps_surprise_percent", period_type: "QUARTER", period_end: "2026-05-20", value: 6.3 },
    ]);
    const result = await repo.getMetricInputs("c1", ["eps_surprise_percent"]);
    expect(result.get("eps_surprise_percent")?.history).toEqual([5.2, 6.3, 6.2]);
    expect(result.get("eps_surprise_percent")?.latestValue).toBe(6.2);
  });
});
