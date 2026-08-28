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
