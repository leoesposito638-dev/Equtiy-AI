// ============================================================================
// Tests: ingestFmpDebtMetrics persistence (Milestone 15C) — dedup/
// idempotency, "never fabricate", and the metric_name isolation that keeps
// this ingestion from ever touching the SEC-sourced plain metric_names,
// against a small in-memory fake Supabase client (same style as
// ingestValuationData.test.ts): no real network/database call happens.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MarketDataProvider, ProviderCompanyRef, ProviderResult, FmpDebtMetricsPeriod } from "../src/providers/interfaces";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

type Row = Record<string, any>;

/** Simulates calculated_metrics' real unique constraint, same technique as
 *  ingestValuationData.test.ts. Can be pre-seeded so a test can assert
 *  this ingestion never reads or writes pre-existing SEC-sourced rows
 *  under the plain (non-"_fmp") metric_names. */
function makeFakeDb(seed: Row[] = []) {
  const state: { calculated_metrics: Row[] } = { calculated_metrics: [...seed] };
  let idCounter = 1;

  function from(_table: "calculated_metrics") {
    let payload: Row | null = null;
    let mode: "select" | "insert" = "select";
    const eqFilters: Row = {};

    const builder: any = {
      select(_cols: string) {
        mode = "select";
        return builder;
      },
      eq(k: string, v: unknown) {
        eqFilters[k] = v;
        return builder;
      },
      insert(p: Row) {
        mode = "insert";
        payload = p;
        return builder;
      },
      then(resolve: (v: { data: any; error: any }) => void) {
        if (mode === "insert" && payload) {
          const dup = state.calculated_metrics.find(
            (r) =>
              r.company_id === payload!.company_id &&
              r.metric_name === payload!.metric_name &&
              r.period_end === payload!.period_end &&
              r.period_type === payload!.period_type &&
              r.calculation_version === payload!.calculation_version
          );
          if (dup) return resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
          const row: Row = { id: `calculated_metrics-${idCounter++}`, ...payload };
          state.calculated_metrics.push(row);
          return resolve({ data: row, error: null });
        }
        const rows = state.calculated_metrics.filter((row) => Object.entries(eqFilters).every(([k, v]) => row[k] === v));
        return resolve({ data: rows, error: null });
      },
    };
    return builder;
  }

  return { from, state };
}

let fakeDb: ReturnType<typeof makeFakeDb>;

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

function makeProvider(result: ProviderResult<FmpDebtMetricsPeriod[]>): MarketDataProvider {
  return {
    async getQuote() {
      return { status: "unavailable", data: null, source: null };
    },
    async getHistoricalPrices() {
      return { status: "unavailable", data: null, source: null };
    },
    async getValuationRatios() {
      return { status: "unavailable", data: null, source: null };
    },
    async getLivePrice() {
      return { status: "unavailable", data: null, source: null };
    },
    async getDebtMetricsHistory(_ref: ProviderCompanyRef) {
      return result;
    },
  };
}

const AVAILABLE_ONE_PERIOD: ProviderResult<FmpDebtMetricsPeriod[]> = {
  status: "available",
  data: [period()],
  source: { providerName: "Financial Modeling Prep", providerType: "MARKET_DATA", sourceUrl: "https://example.com/bs" },
};

describe("ingestFmpDebtMetrics — happy path", () => {
  beforeEach(() => {
    fakeDb = makeFakeDb();
    dbClientMock.getDbClient.mockReturnValue(fakeDb);
  });

  it("stores all 4 metrics under the '_fmp' metric_names for a single fully-available period", async () => {
    const { ingestFmpDebtMetrics, FMP_DEBT_METRICS_CALCULATION_VERSION } = await import("../src/ingestion/ingestFmpDebtMetrics");
    const outcome = await ingestFmpDebtMetrics("company-1", { ticker: "NVDA" }, makeProvider(AVAILABLE_ONE_PERIOD));

    expect(outcome.status).toBe("available");
    expect(outcome.periodsFetched).toBe(1);
    expect(outcome.periodsComputed).toBe(1);
    expect(outcome.stored).toBe(4);

    const names = fakeDb.state.calculated_metrics.map((r) => r.metric_name).sort();
    expect(names).toEqual(["debt_to_equity_fmp", "net_debt_fmp", "net_debt_to_ebitda_fmp", "total_debt_fmp"]);
    expect(fakeDb.state.calculated_metrics.every((r) => r.calculation_version === FMP_DEBT_METRICS_CALCULATION_VERSION)).toBe(true);
    expect(fakeDb.state.calculated_metrics.every((r) => r.period_type === "ANNUAL")).toBe(true);
  });

  it("multiple periods store multiple rows per metric, one per period_end", async () => {
    const { ingestFmpDebtMetrics } = await import("../src/ingestion/ingestFmpDebtMetrics");
    const twoPeriods: ProviderResult<FmpDebtMetricsPeriod[]> = {
      status: "available",
      data: [period({ periodEnd: "2026-01-25" }), period({ periodEnd: "2025-01-26", totalDebt: 9_000_000_000 })],
      source: { providerName: "Financial Modeling Prep", providerType: "MARKET_DATA" },
    };
    const outcome = await ingestFmpDebtMetrics("company-1", { ticker: "NVDA" }, makeProvider(twoPeriods));
    expect(outcome.stored).toBe(8); // 4 metrics x 2 periods
  });
});

