// ============================================================================
// Tests: SEC EDGAR adapter — parsing, CIK resolution, concept fallback,
// restatement/dedup handling, and the "never fabricate" rule, against a
// MOCKED fetch. No real network call. This proves the adapter's own logic
// is correct; it does not (and cannot) prove SEC's live API behaves this
// way — that's what src/localDev/verifySecEdgarAdapter.ts is for, run
// read-only against the real SEC API (see Milestone 7B report).
// ============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { SecEdgarAdapter } from "../src/providers/adapters/secEdgarAdapter";

const TICKER_MAP_FIXTURE = {
  "0": { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" },
  "1": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
};

/** Routes each fetch call by a distinctive URL substring — SecEdgarAdapter
 *  makes multiple different requests per getIncomeStatement() call (ticker
 *  map, up to 2 revenue concept attempts, net income, eps), unlike FMP's
 *  single-request adapter, so a single fixed mock response isn't enough. */
function mockRoutedFetch(routes: Record<string, { status: number; body: unknown }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      for (const [pattern, response] of Object.entries(routes)) {
        if (url.includes(pattern)) {
          return {
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            json: async () => response.body,
            text: async () => JSON.stringify(response.body),
          };
        }
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => "not found" };
    })
  );
}

function factsBody(unitsKey: "USD" | "USD/shares", facts: unknown[]) {
  return { units: { [unitsKey]: facts } };
}

afterEach(() => vi.unstubAllGlobals());

describe("SecEdgarAdapter — construction", () => {
  it("throws if constructed with no User-Agent", () => {
    expect(() => new SecEdgarAdapter("")).toThrow();
  });
});

describe("SecEdgarAdapter — CIK lookup (test 11)", () => {
  it("resolves a ticker to its CIK via SEC's authoritative mapping, zero-padded to 10 digits", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "CIK0001045810/us-gaap/Revenues.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 215_938_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("available");
    expect(result.data!.some((i) => i.metricName === "revenue" && i.rawValue === 215_938_000_000)).toBe(true);
  });

  it("returns unavailable, not a guess, for a ticker absent from SEC's mapping", async () => {
    mockRoutedFetch({ "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE } });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NOTAREALTICKER" }, "ANNUAL");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("not found");
  });
});

describe("SecEdgarAdapter — revenue concept fallback (tests 1, 2, 7)", () => {
  it("test 1: uses us-gaap:Revenues when it has real annual data", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 215_938_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    const revenue = result.data!.find((i) => i.metricName === "revenue");
    expect(revenue?.rawValue).toBe(215_938_000_000);
    expect(revenue?.metricIdentifier).toBe("sec.us-gaap.Revenues");
  });

  it("test 2: falls back to RevenueFromContractWithCustomerExcludingAssessedTax when Revenues has no data", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 200, body: factsBody("USD", [
        { start: "2024-09-29", end: "2025-09-27", val: 416_161_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2025-10-31" },
      ]) },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "AAPL" }, "ANNUAL");
    const revenue = result.data!.find((i) => i.metricName === "revenue");
    expect(revenue?.rawValue).toBe(416_161_000_000);
    expect(revenue?.metricIdentifier).toBe("sec.us-gaap.RevenueFromContractWithCustomerExcludingAssessedTax");
  });

  it("test 7: unavailable (not fabricated) when neither revenue concept exists", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });
});

