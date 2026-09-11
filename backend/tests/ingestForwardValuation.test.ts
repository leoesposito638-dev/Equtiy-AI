// ============================================================================
// Tests: ingestForwardValuation persistence (Milestone 13H) — dedup/
// idempotency, deterministic Forward EPS selection end-to-end, and the
// "never fabricate" rule, against a small in-memory fake Supabase client
// (same style as ingestValuationData.test.ts): no real network/database
// call happens.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  EarningsProvider,
  EstimateRecord,
  LivePrice,
  MarketDataProvider,
  ProviderCompanyRef,
  ProviderResult,
  Quote,
  ValuationRatios,
} from "../src/providers/interfaces";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

type Row = Record<string, any>;
type TableName = "financial_metrics" | "estimates" | "data_sources" | "calculated_metrics";

function makeFakeDb(seed: { financial_metrics?: Row[] } = {}) {
  const state: Record<TableName, Row[]> = {
    financial_metrics: [...(seed.financial_metrics ?? [])],
    estimates: [],
    data_sources: [],
    calculated_metrics: [],
  };
  let idCounter = 1;

  function from(table: TableName) {
    let mode: "select" | "insert" = "select";
    let payload: Row | null = null;
    let singleMode = false;
    const eqFilters: Row = {};
    let orderField: string | null = null;
    let orderAscending = true;
    let limitN: number | null = null;

    const builder: any = {
      select(_cols: string) {
        // A post-insert `.insert(p).select("id")` chain (real Supabase
        // pattern, used by insertEstimatesDataSource) must NOT reset mode
        // back to "select" — only a select() called first (no prior
        // insert()) is a genuine read query.
        if (mode !== "insert") mode = "select";
        return builder;
      },
      eq(k: string, v: unknown) {
        eqFilters[k] = v;
        return builder;
      },
      order(field: string, opts: { ascending: boolean }) {
        orderField = field;
        orderAscending = opts.ascending;
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
          return resolve({ data: singleMode ? row : row, error: null });
        }
        let rows = state[table].filter((row) => Object.entries(eqFilters).every(([k, v]) => row[k] === v));
        if (orderField) {
          const f = orderField;
          rows = [...rows].sort((a, b) => (a[f] > b[f] ? 1 : a[f] < b[f] ? -1 : 0));
          if (!orderAscending) rows.reverse();
        }
        if (limitN != null) rows = rows.slice(0, limitN);
        return resolve({ data: rows, error: null });
      },
    };
    return builder;
  }

  return { from, state };
}

let fakeDb: ReturnType<typeof makeFakeDb>;

function seedLatestReportedPeriod(companyId: string, periodEnd: string) {
  fakeDb.state.financial_metrics.push({
    company_id: companyId,
    metric_name: "revenue",
    period_type: "ANNUAL",
    period_end: periodEnd,
    value: 1,
  });
}

function est(periodEnd: string, consensusValue: number | null, analystCount: number | null): EstimateRecord {
  return { metricName: "eps", estimatePeriodEnd: periodEnd, estimatePeriodType: "ANNUAL", consensusValue, analystCount };
}

function makeEarningsProvider(estimates: ProviderResult<EstimateRecord[]>): EarningsProvider {
  return {
    async getEarnings() {
      return { status: "unavailable", data: null, source: null, unavailableReason: "not implemented" };
    },
    async getEstimates(_ref: ProviderCompanyRef) {
      return estimates;
    },
  };
}

function makeMarketDataProvider(livePrice: ProviderResult<LivePrice>): MarketDataProvider {
  return {
    async getQuote(): Promise<ProviderResult<Quote>> {
      return { status: "unavailable", data: null, source: null };
    },
    async getHistoricalPrices() {
      return { status: "unavailable", data: null, source: null };
    },
    async getValuationRatios(): Promise<ProviderResult<ValuationRatios>> {
      return { status: "unavailable", data: null, source: null };
    },
    async getLivePrice(_ref: ProviderCompanyRef) {
      return livePrice;
    },
  };
}

