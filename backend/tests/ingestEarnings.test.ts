// ============================================================================
// Tests: ingestEarnings persistence — dedup/idempotency, the data-quality
// guard's effect at the ingestion layer, and the "never fabricate" rule,
// against a small in-memory fake Supabase client (same style as
// ingestForwardValuation.test.ts, Milestone 13H): no real network/database
// call happens.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EarningsProvider, EarningsRecord, ProviderCompanyRef, ProviderResult } from "../src/providers/interfaces";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

type Row = Record<string, any>;
type TableName = "earnings" | "data_sources" | "calculated_metrics";

function makeFakeDb() {
  const state: Record<TableName, Row[]> = { earnings: [], data_sources: [], calculated_metrics: [] };
  let idCounter = 1;

  function from(table: TableName) {
    let mode: "select" | "insert" = "select";
    let payload: Row | null = null;
    let singleMode = false;
    const eqFilters: Row = {};

    const builder: any = {
      select(_cols: string) {
        if (mode !== "insert") mode = "select";
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
      single() {
        singleMode = true;
        return builder;
      },
      then(resolve: (v: { data: any; error: any }) => void) {
        if (mode === "insert" && payload) {
          if (table === "calculated_metrics") {
            const dup = state.calculated_metrics.find(
              (r) =>
                r.company_id === payload!.company_id &&
                r.metric_name === payload!.metric_name &&
                r.period_end === payload!.period_end &&
                r.period_type === payload!.period_type &&
                r.calculation_version === payload!.calculation_version
            );
            if (dup) return resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
          }
          const row: Row = { id: `${table}-${idCounter++}`, ...payload };
          state[table].push(row);
          return resolve({ data: row, error: null });
        }
        const rows = state[table].filter((row) => Object.entries(eqFilters).every(([k, v]) => row[k] === v));
        void singleMode;
        return resolve({ data: rows, error: null });
      },
    };
    return builder;
  }

  return { from, state };
}

let fakeDb: ReturnType<typeof makeFakeDb>;
beforeEach(() => {
  fakeDb = makeFakeDb();
  dbClientMock.getDbClient.mockReturnValue(fakeDb);
});

function rec(overrides: Partial<EarningsRecord> = {}): EarningsRecord {
  return {
    periodEnd: "2026-08-26",
    reportDate: "2026-08-26",
    epsActual: 2.22,
    epsEstimate: 2.09,
    revenueActual: 96_221_000_000,
    revenueEstimate: 92_270_940_000,
    ...overrides,
  };
}

function makeEarningsProvider(result: ProviderResult<EarningsRecord[]>): EarningsProvider {
  return {
    async getEarnings(_ref: ProviderCompanyRef) {
      return result;
    },
    async getEstimates() {
      return { status: "unavailable", data: null, source: null };
    },
  };
}

const AVAILABLE: ProviderResult<EarningsRecord[]> = {
  status: "available",
  data: [
    rec({ periodEnd: "2026-11-18", reportDate: "2026-11-18", epsActual: undefined, revenueActual: undefined, epsEstimate: 2.47, revenueEstimate: 108_672_700_000 }), // upcoming
    rec(), // historical
  ],
  source: { providerName: "Financial Modeling Prep", providerType: "FINANCIAL_API", sourceUrl: "https://example.com/earnings" },
};

const UNAVAILABLE: ProviderResult<any> = { status: "unavailable", data: null, source: null, unavailableReason: "not entitled" };

describe("ingestEarnings — happy path", () => {
  it("stores both rows, computes eps+revenue surprise only for the historical row, leaves the upcoming row's surprise null", async () => {
    const { ingestEarnings } = await import("../src/ingestion/ingestEarnings");
    const outcome = await ingestEarnings("company-1", { ticker: "NVDA" }, makeEarningsProvider(AVAILABLE));

    expect(outcome.rowsStored).toBe(2);
    expect(outcome.historicalRows).toBe(1);
    expect(outcome.upcomingRows).toBe(1);
    expect(outcome.epsSurprise.stored).toBe(1);
    expect(outcome.revenueSurprise.stored).toBe(1);

    expect(fakeDb.state.earnings).toHaveLength(2);
    const upcoming = fakeDb.state.earnings.find((r) => r.report_date === "2026-11-18")!;
    expect(upcoming.eps_actual).toBeNull();
    expect(upcoming.eps_surprise_percent).toBeNull();
    expect(upcoming.revenue_surprise_percent).toBeNull();

    const historical = fakeDb.state.earnings.find((r) => r.report_date === "2026-08-26")!;
    expect(historical.eps_actual).toBe(2.22);
    expect(historical.eps_surprise_percent).not.toBeNull();
    expect(historical.guidance_text).toBeNull();
    expect(historical.guidance_direction).toBeNull();

    expect(fakeDb.state.calculated_metrics).toHaveLength(2);
    expect(fakeDb.state.calculated_metrics.map((r) => r.metric_name).sort()).toEqual(["eps_surprise_percent", "revenue_surprise_percent"]);
    expect(fakeDb.state.calculated_metrics.every((r) => r.period_type === "QUARTER")).toBe(true);
  });

  it("period_end/report_date reuse the same real FMP date — never a second invented date", async () => {
    const { ingestEarnings } = await import("../src/ingestion/ingestEarnings");
    await ingestEarnings("company-1", { ticker: "NVDA" }, makeEarningsProvider(AVAILABLE));
    const historical = fakeDb.state.earnings.find((r) => r.report_date === "2026-08-26")!;
    expect(historical.period_end).toBe("2026-08-26");
  });
});

describe("ingestEarnings — idempotency / no duplicate rows", () => {
  it("re-running for the same company produces zero new earnings or calculated_metrics rows", async () => {
    const { ingestEarnings } = await import("../src/ingestion/ingestEarnings");
    const provider = makeEarningsProvider(AVAILABLE);

    await ingestEarnings("company-1", { ticker: "NVDA" }, provider);
    const after1 = { earnings: fakeDb.state.earnings.length, calculated_metrics: fakeDb.state.calculated_metrics.length };

    const outcome2 = await ingestEarnings("company-1", { ticker: "NVDA" }, provider);

    expect(fakeDb.state.earnings).toHaveLength(after1.earnings);
    expect(fakeDb.state.calculated_metrics).toHaveLength(after1.calculated_metrics);
    expect(outcome2.rowsStored).toBe(0);
    expect(outcome2.rowsSkippedExisting).toBe(2);
  });
});

describe("ingestEarnings — never fabricates unavailable data", () => {
  it("provider unavailable (e.g. TXN subscription gate) stores nothing", async () => {
    const { ingestEarnings } = await import("../src/ingestion/ingestEarnings");
    const outcome = await ingestEarnings("company-2", { ticker: "TXN" }, makeEarningsProvider(UNAVAILABLE));
    expect(outcome.earningsStatus).toBe("unavailable");
    expect(fakeDb.state.earnings).toHaveLength(0);
    expect(fakeDb.state.calculated_metrics).toHaveLength(0);
  });

  it("a GOOGL-shaped implausible record: the raw earnings row is stored with real actual/estimate values, but no surprise calculated_metrics row is written", async () => {
    const { ingestEarnings } = await import("../src/ingestion/ingestEarnings");
    const googlLike: ProviderResult<EarningsRecord[]> = {
      status: "available",
      data: [rec({ periodEnd: "2026-07-22", reportDate: "2026-07-22", epsActual: 9.11, epsEstimate: 2.87, revenueActual: 119_796_000_000, revenueEstimate: 116_532_500_000 })],
      source: { providerName: "Financial Modeling Prep", providerType: "FINANCIAL_API" },
    };
    const outcome = await ingestEarnings("company-3", { ticker: "GOOGL" }, makeEarningsProvider(googlLike));

    expect(fakeDb.state.earnings).toHaveLength(1);
    const row = fakeDb.state.earnings[0]!;
    expect(row.eps_actual).toBe(9.11); // raw provider value preserved exactly
    expect(row.eps_estimate).toBe(2.87);
    expect(row.eps_surprise_percent).toBeNull(); // derived metric suppressed

    // Only the EPS side was anomalous for this fixture (actual 9.11 vs
    // consensus 2.87) — revenue (119.796B vs 116.5325B, a normal ~2.8%
    // surprise) legitimately passes the guard and IS stored. This proves
    // the guard judges each field independently, not "reject everything
    // about this record."
    expect(fakeDb.state.calculated_metrics.map((r) => r.metric_name)).toEqual(["revenue_surprise_percent"]);
    expect(outcome.epsSurprise.rejectedByGuard).toBe(1);
    expect(outcome.epsSurprise.stored).toBe(0);
    expect(outcome.revenueSurprise.stored).toBe(1);
  });

  it("surprise metrics are only ever created when valid — a record with null consensus produces zero calculated_metrics rows for that field", async () => {
    const { ingestEarnings } = await import("../src/ingestion/ingestEarnings");
    const noConsensus: ProviderResult<EarningsRecord[]> = {
      status: "available",
      data: [rec({ epsEstimate: undefined })],
      source: { providerName: "Financial Modeling Prep", providerType: "FINANCIAL_API" },
    };
    const outcome = await ingestEarnings("company-4", { ticker: "NVDA" }, makeEarningsProvider(noConsensus));
    expect(outcome.epsSurprise.stored).toBe(0);
    expect(outcome.epsSurprise.unavailable).toBe(1);
    expect(fakeDb.state.calculated_metrics.filter((r) => r.metric_name === "eps_surprise_percent")).toHaveLength(0);
  });
});
