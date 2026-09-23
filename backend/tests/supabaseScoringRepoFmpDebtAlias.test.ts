// ============================================================================
// Tests: supabaseScoringRepo.getMetricInputs — FMP debt-metric isolation
// (Milestone 15C). Proves the core requirement directly: even when a
// company has BOTH a real SEC-sourced row under the plain metric_name
// (e.g. "total_debt", from Milestone 13C's fundamentalRatios.ts pipeline)
// AND a real FMP-sourced row under the "_fmp" metric_name for the SAME
// rule, scoring reads ONLY the FMP one — the SEC row is never merged into
// the returned history, never used as a fallback, never blended across
// periods. This is the exact AMZN/JNJ scenario: both are FMP-entitled AND
// already have real SEC-sourced debt data.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

type Row = { company_id: string; metric_name: string; period_type: string; period_end: string; value: number | null };

/** Same fake Supabase client shape as the sibling period-type/alias test
 *  files — filters by every .eq() call, so a wrong metric_name in the
 *  query means the SEC decoy rows are never even candidates. */
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

describe("supabaseScoringRepo.getMetricInputs — FMP debt-metric isolation (Milestone 15C)", () => {
  it("debt_trend reads ONLY total_debt_fmp — the real SEC-sourced 'total_debt' row is never read, even present in the same table for the same company", async () => {
    const repo = await buildRepoWith([
      // Real SEC row (Milestone 13C) — absurd value proves it's never touched.
      { company_id: "amzn", metric_name: "total_debt", period_type: "ANNUAL", period_end: "2025-12-31", value: 999_999_999_999 },
      // Real FMP rows (Milestone 15C).
      { company_id: "amzn", metric_name: "total_debt_fmp", period_type: "ANNUAL", period_end: "2023-12-31", value: 8_494_000_000 },
      { company_id: "amzn", metric_name: "total_debt_fmp", period_type: "ANNUAL", period_end: "2024-12-31", value: 5_017_000_000 },
      { company_id: "amzn", metric_name: "total_debt_fmp", period_type: "ANNUAL", period_end: "2025-12-31", value: 2_748_000_000 },
    ]);
    const result = await repo.getMetricInputs("amzn", ["debt_trend"]);
    const input = result.get("debt_trend")!;
    expect(input.latestValue).toBe(2_748_000_000);
    expect(input.history).toEqual([8_494_000_000, 5_017_000_000, 2_748_000_000]);
    expect(input.history).not.toContain(999_999_999_999);
  });

  it("net_debt_trend reads ONLY net_debt_fmp, never the SEC-sourced 'net_debt' row", async () => {
    const repo = await buildRepoWith([
      { company_id: "jnj", metric_name: "net_debt", period_type: "ANNUAL", period_end: "2025-12-28", value: -1_111_111_111 },
      { company_id: "jnj", metric_name: "net_debt_fmp", period_type: "ANNUAL", period_end: "2025-12-31", value: 5_000_000_000 },
    ]);
    const result = await repo.getMetricInputs("jnj", ["net_debt_trend"]);
    expect(result.get("net_debt_trend")?.latestValue).toBe(5_000_000_000);
  });

  it("debt_to_equity (a direct PERCENTILE rule, not just a TREND alias) also reads ONLY debt_to_equity_fmp", async () => {
    const repo = await buildRepoWith([
      { company_id: "amzn", metric_name: "debt_to_equity", period_type: "ANNUAL", period_end: "2025-12-31", value: -777 },
      { company_id: "amzn", metric_name: "debt_to_equity_fmp", period_type: "ANNUAL", period_end: "2025-12-31", value: 0.372 },
    ]);
    const result = await repo.getMetricInputs("amzn", ["debt_to_equity"]);
    expect(result.get("debt_to_equity")?.latestValue).toBe(0.372);
  });

  it("net_debt_to_ebitda also reads ONLY net_debt_to_ebitda_fmp", async () => {
    const repo = await buildRepoWith([
      { company_id: "amzn", metric_name: "net_debt_to_ebitda", period_type: "ANNUAL", period_end: "2025-12-31", value: -42 },
      { company_id: "amzn", metric_name: "net_debt_to_ebitda_fmp", period_type: "ANNUAL", period_end: "2025-12-31", value: 0.61 },
    ]);
    const result = await repo.getMetricInputs("amzn", ["net_debt_to_ebitda"]);
    expect(result.get("net_debt_to_ebitda")?.latestValue).toBe(0.61);
  });

  it("a company with ONLY the SEC row and no FMP row returns no entry — no fallback to SEC", async () => {
    const repo = await buildRepoWith([{ company_id: "some-gated-co", metric_name: "total_debt", period_type: "ANNUAL", period_end: "2025-12-31", value: 123 }]);
    const result = await repo.getMetricInputs("some-gated-co", ["debt_trend"]);
    expect(result.has("debt_trend")).toBe(false);
  });

  it("requesting a plain 'net_margin' rule alongside a debt rule in the same call is unaffected by the debt aliasing", async () => {
    const repo = await buildRepoWith([
      { company_id: "amzn", metric_name: "net_margin", period_type: "ANNUAL", period_end: "2025-12-31", value: 8.5 },
      { company_id: "amzn", metric_name: "total_debt", period_type: "ANNUAL", period_end: "2025-12-31", value: 999 },
      { company_id: "amzn", metric_name: "total_debt_fmp", period_type: "ANNUAL", period_end: "2025-12-31", value: 2_748_000_000 },
    ]);
    const result = await repo.getMetricInputs("amzn", ["net_margin", "debt_trend"]);
    expect(result.get("net_margin")?.latestValue).toBe(8.5);
    expect(result.get("debt_trend")?.latestValue).toBe(2_748_000_000);
  });
});