const NVDA_ESTIMATES: EstimateRecord[] = [
  est("2027-01-25", 9.25503, 31),
  est("2026-01-25", 4.69388, 30),
  est("2028-01-25", 15.69607, 32),
];

const AVAILABLE_ESTIMATES: ProviderResult<EstimateRecord[]> = {
  status: "available",
  data: NVDA_ESTIMATES,
  source: { providerName: "Financial Modeling Prep", providerType: "FINANCIAL_API", sourceUrl: "https://example.com/analyst-estimates" },
};

const AVAILABLE_LIVE_PRICE: ProviderResult<LivePrice> = {
  status: "available",
  data: { price: 218.73, timestamp: "2026-09-10T15:56:27.000Z" },
  source: { providerName: "Financial Modeling Prep", providerType: "MARKET_DATA" },
};

const UNAVAILABLE: ProviderResult<any> = { status: "unavailable", data: null, source: null, unavailableReason: "not entitled" };

beforeEach(() => {
  fakeDb = makeFakeDb();
  dbClientMock.getDbClient.mockReturnValue(fakeDb);
});

describe("ingestForwardValuation — happy path", () => {
  it("stores all annual estimate rows, selects FY2027 (not FY2026, already reported), and stores forward_pe", async () => {
    const { ingestForwardValuation } = await import("../src/ingestion/ingestForwardValuation");
    seedLatestReportedPeriod("company-1", "2026-01-25");
    const outcome = await ingestForwardValuation(
      "company-1",
      { ticker: "NVDA" },
      makeEarningsProvider(AVAILABLE_ESTIMATES),
      makeMarketDataProvider(AVAILABLE_LIVE_PRICE)
    );

    expect(outcome.estimatesStored).toBe(3);
    expect(fakeDb.state.estimates).toHaveLength(3);
    expect(outcome.forwardEps.status).toBe("available");
    expect(outcome.forwardEps.periodEnd).toBe("2027-01-25");
    expect(outcome.forwardEps.value).toBe(9.25503);
    expect(outcome.livePrice.value).toBe(218.73);
    expect(outcome.forwardPe).toBe("stored");
    expect(outcome.forwardPeValue).toBeCloseTo(218.73 / 9.25503, 6);

    expect(fakeDb.state.calculated_metrics).toHaveLength(1);
    expect(fakeDb.state.calculated_metrics[0]).toMatchObject({
      company_id: "company-1",
      metric_name: "forward_pe",
      period_end: "2027-01-25",
      period_type: "ANNUAL",
    });
  });

  it("data_sources gets exactly one row for the whole estimates batch, referenced by every estimates row", async () => {
    const { ingestForwardValuation } = await import("../src/ingestion/ingestForwardValuation");
    seedLatestReportedPeriod("company-1", "2026-01-25");
    await ingestForwardValuation("company-1", { ticker: "NVDA" }, makeEarningsProvider(AVAILABLE_ESTIMATES), makeMarketDataProvider(AVAILABLE_LIVE_PRICE));
    expect(fakeDb.state.data_sources).toHaveLength(1);
    const sourceId = fakeDb.state.data_sources[0]!.id;
    expect(fakeDb.state.estimates.every((r: Row) => r.source_id === sourceId)).toBe(true);
  });
});

describe("ingestForwardValuation — idempotency / no duplicate rows", () => {
  it("re-running for the same company stores zero new estimates or forward_pe rows", async () => {
    const { ingestForwardValuation } = await import("../src/ingestion/ingestForwardValuation");
    seedLatestReportedPeriod("company-1", "2026-01-25");
    const provider = makeEarningsProvider(AVAILABLE_ESTIMATES);
    const marketData = makeMarketDataProvider(AVAILABLE_LIVE_PRICE);

    await ingestForwardValuation("company-1", { ticker: "NVDA" }, provider, marketData);
    const afterFirst = { estimates: fakeDb.state.estimates.length, calculated_metrics: fakeDb.state.calculated_metrics.length };

    const outcome2 = await ingestForwardValuation("company-1", { ticker: "NVDA" }, provider, marketData);

    expect(fakeDb.state.estimates).toHaveLength(afterFirst.estimates);
    expect(fakeDb.state.calculated_metrics).toHaveLength(afterFirst.calculated_metrics);
    expect(outcome2.estimatesStored).toBe(0);
    expect(outcome2.estimatesSkippedExisting).toBe(3);
    expect(outcome2.forwardPe).toBe("skipped_existing");
  });
});

