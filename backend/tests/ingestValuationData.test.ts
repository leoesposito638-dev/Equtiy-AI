// ============================================================================
// Tests: ingestValuationData persistence — dedup/idempotency and the
// "never fabricate" rule, against a small in-memory fake Supabase client
// (same style as supabaseScoringRepoPersistence.test.ts: no real network/
// database call). Proves re-running ingestion for the same company/period
// never produces a duplicate row, and that an unavailable provider result
// never gets silently coerced into a stored zero.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MarketDataProvider, ProviderCompanyRef, ProviderResult, Quote, ValuationRatios } from "../src/providers/interfaces";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

type Row = Record<string, any>;
type TableName = "market_data" | "calculated_metrics";

/** Simulates calculated_metrics' real unique constraint
 *  (company_id, metric_name, period_end, period_type, calculation_version)
 *  by rejecting a matching second insert with a 23505-shaped error — same
 *  contract the real Supabase client returns, so insertCalculatedMetric's
 *  own 23505 handling is exercised for real, not assumed. */
function makeFakeDb() {
  const state: Record<TableName, Row[]> = { market_data: [], calculated_metrics: [] };
  let idCounter = 1;

  function from(table: TableName) {
    let payload: Row | null = null;
    let mode: "select" | "insert" = "select";
    const eqFilters: Row = {};
    let limitN: number | null = null;

    const builder: any = {
      select(_cols: string) {
        mode = "select";
        return builder;
      },
      eq(k: string, v: unknown) {
        eqFilters[k] = v;
        return builder;
      },
      limit(n: number) {
        limitN = n;
        return builder;
      },
      insert(p: Row) {
        mode = "insert";
        payload = p;
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
        let rows = state[table].filter((row) => Object.entries(eqFilters).every(([k, v]) => row[k] === v));
        if (limitN != null) rows = rows.slice(0, limitN);
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

function makeProvider(quote: ProviderResult<Quote>, ratios: ProviderResult<ValuationRatios>): MarketDataProvider {
  return {
    async getQuote(_ref: ProviderCompanyRef) {
      return quote;
    },
    async getHistoricalPrices() {
      return { status: "unavailable", data: null, source: null };
    },
    async getValuationRatios(_ref: ProviderCompanyRef) {
      return ratios;
    },
  };
}

const AVAILABLE_QUOTE: ProviderResult<Quote> = {
  status: "available",
  data: { price: 186.47, marketCap: 4_542_222_730_000, volume: null, sharesOutstanding: 24_359_000_000, high52w: null, low52w: null, enterpriseValue: 4_543_029_730_000, timestamp: "2026-01-25" },
  source: { providerName: "Financial Modeling Prep", providerType: "MARKET_DATA", sourceUrl: "https://example.com/ev" },
};

const AVAILABLE_RATIOS: ProviderResult<ValuationRatios> = {
  status: "available",
  data: { pe: 27.4, evToEbitda: 22.7, evToSales: 17.5, priceToFcf: 41.7, fcfYield: 0.024 },
  source: { providerName: "Financial Modeling Prep", providerType: "MARKET_DATA", sourceUrl: "https://example.com/ratios" },
};

const UNAVAILABLE: ProviderResult<any> = { status: "unavailable", data: null, source: null, unavailableReason: "not entitled" };

describe("ingestValuationData — happy path", () => {
  it("stores one market_data row and 6 calculated_metrics rows (enterprise_value + 5 ratios) for a fully-available company", async () => {
    const { ingestValuationData } = await import("../src/ingestion/ingestValuationData");
    const provider = makeProvider(AVAILABLE_QUOTE, AVAILABLE_RATIOS);
    const outcome = await ingestValuationData("company-1", { ticker: "NVDA" }, provider);

    expect(outcome.quote).toBe("stored");
    expect(outcome.enterpriseValue).toBe("stored");
    expect(outcome.ratios.pe).toBe("stored");
    expect(outcome.ratios.ev_ebitda).toBe("stored");
    expect(outcome.ratios.ev_sales).toBe("stored");
    expect(outcome.ratios.price_to_fcf).toBe("stored");
    expect(outcome.ratios.fcf_yield).toBe("stored");

    expect(fakeDb.state.market_data).toHaveLength(1);
    expect(fakeDb.state.market_data[0]).toMatchObject({ company_id: "company-1", price: 186.47, market_cap: 4_542_222_730_000, shares_outstanding: 24_359_000_000 });
    expect(fakeDb.state.calculated_metrics).toHaveLength(6);
  });
});

describe("ingestValuationData — idempotency / no duplicate rows", () => {
  it("re-running for the same company produces zero new rows the second time", async () => {
    const { ingestValuationData } = await import("../src/ingestion/ingestValuationData");
    const provider = makeProvider(AVAILABLE_QUOTE, AVAILABLE_RATIOS);

    await ingestValuationData("company-1", { ticker: "NVDA" }, provider);
    const afterFirst = { market_data: fakeDb.state.market_data.length, calculated_metrics: fakeDb.state.calculated_metrics.length };

    const outcome2 = await ingestValuationData("company-1", { ticker: "NVDA" }, provider);

    expect(fakeDb.state.market_data).toHaveLength(afterFirst.market_data);
    expect(fakeDb.state.calculated_metrics).toHaveLength(afterFirst.calculated_metrics);
    expect(outcome2.quote).toBe("skipped_existing");
    expect(outcome2.enterpriseValue).toBe("skipped_existing");
    expect(outcome2.ratios.pe).toBe("skipped_existing");
  });
});

describe("ingestValuationData — never fabricates unavailable data", () => {
  it("an unavailable quote stores nothing for market_data or enterprise_value — never a zero, never a guess", async () => {
    const { ingestValuationData } = await import("../src/ingestion/ingestValuationData");
    const provider = makeProvider(UNAVAILABLE, AVAILABLE_RATIOS);
    const outcome = await ingestValuationData("company-2", { ticker: "IBM" }, provider);

    expect(outcome.quote).toBe("unavailable");
    expect(outcome.enterpriseValue).toBe("unavailable");
    expect(fakeDb.state.market_data.filter((r) => r.company_id === "company-2")).toHaveLength(0);
    expect(fakeDb.state.calculated_metrics.filter((r) => r.company_id === "company-2" && r.metric_name === "enterprise_value")).toHaveLength(0);
  });

  it("unavailable ratios store nothing for any of the 5 ratio metrics", async () => {
    const { ingestValuationData } = await import("../src/ingestion/ingestValuationData");
    const provider = makeProvider(AVAILABLE_QUOTE, UNAVAILABLE);
    const outcome = await ingestValuationData("company-3", { ticker: "IBM" }, provider);

    expect(Object.values(outcome.ratios)).toEqual(["unavailable", "unavailable", "unavailable", "unavailable", "unavailable"]);
    expect(fakeDb.state.calculated_metrics.filter((r) => r.company_id === "company-3" && r.metric_name !== "enterprise_value")).toHaveLength(0);
  });

  it("a ratio field the provider didn't return (null) is never stored, not even as 0", async () => {
    const { ingestValuationData } = await import("../src/ingestion/ingestValuationData");
    const partialRatios: ProviderResult<ValuationRatios> = {
      status: "available",
      data: { pe: 27.4, evToEbitda: null, evToSales: null, priceToFcf: null, fcfYield: null },
      source: { providerName: "Financial Modeling Prep", providerType: "MARKET_DATA" },
    };
    const provider = makeProvider(AVAILABLE_QUOTE, partialRatios);
    const outcome = await ingestValuationData("company-4", { ticker: "NVDA" }, provider);

    expect(outcome.ratios.pe).toBe("stored");
    expect(outcome.ratios.ev_ebitda).toBe("unavailable");
    expect(fakeDb.state.calculated_metrics.filter((r) => r.company_id === "company-4" && r.metric_name === "ev_ebitda")).toHaveLength(0);
    expect(fakeDb.state.calculated_metrics.filter((r) => r.company_id === "company-4" && r.metric_name === "pe")).toHaveLength(1);
  });
});