describe("SecEdgarAdapter — net income and EPS (tests 3, 4)", () => {
  it("test 3: maps us-gaap:NetIncomeLoss to net_income", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 120_067_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    const netIncome = result.data!.find((i) => i.metricName === "net_income");
    expect(netIncome).toMatchObject({ rawValue: 120_067_000_000, unit: "USD", periodEnd: "2026-01-25" });
  });

  it("test 4: maps us-gaap:EarningsPerShareBasic to eps with USD_PER_SHARE unit", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 200, body: factsBody("USD/shares", [
        { start: "2025-01-27", end: "2026-01-25", val: 4.93, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    const eps = result.data!.find((i) => i.metricName === "eps");
    expect(eps).toMatchObject({ rawValue: 4.93, unit: "USD_PER_SHARE", periodEnd: "2026-01-25" });
  });
});

describe("SecEdgarAdapter — duplicate periods and restatement handling (tests 5, 6)", () => {
  it("test 5 + 6: the same period appearing in two filings resolves to the most-recently-filed value, not the first match", async () => {
    // Mirrors NVDA's real FY2024 EPS restatement (10-for-1 split): 12.05 as
    // originally filed, 1.21 in every later filing. Fixture intentionally
    // lists the LATER (correct) value FIRST in the array to prove the
    // adapter isn't just taking array[0] or the earliest `filed` date.
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": {
        status: 200,
        body: factsBody("USD/shares", [
          { start: "2024-01-29", end: "2025-01-26", val: 1.21, fy: 2025, fp: "FY", form: "10-K", filed: "2025-02-26" },
          { start: "2023-01-30", end: "2024-01-28", val: 1.21, fy: 2025, fp: "FY", form: "10-K", filed: "2025-02-26" }, // restated, filed LATER
          { start: "2023-01-30", end: "2024-01-28", val: 12.05, fy: 2024, fp: "FY", form: "10-K", filed: "2024-02-21" }, // original filing
        ]),
      },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    const epsForRestatedPeriod = result.data!.find((i) => i.metricName === "eps" && i.periodEnd === "2024-01-28");
    expect(epsForRestatedPeriod?.rawValue).toBe(1.21); // NOT 12.05
    // exactly one line item for this period+metric — duplicates collapsed, not summed/averaged
    expect(result.data!.filter((i) => i.metricName === "eps" && i.periodEnd === "2024-01-28")).toHaveLength(1);
  });
});

describe("SecEdgarAdapter — fiscal-year filtering (test 10)", () => {
  it("excludes 10-Q / non-FY facts even when they share the same concept and units", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": {
        status: 200,
        body: factsBody("USD", [
          { start: "2025-01-27", end: "2026-01-25", val: 215_938_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
          { start: "2026-04-27", end: "2026-07-26", val: 96_221_000_000, fy: 2027, fp: "Q2", form: "10-Q", filed: "2026-08-26" },
        ]),
      },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    const revenueFacts = result.data!.filter((i) => i.metricName === "revenue");
    expect(revenueFacts).toHaveLength(1);
    expect(revenueFacts[0]!.periodEnd).toBe("2026-01-25"); // the 10-Q entry never appears
  });
});

describe("SecEdgarAdapter — negative values and missing periods (tests 8, 9)", () => {
  it("test 9: preserves a real, legitimate negative value (e.g. a net loss) rather than nulling or flipping it", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-01", end: "2025-12-31", val: -523_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-15" },
      ]) },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    const netIncome = result.data!.find((i) => i.metricName === "net_income");
    expect(netIncome?.rawValue).toBe(-523_000_000);
  });

  it("test 8: unavailable, not zero, when a concept exists but has zero annual (10-K/FY) periods", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": {
        status: 200,
        body: factsBody("USD", [{ start: "2026-04-27", end: "2026-07-26", val: 1, fy: 2027, fp: "Q2", form: "10-Q", filed: "2026-08-26" }]),
      },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("unavailable"); // no revenue, no annual net income, no eps at all
  });
});

describe("SecEdgarAdapter — general never-fabricate behavior", () => {
  it("returns unavailable for QUARTER period_type (not implemented this milestone)", async () => {
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "QUARTER");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("ANNUAL");
  });

  it("getBalanceSheet returns an honest unavailable, not empty data", async () => {
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getBalanceSheet({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("unavailable");
  });

  it("getCashFlow returns an honest unavailable, not empty data", async () => {
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getCashFlow({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("unavailable");
  });

  it("source.sourceUrl never contains the User-Agent value", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 1, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("Very-Secret-Identifying-String contact@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.source?.sourceUrl).not.toContain("Very-Secret-Identifying-String");
  });
});
