// ============================================================================
// Tests: FMP adapter — parsing, validation, and the "never fabricate" rule
// against a MOCKED fetch. No real network call, no real API key needed.
// This proves the adapter's own logic is correct; it does not (and cannot)
// prove FMP's live API behaves this way — that's what
// src/localDev/testFmpNvidiaRevenue.ts is for, run with real credentials.
// ============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { FmpFinancialDataAdapter } from "../src/providers/adapters/fmpAdapter";

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("FmpFinancialDataAdapter — construction", () => {
  it("throws if constructed with no API key", () => {
    expect(() => new FmpFinancialDataAdapter("")).toThrow();
  });
});

describe("FmpFinancialDataAdapter.getIncomeStatement — happy path", () => {
  it("maps a well-formed FMP row to a single revenue RawLineItem", async () => {
    mockFetchOnce(200, [
      { date: "2026-01-26", symbol: "NVDA", reportedCurrency: "USD", period: "FY", revenue: 130_497_000_000, fillingDate: "2026-02-20", cik: "0001045810" },
    ]);
    const adapter = new FmpFinancialDataAdapter("test-key");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");

    expect(result.status).toBe("available");
    expect(result.data).toHaveLength(1);
    expect(result.data![0]).toMatchObject({
      metricName: "revenue", rawValue: 130_497_000_000, currency: "USD", periodEnd: "2026-01-26", periodType: "ANNUAL",
    });
    expect(result.source?.providerName).toBe("Financial Modeling Prep");
    expect(result.source?.providerType).toBe("FINANCIAL_API");
  });

  it("never includes the API key in the returned source URL", async () => {
    mockFetchOnce(200, [{ date: "2026-01-26", reportedCurrency: "USD", period: "FY", revenue: 100 }]);
    const adapter = new FmpFinancialDataAdapter("super-secret-key");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.source?.sourceUrl).not.toContain("super-secret-key");
    expect(result.source?.sourceUrl).not.toContain("apikey");
  });
});

describe("FmpFinancialDataAdapter.getIncomeStatement — multi-metric, multi-period (Milestone 2: GROWTH raw data)", () => {
  it("maps revenue, net_income, and eps from a single row into three RawLineItems", async () => {
    mockFetchOnce(200, [
      { date: "2026-01-26", reportedCurrency: "USD", period: "FY", revenue: 130_497_000_000, netIncome: 72_880_000_000, eps: 2.94, fillingDate: "2026-02-20" },
    ]);
    const adapter = new FmpFinancialDataAdapter("test-key");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");

    expect(result.status).toBe("available");
    expect(result.data).toHaveLength(3);
    const byMetric = Object.fromEntries(result.data!.map((i) => [i.metricName, i]));
    expect(byMetric.revenue).toMatchObject({ rawValue: 130_497_000_000, unit: "USD", periodEnd: "2026-01-26" });
    expect(byMetric.net_income).toMatchObject({ rawValue: 72_880_000_000, unit: "USD", periodEnd: "2026-01-26" });
    expect(byMetric.eps).toMatchObject({ rawValue: 2.94, unit: "USD_PER_SHARE", periodEnd: "2026-01-26" });
  });

  it("requests up to 4 trailing periods and maps line items across all of them", async () => {
    mockFetchOnce(200, [
      { date: "2026-01-26", reportedCurrency: "USD", period: "FY", revenue: 130, netIncome: 72, eps: 2.9 },
      { date: "2025-01-26", reportedCurrency: "USD", period: "FY", revenue: 96, netIncome: 50, eps: 2.0 },
      { date: "2024-01-28", reportedCurrency: "USD", period: "FY", revenue: 26, netIncome: 9, eps: 0.4 },
      { date: "2023-01-29", reportedCurrency: "USD", period: "FY", revenue: 26, netIncome: 4, eps: 0.17 },
    ]);
    const adapter = new FmpFinancialDataAdapter("test-key");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");

    expect(result.status).toBe("available");
    expect(result.data).toHaveLength(12); // 4 periods x 3 metrics
    const periodEnds = new Set(result.data!.map((i) => i.periodEnd));
    expect(periodEnds).toEqual(new Set(["2026-01-26", "2025-01-26", "2024-01-28", "2023-01-29"]));
    // request URL asked FMP for 4 periods, not just 1
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0]![0]).toContain("limit=4");
  });

  it("a row missing one metric still yields line items for the metrics it does have", async () => {
    mockFetchOnce(200, [
      { date: "2026-01-26", reportedCurrency: "USD", period: "FY", revenue: 130_497_000_000, netIncome: 72_880_000_000 /* no eps */ },
    ]);
    const adapter = new FmpFinancialDataAdapter("test-key");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");

    expect(result.status).toBe("available");
    expect(result.data).toHaveLength(2);
    expect(result.data!.map((i) => i.metricName).sort()).toEqual(["net_income", "revenue"]);
  });

  it("a structurally-broken row is skipped without blocking metrics from other valid rows", async () => {
    mockFetchOnce(200, [
      { date: "2026-01-26", reportedCurrency: "USD", period: "FY", revenue: 130, netIncome: 72, eps: 2.9 },
      { date: "2025-01-26", /* missing reportedCurrency */ period: "FY", revenue: 96, netIncome: 50, eps: 2.0 },
    ]);
    const adapter = new FmpFinancialDataAdapter("test-key");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");

    expect(result.status).toBe("available");
    expect(result.data).toHaveLength(3); // only the first row's 3 metrics
    expect(result.data!.every((i) => i.periodEnd === "2026-01-26")).toBe(true);
  });
});