describe("ingestForwardValuation — never fabricates unavailable data", () => {
  it("FMP-unavailable earnings provider (e.g. TXN/MA subscription gate) leaves forward EPS and forward_pe unavailable, stores nothing", async () => {
    const { ingestForwardValuation } = await import("../src/ingestion/ingestForwardValuation");
    seedLatestReportedPeriod("company-2", "2025-12-31");
    const outcome = await ingestForwardValuation("company-2", { ticker: "TXN" }, makeEarningsProvider(UNAVAILABLE), makeMarketDataProvider(AVAILABLE_LIVE_PRICE));

    expect(outcome.estimatesStatus).toBe("unavailable");
    expect(outcome.forwardEps.status).toBe("unavailable");
    expect(outcome.forwardPe).toBe("unavailable");
    expect(outcome.forwardPeValue).toBeNull();
    expect(fakeDb.state.estimates).toHaveLength(0);
    expect(fakeDb.state.calculated_metrics).toHaveLength(0);
  });

  it("GOOGL-shaped non-monotonic estimates: estimates are still persisted (raw facts), but forward_pe is never stored", async () => {
    const { ingestForwardValuation } = await import("../src/ingestion/ingestForwardValuation");
    seedLatestReportedPeriod("company-3", "2025-12-31");
    const googlEstimates: ProviderResult<EstimateRecord[]> = {
      status: "available",
      data: [est("2026-12-31", 20.56945, 41), est("2025-12-31", 10.63583, 37), est("2027-12-31", 15.08363, 42)],
      source: { providerName: "Financial Modeling Prep", providerType: "FINANCIAL_API" },
    };
    const outcome = await ingestForwardValuation("company-3", { ticker: "GOOGL" }, makeEarningsProvider(googlEstimates), makeMarketDataProvider(AVAILABLE_LIVE_PRICE));

    expect(fakeDb.state.estimates).toHaveLength(3); // raw facts stored as-is
    expect(outcome.forwardEps.status).toBe("unavailable");
    expect(outcome.forwardEps.value).toBeNull(); // never a "corrected" number
    expect(outcome.forwardPe).toBe("unavailable");
    expect(fakeDb.state.calculated_metrics).toHaveLength(0);
  });

  it("live price unavailable: forward_pe stays unavailable even though forward EPS was selected successfully", async () => {
    const { ingestForwardValuation } = await import("../src/ingestion/ingestForwardValuation");
    seedLatestReportedPeriod("company-4", "2026-01-25");
    const outcome = await ingestForwardValuation("company-4", { ticker: "NVDA" }, makeEarningsProvider(AVAILABLE_ESTIMATES), makeMarketDataProvider(UNAVAILABLE));

    expect(outcome.forwardEps.status).toBe("available");
    expect(outcome.livePrice.status).toBe("unavailable");
    expect(outcome.forwardPe).toBe("unavailable");
    expect(outcome.forwardPeValue).toBeNull();
    expect(fakeDb.state.calculated_metrics).toHaveLength(0);
  });

  it("no company_id in financial_metrics (never reported a fiscal year) -> unavailable, no estimates fetched pointlessly stored as 'latest'", async () => {
    const { ingestForwardValuation } = await import("../src/ingestion/ingestForwardValuation");
    // No seedLatestReportedPeriod call — financial_metrics has no row for this company.
    const outcome = await ingestForwardValuation("company-5", { ticker: "NVDA" }, makeEarningsProvider(AVAILABLE_ESTIMATES), makeMarketDataProvider(AVAILABLE_LIVE_PRICE));
    expect(outcome.latestReportedPeriodEnd).toBeNull();
    expect(outcome.forwardEps.status).toBe("unavailable");
    expect(outcome.forwardPe).toBe("unavailable");
    expect(fakeDb.state.estimates).toHaveLength(0);
  });
});
