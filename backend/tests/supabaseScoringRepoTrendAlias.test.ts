// ============================================================================
// Tests: supabaseScoringRepo.getMetricInputs — TREND metric source aliasing
// (Milestone 12D). margin_trend/gross_margin_stability/roic_persistence are
// TREND rules configured in score_rules, but no calculated_metrics row is
// ever stored under those literal names — per fundamentalRatios.ts's own
// documented conclusion, they trend an ALREADY-COMPUTED metric's own stored
// history (net_margin / gross_margin / roic respectively). These tests lock
// in that getMetricInputs queries the aliased source metric while still
// keying the returned MetricInput under the rule's own metric_name, and that
// a metric with no alias (e.g. "net_margin" requested directly) is
// unaffected.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

type Row = { company_id: string; metric_name: string; period_type: string; period_end: string; value: number | null };

/** Fake Supabase client matching the exact chain getMetricInputs uses:
 *  db.from("calculated_metrics").select(...).eq("company_id",X)
 *    .eq("metric_name",Y).eq("period_type","ANNUAL")
 *    .order("period_end",{ascending:false}).limit(N) */
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
      order: () => builder, // getMetricInputs always orders period_end descending — matched directly below
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

function row(overrides: Partial<Row> = {}): Row {
  return { company_id: "company-a", metric_name: "net_margin", period_type: "ANNUAL", period_end: "2025-12-31", value: 10, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("supabaseScoringRepo.getMetricInputs — TREND metric source aliasing (Milestone 12D)", () => {
  it("1: margin_trend resolves to net_margin's own stored history, keyed under margin_trend", async () => {
    const repo = await buildRepoWith([
      row({ metric_name: "net_margin", period_end: "2022-12-31", value: 5 }),
      row({ metric_name: "net_margin", period_end: "2023-12-31", value: 7 }),
      row({ metric_name: "net_margin", period_end: "2024-12-31", value: 9 }),
      row({ metric_name: "net_margin", period_end: "2025-12-31", value: 11 }),
    ]);
    const result = await repo.getMetricInputs("company-a", ["margin_trend"]);
    expect(result.has("margin_trend")).toBe(true);
    const input = result.get("margin_trend")!;
    expect(input.metricName).toBe("margin_trend");
    expect(input.latestValue).toBe(11);
    expect(input.history).toEqual([5, 7, 9, 11]);
  });

  it("2: gross_margin_stability resolves to gross_margin's own stored history", async () => {
    const repo = await buildRepoWith([
      row({ metric_name: "gross_margin", period_end: "2023-12-31", value: 40 }),
      row({ metric_name: "gross_margin", period_end: "2024-12-31", value: 42 }),
    ]);
    const result = await repo.getMetricInputs("company-a", ["gross_margin_stability"]);
    const input = result.get("gross_margin_stability")!;
    expect(input.history).toEqual([40, 42]);
  });

  it("3: roic_persistence resolves to roic's own stored history — correctly empty, since roic is never computed", async () => {
    const repo = await buildRepoWith([row({ metric_name: "net_margin", value: 10 })]);
    const result = await repo.getMetricInputs("company-a", ["roic_persistence"]);
    expect(result.has("roic_persistence")).toBe(false);
  });

  it("4: a metric with no alias (net_margin requested directly) is unaffected", async () => {
    const repo = await buildRepoWith([row({ metric_name: "net_margin", period_end: "2025-12-31", value: 11 })]);
    const result = await repo.getMetricInputs("company-a", ["net_margin"]);
    expect(result.get("net_margin")?.latestValue).toBe(11);
  });

  it("5: requesting both margin_trend and net_margin in the same call resolves both correctly and independently", async () => {
    const repo = await buildRepoWith([
      row({ metric_name: "net_margin", period_end: "2024-12-31", value: 9 }),
      row({ metric_name: "net_margin", period_end: "2025-12-31", value: 11 }),
    ]);
    const result = await repo.getMetricInputs("company-a", ["net_margin", "margin_trend"]);
    expect(result.get("net_margin")?.history).toEqual([9, 11]);
    expect(result.get("margin_trend")?.history).toEqual([9, 11]);
    expect(result.get("net_margin")).not.toBe(result.get("margin_trend")); // independent MetricInput objects
  });

  it("6: aliasing is scoped to the requesting company — another company's rows never leak in", async () => {
    const repo = await buildRepoWith([
      row({ company_id: "company-a", metric_name: "net_margin", value: 10 }),
      row({ company_id: "company-b", metric_name: "net_margin", value: 999 }),
    ]);
    const result = await repo.getMetricInputs("company-a", ["margin_trend"]);
    expect(result.get("margin_trend")?.latestValue).toBe(10);
  });

  it("7: a company with only 2 stored net_margin periods still returns a MetricInput for margin_trend (minimum_data_points gating happens in scoreCategory, not here)", async () => {
    const repo = await buildRepoWith([
      row({ metric_name: "net_margin", period_end: "2024-12-31", value: 9 }),
      row({ metric_name: "net_margin", period_end: "2025-12-31", value: 11 }),
    ]);
    const result = await repo.getMetricInputs("company-a", ["margin_trend"]);
    expect(result.get("margin_trend")?.history).toHaveLength(2);
  });
});