describe("FmpFinancialDataAdapter.getIncomeStatement — never fabricates", () => {
  it("returns unavailable (not a fabricated 0) when FMP returns an empty array", async () => {
    mockFetchOnce(200, []);
    const adapter = new FmpFinancialDataAdapter("test-key");
    const result = await adapter.getIncomeStatement({ ticker: "UNKNOWNTICKER" }, "ANNUAL");
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
    expect(result.unavailableReason).toBeTruthy();
  });

  it("returns unavailable when the revenue field is missing", async () => {
    mockFetchOnce(200, [{ date: "2026-01-26", reportedCurrency: "USD", period: "FY" }]);
    const adapter = new FmpFinancialDataAdapter("test-key");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("revenue");
  });

  it("returns unavailable when currency is missing rather than assuming USD", async () => {
    mockFetchOnce(200, [{ date: "2026-01-26", period: "FY", revenue: 100 }]);
    const adapter = new FmpFinancialDataAdapter("test-key");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("reportedCurrency");
  });

  it("returns unavailable on an HTTP error status", async () => {
    mockFetchOnce(429, { error: "Too many requests" });
    const adapter = new FmpFinancialDataAdapter("test-key");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("429");
  });

  it("refuses to mislabel a mismatched period (defensive check against FMP's own period field)", async () => {
    mockFetchOnce(200, [{ date: "2026-01-26", reportedCurrency: "USD", period: "Q1", revenue: 100 }]);
    const adapter = new FmpFinancialDataAdapter("test-key");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("period");
  });

  it("returns unavailable for TTM (not yet implemented) rather than silently approximating one", async () => {
    const adapter = new FmpFinancialDataAdapter("test-key");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "TTM");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("TTM");
  });
});

describe("FmpFinancialDataAdapter — balance sheet / cash flow not yet implemented", () => {
  it("getBalanceSheet returns an honest unavailable, not empty data", async () => {
    const adapter = new FmpFinancialDataAdapter("test-key");
    const result = await adapter.getBalanceSheet({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("unavailable");
  });
  it("getCashFlow returns an honest unavailable, not empty data", async () => {
    const adapter = new FmpFinancialDataAdapter("test-key");
    const result = await adapter.getCashFlow({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("unavailable");
  });
});
