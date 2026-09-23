// ============================================================================
// Tests: supabaseScoringRepo.getMetricInputs — explicit TTM period type for
// the 5 VALUATION ratio metrics (Milestone 15B Part 1).
//
// Milestone 15A's coverage audit found ingestValuationData.ts stores pe/
// ev_ebitda/ev_sales/price_to_fcf/fcf_yield under period_type='TTM', but
// getMetricInputs queried period_type='ANNUAL' for any metric not in
// METRIC_PERIOD_TYPE — confirmed live against NVDA's own stored 'pe' row
// (real data existed, 0 rows returned). Milestone 15B adds these 5 to the
// map, same pattern as the QUARTER entries in
// supabaseScoringRepoQuarterlyPeriodType.test.ts (which this file does not
// duplicate) — every other metric, including forward_pe (already correctly
// ANNUAL), stays unaffected.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

type Row = { company_id: string; metric_name: string; period_type: string; period_end: string; value: number | null };

/** Same fake Supabase client shape as the sibling period-type test files —
 *  filters by every .eq() call, including period_type, so a wrong
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

describe("supabaseScoringRepo.getMetricInputs — TTM period type for Valuation ratios (Milestone 15B)", () => {
  it("reproduces the exact live 15A finding: pe reads TTM rows, not ANNUAL", async () => {
    const repo = await buildRepoWith([
      { company_id: "c1", metric_name: "pe", period_type: "TTM", period_end: "2026-09-10", value: 27.47 },
      { company_id: "c1", metric_name: "pe", period_type: "ANNUAL", period_end: "2025-12-31", value: 999 }, // decoy — must NOT be read
    ]);
    const result = await repo.getMetricInputs("c1", ["pe"]);
    expect(result.get("pe")?.latestValue).toBe(27.47);
  });

  it("each of the other 4 TTM valuation metrics also reads TTM rows", async () => {
    const metrics = ["ev_ebitda", "ev_sales", "price_to_fcf", "fcf_yield"];
    for (const metricName of metrics) {
      const repo = await buildRepoWith([
        { company_id: "c1", metric_name: metricName, period_type: "TTM", period_end: "2026-09-10", value: 42 },
        { company_id: "c1", metric_name: metricName, period_type: "ANNUAL", period_end: "2025-12-31", value: 999 },
      ]);
      const result = await repo.getMetricInputs("c1", [metricName]);
      expect(result.get(metricName)?.latestValue).toBe(42);
    }
  });

  it("forward_pe is unaffected — it was already correctly stored/queried ANNUAL", async () => {
    const repo = await buildRepoWith([
      { company_id: "c1", metric_name: "forward_pe", period_type: "ANNUAL", period_end: "2027-01-25", value: 23.59 },
      { company_id: "c1", metric_name: "forward_pe", period_type: "TTM", period_end: "2026-09-10", value: 999 }, // decoy
    ]);
    const result = await repo.getMetricInputs("c1", ["forward_pe"]);
    expect(result.get("forward_pe")?.latestValue).toBe(23.59);
  });

  it("a non-valuation ANNUAL metric (e.g. revenue_growth_yoy) is completely unaffected by this map extension", async () => {
    const repo = await buildRepoWith([
      { company_id: "c1", metric_name: "revenue_growth_yoy", period_type: "ANNUAL", period_end: "2025-12-31", value: 12.5 },
      { company_id: "c1", metric_name: "revenue_growth_yoy", period_type: "TTM", period_end: "2026-09-10", value: 999 },
    ]);
    const result = await repo.getMetricInputs("c1", ["revenue_growth_yoy"]);
    expect(result.get("revenue_growth_yoy")?.latestValue).toBe(12.5);
  });

  it("requesting a TTM valuation metric and an ANNUAL metric together resolves both correctly and independently", async () => {
    const repo = await buildRepoWith([
      { company_id: "c1", metric_name: "pe", period_type: "TTM", period_end: "2026-09-10", value: 27.47 },
      { company_id: "c1", metric_name: "net_margin", period_type: "ANNUAL", period_end: "2025-12-31", value: 20 },
    ]);
    const result = await repo.getMetricInputs("c1", ["pe", "net_margin"]);
    expect(result.get("pe")?.latestValue).toBe(27.47);
    expect(result.get("net_margin")?.latestValue).toBe(20);
  });

  it("a company with no TTM pe rows yet returns no entry (unavailable), not a fabricated value", async () => {
    const repo = await buildRepoWith([]);
    const result = await repo.getMetricInputs("c1", ["pe"]);
    expect(result.has("pe")).toBe(false);
  });
});
