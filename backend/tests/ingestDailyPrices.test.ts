// ============================================================================
// Tests: ingestDailyPrices persistence — real-upsert idempotency and the
// "never fabricate" rule, against a small in-memory fake Supabase client
// (same style as ingestForwardValuation.test.ts / ingestEarnings.test.ts):
// no real network/database call happens.
//
// Unlike earnings/estimates/market_data in prior milestones, daily_prices
// HAS a real DB unique constraint (company_id, trade_date, adjustment_type)
// — this fake DB simulates a genuine upsert (insert-or-replace-in-place),
// not the "select existing keys then skip" pattern those other tables
// needed.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DailyPrice, MarketDataProvider, ProviderCompanyRef, ProviderResult } from "../src/providers/interfaces";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

type Row = Record<string, any>;
type TableName = "daily_prices" | "data_sources";

function makeFakeDb() {
  const state: Record<TableName, Row[]> = { daily_prices: [], data_sources: [] };
  let idCounter = 1;

  function from(table: TableName) {
    let mode: "select" | "insert" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    let singleMode = false;
    let selectAfterWrite = false;

    const builder: any = {
      select(_cols: string) {
        if (mode === "select") return builder;
        selectAfterWrite = true;
        return builder;
      },
      insert(p: Row) {
        mode = "insert";
        payload = p;
        return builder;
      },
      upsert(p: Row[], _opts: { onConflict: string }) {
        mode = "upsert";
        payload = p;
        return builder;
      },
      single() {
        singleMode = true;
        return builder;
      },
      then(resolve: (v: { data: any; error: any }) => void) {
        if (mode === "insert" && payload) {
          const row: Row = { id: `${table}-${idCounter++}`, ...(payload as Row) };
          state[table].push(row);
          return resolve({ data: singleMode ? row : row, error: null });
        }
        if (mode === "upsert" && payload) {
          const rows = payload as Row[];
          const written: Row[] = [];
          for (const incoming of rows) {
            const existingIdx = state.daily_prices.findIndex(
              (r) =>
                r.company_id === incoming.company_id &&
                r.trade_date === incoming.trade_date &&
                r.adjustment_type === incoming.adjustment_type
            );
            if (existingIdx >= 0) {
              state.daily_prices[existingIdx] = { ...state.daily_prices[existingIdx], ...incoming };
              written.push(state.daily_prices[existingIdx]!);
            } else {
              const row = { id: `daily_prices-${idCounter++}`, ...incoming };
              state.daily_prices.push(row);
              written.push(row);
            }
          }
          return resolve({ data: selectAfterWrite ? written : written, error: null });
        }
        return resolve({ data: state[table], error: null });
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

function price(overrides: Partial<DailyPrice> = {}): DailyPrice {
  return {
    date: "2026-09-18",
    open: 219.35,
    high: 222.73,
    low: 218.03,
    close: 222.27,
    volume: 190287429,
    adjustmentType: "split_and_dividend_adjusted",
    ...overrides,
  };
}

function makeMarketDataProvider(result: ProviderResult<DailyPrice[]>): MarketDataProvider {
  return {
    async getQuote() {
      return { status: "unavailable", data: null, source: null };
    },
    async getValuationRatios() {
      return { status: "unavailable", data: null, source: null };
    },
    async getLivePrice() {
      return { status: "unavailable", data: null, source: null };
    },
    async getHistoricalPrices(_ref: ProviderCompanyRef, _from: string, _to: string) {
      return result;
    },
    async getDebtMetricsHistory() {
      return { status: "unavailable", data: null, source: null };
    },
    async getCompanyProfile() {
      return { status: "unavailable", data: null, source: null };
    },
  };
}

const AVAILABLE: ProviderResult<DailyPrice[]> = {
  status: "available",
  data: [price({ date: "2026-09-18" }), price({ date: "2026-09-17", close: 219.34 }), price({ date: "2026-09-16", close: 213.9 })],
  source: { providerName: "Financial Modeling Prep", providerType: "MARKET_DATA", sourceUrl: "https://example.com/prices" },
};

const UNAVAILABLE: ProviderResult<any> = { status: "unavailable", data: null, source: null, unavailableReason: "not entitled" };

describe("ingestDailyPrices — happy path", () => {
  it("upserts all rows with the correct adjustment_type and real values", async () => {
    const { ingestDailyPrices } = await import("../src/ingestion/ingestDailyPrices");
    const outcome = await ingestDailyPrices("company-1", { ticker: "NVDA" }, makeMarketDataProvider(AVAILABLE), "2026-09-15", "2026-09-20");

    expect(outcome.status).toBe("available");
    expect(outcome.rowsFetched).toBe(3);
    expect(outcome.rowsUpserted).toBe(3);
    expect(fakeDb.state.daily_prices).toHaveLength(3);
    expect(fakeDb.state.daily_prices.every((r) => r.adjustment_type === "split_and_dividend_adjusted")).toBe(true);
    expect(fakeDb.state.daily_prices.find((r) => r.trade_date === "2026-09-18")).toMatchObject({ open: 219.35, close: 222.27 });
  });

  it("stores exactly one data_sources row per call, referenced by every price row", async () => {
    const { ingestDailyPrices } = await import("../src/ingestion/ingestDailyPrices");
    await ingestDailyPrices("company-1", { ticker: "NVDA" }, makeMarketDataProvider(AVAILABLE), "2026-09-15", "2026-09-20");
    expect(fakeDb.state.data_sources).toHaveLength(1);
    const sourceId = fakeDb.state.data_sources[0]!.id;
    expect(fakeDb.state.daily_prices.every((r) => r.source_id === sourceId)).toBe(true);
  });
});

describe("ingestDailyPrices — idempotency via real upsert", () => {
  it("re-running with identical data updates rows in place, no duplicates", async () => {
    const { ingestDailyPrices } = await import("../src/ingestion/ingestDailyPrices");
    const provider = makeMarketDataProvider(AVAILABLE);

    await ingestDailyPrices("company-1", { ticker: "NVDA" }, provider, "2026-09-15", "2026-09-20");
    const afterFirst = fakeDb.state.daily_prices.length;

    await ingestDailyPrices("company-1", { ticker: "NVDA" }, provider, "2026-09-15", "2026-09-20");
    expect(fakeDb.state.daily_prices).toHaveLength(afterFirst);
  });

  it("two different companies' prices for the same trade_date stay separate rows", async () => {
    const { ingestDailyPrices } = await import("../src/ingestion/ingestDailyPrices");
    const provider = makeMarketDataProvider({
      status: "available",
      data: [price({ date: "2026-09-18" })],
      source: { providerName: "Financial Modeling Prep", providerType: "MARKET_DATA" },
    });
    await ingestDailyPrices("company-1", { ticker: "NVDA" }, provider, "2026-09-15", "2026-09-20");
    await ingestDailyPrices("company-2", { ticker: "ADBE" }, provider, "2026-09-15", "2026-09-20");
    expect(fakeDb.state.daily_prices).toHaveLength(2);
  });
});

describe("ingestDailyPrices — never fabricates unavailable data", () => {
  it("provider unavailable (e.g. TXN subscription gate) writes nothing", async () => {
    const { ingestDailyPrices } = await import("../src/ingestion/ingestDailyPrices");
    const outcome = await ingestDailyPrices("company-2", { ticker: "TXN" }, makeMarketDataProvider(UNAVAILABLE), "2026-09-15", "2026-09-20");
    expect(outcome.status).toBe("unavailable");
    expect(outcome.rowsFetched).toBe(0);
    expect(outcome.rowsUpserted).toBe(0);
    expect(fakeDb.state.daily_prices).toHaveLength(0);
    expect(fakeDb.state.data_sources).toHaveLength(0);
  });
});