describe("ingestFmpDebtMetrics — never fabricates, no fallback", () => {
  beforeEach(() => {
    fakeDb = makeFakeDb();
    dbClientMock.getDbClient.mockReturnValue(fakeDb);
  });

  it("an unavailable provider result stores nothing", async () => {
    const { ingestFmpDebtMetrics } = await import("../src/ingestion/ingestFmpDebtMetrics");
    const outcome = await ingestFmpDebtMetrics("company-2", { ticker: "AMAT" }, makeProvider({ status: "unavailable", data: null, source: null, unavailableReason: "402" }));
    expect(outcome.status).toBe("unavailable");
    expect(fakeDb.state.calculated_metrics).toHaveLength(0);
  });

  it("a null debtToEquity/netDebtToEbitda (zero equity/EBITDA) is never stored — 2/4 metrics only", async () => {
    const { ingestFmpDebtMetrics } = await import("../src/ingestion/ingestFmpDebtMetrics");
    const zeroEquity: ProviderResult<FmpDebtMetricsPeriod[]> = {
      status: "available",
      data: [period({ totalStockholdersEquity: 0 })],
      source: { providerName: "Financial Modeling Prep", providerType: "MARKET_DATA" },
    };
    const outcome = await ingestFmpDebtMetrics("company-3", { ticker: "NVDA" }, makeProvider(zeroEquity));
    expect(outcome.stored).toBe(3); // total_debt_fmp, net_debt_fmp, net_debt_to_ebitda_fmp — never debt_to_equity_fmp
    expect(fakeDb.state.calculated_metrics.map((r) => r.metric_name)).not.toContain("debt_to_equity_fmp");
  });
});

describe("ingestFmpDebtMetrics — idempotency / no duplicate rows", () => {
  beforeEach(() => {
    fakeDb = makeFakeDb();
    dbClientMock.getDbClient.mockReturnValue(fakeDb);
  });

  it("re-running for the same company/period produces zero new rows", async () => {
    const { ingestFmpDebtMetrics } = await import("../src/ingestion/ingestFmpDebtMetrics");
    const provider = makeProvider(AVAILABLE_ONE_PERIOD);
    await ingestFmpDebtMetrics("company-1", { ticker: "NVDA" }, provider);
    const after1 = fakeDb.state.calculated_metrics.length;

    const outcome2 = await ingestFmpDebtMetrics("company-1", { ticker: "NVDA" }, provider);
    expect(fakeDb.state.calculated_metrics).toHaveLength(after1);
    expect(outcome2.stored).toBe(0);
    expect(outcome2.skippedExisting).toBe(4);
  });
});

describe("ingestFmpDebtMetrics — AMZN/JNJ SEC-row isolation (Milestone 15C's core requirement)", () => {
  it("never reads, updates, or duplicates a pre-existing SEC-sourced row under the plain metric_name", async () => {
    // Seed exactly what AMZN already has for real, per Milestone 15B: a
    // SEC-sourced total_debt row under calculation_version 'v1.0' (the
    // fundamentalRatios.ts family), same period_end this test's FMP data
    // will also use — the worst-case collision scenario.
    const secRow = {
      id: "sec-1",
      company_id: "company-amzn",
      metric_name: "total_debt",
      value: 999_999_999_999, // deliberately absurd — proves this exact row is never touched or read
      period_end: "2026-01-25",
      period_type: "ANNUAL",
      calculation_version: "v1.0",
    };
    fakeDb = makeFakeDb([secRow]);
    dbClientMock.getDbClient.mockReturnValue(fakeDb);

    const { ingestFmpDebtMetrics } = await import("../src/ingestion/ingestFmpDebtMetrics");
    const outcome = await ingestFmpDebtMetrics("company-amzn", { ticker: "AMZN" }, makeProvider(AVAILABLE_ONE_PERIOD));

    expect(outcome.stored).toBe(4);
    // The original SEC row is still there, completely unmodified.
    const secRowAfter = fakeDb.state.calculated_metrics.find((r) => r.id === "sec-1");
    expect(secRowAfter).toEqual(secRow);
    // The new FMP row exists under a DIFFERENT metric_name, same period_end.
    const fmpRow = fakeDb.state.calculated_metrics.find((r) => r.metric_name === "total_debt_fmp" && r.period_end === "2026-01-25");
    expect(fmpRow?.value).toBe(11_412_000_000); // the real FMP value, not the SEC decoy
    // Exactly one row exists under the plain "total_debt" name — the
    // pre-seeded SEC one — this ingestion added zero rows there.
    expect(fakeDb.state.calculated_metrics.filter((r) => r.metric_name === "total_debt")).toHaveLength(1);
  });
});
