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

describe("SecEdgarAdapter — revenue CONCEPT SELECTION prefers the current series (Milestone 9B)", () => {
  it("A: chooses the current alternate concept when Revenues has only stale historical facts", async () => {
    // Mirrors the real AAPL pattern found in Milestone 9A: `Revenues` still
    // has old, frozen annual facts (~2018) while
    // `RevenueFromContractWithCustomerExcludingAssessedTax` carries the
    // actual current series.
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": {
        status: 200,
        body: factsBody("USD", [
          { start: "2016-09-25", end: "2017-09-30", val: 229_234_000_000, fy: 2017, fp: "FY", form: "10-K", filed: "2017-11-03" },
          { start: "2017-09-30", end: "2018-09-29", val: 265_595_000_000, fy: 2018, fp: "FY", form: "10-K", filed: "2018-11-05" },
        ]),
      },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": {
        status: 200,
        body: factsBody("USD", [
          { start: "2022-09-25", end: "2023-09-30", val: 383_285_000_000, fy: 2023, fp: "FY", form: "10-K", filed: "2023-11-03" },
          { start: "2023-10-01", end: "2024-09-28", val: 391_035_000_000, fy: 2024, fp: "FY", form: "10-K", filed: "2024-11-01" },
          { start: "2024-09-29", end: "2025-09-27", val: 416_161_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2025-10-31" },
        ]),
      },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "AAPL" }, "ANNUAL");
    const revenueItems = result.data!.filter((i) => i.metricName === "revenue");
    // Must come from the current concept, not the stale one.
    expect(revenueItems.every((i) => i.metricIdentifier === "sec.us-gaap.RevenueFromContractWithCustomerExcludingAssessedTax")).toBe(true);
    expect(revenueItems.some((i) => i.periodEnd === "2025-09-27")).toBe(true);
    expect(revenueItems.some((i) => i.periodEnd === "2018-09-29")).toBe(false); // stale period must NOT appear
  });

  it("B: stays on Revenues when IT is the current series (no incorrect switch)", async () => {
    // NVDA/TXN/IBM pattern: Revenues itself is current; the alternate
    // concept has no data at all. Must not regress to picking nothing or
    // switching away from a concept that is already correct.
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": {
        status: 200,
        body: factsBody("USD", [
          { start: "2024-01-01", end: "2024-12-31", val: 100, fy: 2024, fp: "FY", form: "10-K", filed: "2025-02-01" },
          { start: "2025-01-01", end: "2025-12-31", val: 110, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" },
        ]),
      },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    const revenueItems = result.data!.filter((i) => i.metricName === "revenue");
    expect(revenueItems.every((i) => i.metricIdentifier === "sec.us-gaap.Revenues")).toBe(true);
    expect(revenueItems.some((i) => i.periodEnd === "2025-12-31")).toBe(true);
  });

  it("C: a company with only Revenues (alternate concept unavailable) continues to work", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 215_938_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("available");
    const revenue = result.data!.find((i) => i.metricName === "revenue");
    expect(revenue).toMatchObject({ rawValue: 215_938_000_000, metricIdentifier: "sec.us-gaap.Revenues" });
  });

  it("D: a company with only RevenueFromContractWithCustomerExcludingAssessedTax continues to work", async () => {
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
    expect(result.status).toBe("available");
    const revenue = result.data!.find((i) => i.metricName === "revenue");
    expect(revenue).toMatchObject({ rawValue: 416_161_000_000, metricIdentifier: "sec.us-gaap.RevenueFromContractWithCustomerExcludingAssessedTax" });
  });

  it("E: restatement handling (most-recently-filed wins) still applies within the selected concept", async () => {
    // Same period appears twice under the CURRENT (selected) concept, once
    // original and once restated — the restated (later-filed) value must win,
    // exactly as before this milestone, now proven specifically on the
    // concept-selection path.
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 200, body: factsBody("USD", [
        { start: "2016-01-01", end: "2016-12-31", val: 1, fy: 2016, fp: "FY", form: "10-K", filed: "2017-01-01" }, // stale
      ]) },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": {
        status: 200,
        body: factsBody("USD", [
          { start: "2025-01-01", end: "2025-12-31", val: 999, fy: 2025, fp: "FY", form: "10-K", filed: "2025-02-01" }, // original
          { start: "2025-01-01", end: "2025-12-31", val: 1_050, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" }, // restated, filed later
        ]),
      },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "AAPL" }, "ANNUAL");
    const revenueItems = result.data!.filter((i) => i.metricName === "revenue" && i.periodEnd === "2025-12-31");
    expect(revenueItems).toHaveLength(1);
    expect(revenueItems[0]!.rawValue).toBe(1_050); // restated value, not the original 999
  });

  it("F: returns the expected RawLineItem shape on the concept-selection path", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 200, body: factsBody("USD", [
        { start: "2024-09-29", end: "2025-09-27", val: 416_161_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2025-10-31", accn: "0000320193-25-000123" },
      ]) },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "AAPL" }, "ANNUAL");
    const revenue = result.data!.find((i) => i.metricName === "revenue")!;
    expect(revenue).toEqual({
      metricName: "revenue",
      metricIdentifier: "sec.us-gaap.RevenueFromContractWithCustomerExcludingAssessedTax",
      rawValue: 416_161_000_000,
      unit: "USD",
      currency: "USD",
      periodStart: "2024-09-29",
      periodEnd: "2025-09-27",
      periodType: "ANNUAL",
      filingDate: "2025-10-31",
    });
    expect(result.source?.providerName).toBe("SEC EDGAR");
    expect(result.source?.providerType).toBe("SEC");
  });

  it("G: net_income and eps mapping are unaffected by revenue concept selection", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 200, body: factsBody("USD", [
        { start: "2016-01-01", end: "2017-12-31", val: 1, fy: 2017, fp: "FY", form: "10-K", filed: "2018-01-01" },
      ]) },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 200, body: factsBody("USD", [
        { start: "2024-09-29", end: "2025-09-27", val: 416_161_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2025-10-31" },
      ]) },
      "NetIncomeLoss.json": { status: 200, body: factsBody("USD", [
        { start: "2024-09-29", end: "2025-09-27", val: 93_736_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2025-10-31" },
      ]) },
      "EarningsPerShareBasic.json": { status: 200, body: factsBody("USD/shares", [
        { start: "2024-09-29", end: "2025-09-27", val: 6.11, fy: 2025, fp: "FY", form: "10-K", filed: "2025-10-31" },
      ]) },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "AAPL" }, "ANNUAL");
    expect(result.data!.find((i) => i.metricName === "net_income")).toMatchObject({ rawValue: 93_736_000_000, unit: "USD" });
    expect(result.data!.find((i) => i.metricName === "eps")).toMatchObject({ rawValue: 6.11, unit: "USD_PER_SHARE" });
  });
});

describe("SecEdgarAdapter — revenue concept selection extended to RevenuesNetOfInterestExpense (Milestone 9D)", () => {
  it("chooses RevenuesNetOfInterestExpense when Revenues is stale — the WFC/MS pattern", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 200, body: factsBody("USD", [
        { start: "2018-01-01", end: "2018-12-31", val: 85_063_000_000, fy: 2018, fp: "FY", form: "10-K", filed: "2019-02-27" },
      ]) },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "RevenuesNetOfInterestExpense.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-01", end: "2025-12-31", val: 83_699_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-24" },
      ]) },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    const revenue = result.data!.find((i) => i.metricName === "revenue");
    expect(revenue).toMatchObject({ rawValue: 83_699_000_000, metricIdentifier: "sec.us-gaap.RevenuesNetOfInterestExpense" });
  });

  it("keeps Revenues selected when it is already current, even with all three concepts present", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-01", end: "2025-12-31", val: 182_447_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-13" },
      ]) },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "RevenuesNetOfInterestExpense.json": { status: 200, body: factsBody("USD", [
        { start: "2024-01-01", end: "2024-12-31", val: 170_000_000_000, fy: 2024, fp: "FY", form: "10-K", filed: "2025-02-13" },
      ]) },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "AAPL" }, "ANNUAL");
    const revenue = result.data!.find((i) => i.metricName === "revenue");
    expect(revenue).toMatchObject({ rawValue: 182_447_000_000, metricIdentifier: "sec.us-gaap.Revenues" });
  });

  it("works when RevenuesNetOfInterestExpense is the only concept with any data", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "RevenuesNetOfInterestExpense.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-01", end: "2025-12-31", val: 70_645_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-19" },
      ]) },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("available");
    const revenue = result.data!.find((i) => i.metricName === "revenue");
    expect(revenue).toMatchObject({ rawValue: 70_645_000_000, metricIdentifier: "sec.us-gaap.RevenuesNetOfInterestExpense" });
  });
});

describe("SecEdgarAdapter — net income concept fallback (Milestone 9D)", () => {
  it("chooses ProfitLoss when NetIncomeLoss is stale — the MA/CAT pattern", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 200, body: factsBody("USD", [
        { start: "2013-01-01", end: "2013-12-31", val: 3_116_000_000, fy: 2013, fp: "FY", form: "10-K", filed: "2014-02-14" },
      ]) },
      "ProfitLoss.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-01", end: "2025-12-31", val: 14_968_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-11" },
      ]) },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    const netIncome = result.data!.find((i) => i.metricName === "net_income");
    expect(netIncome).toMatchObject({ rawValue: 14_968_000_000, metricIdentifier: "sec.us-gaap.ProfitLoss" });
  });

  it("keeps NetIncomeLoss selected when it is already current", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 120_067_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "ProfitLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    const netIncome = result.data!.find((i) => i.metricName === "net_income");
    expect(netIncome).toMatchObject({ rawValue: 120_067_000_000, metricIdentifier: "sec.us-gaap.NetIncomeLoss" });
  });

  it("works when only NetIncomeLoss has any data", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-01", end: "2025-12-31", val: 500, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" },
      ]) },
      "ProfitLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.data!.find((i) => i.metricName === "net_income")).toMatchObject({ rawValue: 500, metricIdentifier: "sec.us-gaap.NetIncomeLoss" });
  });

  it("works when only ProfitLoss has any data", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "ProfitLoss.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-01", end: "2025-12-31", val: 8_882_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-13" },
      ]) },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "AAPL" }, "ANNUAL");
    expect(result.data!.find((i) => i.metricName === "net_income")).toMatchObject({ rawValue: 8_882_000_000, metricIdentifier: "sec.us-gaap.ProfitLoss" });
  });
});

describe("SecEdgarAdapter — genuine annual-period span validation (Milestone 9D)", () => {
  it("rejects a 90-day quarterly fact incorrectly tagged form=10-K/fp=FY — the HON pattern", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": {
        status: 200,
        body: factsBody("USD", [
          // Real annual fact for 2024 — must survive.
          { start: "2024-01-01", end: "2024-12-31", val: 38_498_000_000, fy: 2024, fp: "FY", form: "10-K", filed: "2025-02-14" },
          // Quarterly supplementary facts disclosed WITHIN the 10-K, tagged
          // with the same form/fp as the filing itself — must be excluded.
          { start: "2025-01-01", end: "2025-03-31", val: 8_925_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-17" },
          { start: "2025-04-01", end: "2025-06-30", val: 9_322_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-17" },
          { start: "2025-07-01", end: "2025-09-30", val: 9_437_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-17" },
          // The real FY2025 annual fact — must be the one selected as most recent.
          { start: "2025-01-01", end: "2025-12-31", val: 37_442_000_000, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-17" },
        ]),
      },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    const revenueItems = result.data!.filter((i) => i.metricName === "revenue").sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
    expect(revenueItems.map((i) => i.periodEnd)).toEqual(["2024-12-31", "2025-12-31"]);
    expect(revenueItems.every((i) => {
      const days = Math.round((new Date(i.periodEnd).getTime() - new Date(i.periodStart!).getTime()) / 86400000);
      return days >= 340 && days <= 390;
    })).toBe(true);
  });

  it("rejects other clearly short periods (e.g. a ~180-day half-year fact)", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-01", end: "2025-06-30", val: 999, fy: 2025, fp: "FY", form: "10-K", filed: "2025-08-01" }, // ~180 days
      ]) },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "RevenuesNetOfInterestExpense.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("unavailable"); // no genuinely-annual revenue at all
  });

  it("accepts a normal ~365-day annual period", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-01", end: "2025-12-31", val: 100, fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-15" },
      ]) },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("available");
    expect(result.data!.find((i) => i.metricName === "revenue")?.rawValue).toBe(100);
  });

  it("accepts a legitimate 52/53-week fiscal year (e.g. ~371 days)", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 200, body: factsBody("USD", [
        { start: "2024-09-30", end: "2025-10-05", val: 100, fy: 2025, fp: "FY", form: "10-K", filed: "2025-11-15" }, // 371 days, a real 53-week year
      ]) },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("available");
    expect(result.data!.find((i) => i.metricName === "revenue")?.rawValue).toBe(100);
  });

  it("restatement selection (most-recently-filed wins) still applies after span filtering", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 404, body: {} },
      "RevenueFromContractWithCustomerExcludingAssessedTax.json": { status: 404, body: {} },
      "NetIncomeLoss.json": { status: 404, body: {} },
      "EarningsPerShareBasic.json": {
        status: 200,
        body: factsBody("USD/shares", [
          // A short, non-annual fact sharing the same end date — must be
          // excluded from consideration entirely, not just outvoted.
          { start: "2024-10-29", end: "2025-01-26", val: 999, fy: 2025, fp: "FY", form: "10-K", filed: "2025-03-01" },
          // The two genuinely-annual candidates for the same period — the
          // later-filed (restated) one must still win.
          { start: "2024-01-29", end: "2025-01-26", val: 12.05, fy: 2024, fp: "FY", form: "10-K", filed: "2024-02-21" },
          { start: "2024-01-29", end: "2025-01-26", val: 1.21, fy: 2025, fp: "FY", form: "10-K", filed: "2025-02-26" },
        ]),
      },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    const epsItems = result.data!.filter((i) => i.metricName === "eps" && i.periodEnd === "2025-01-26");
    expect(epsItems).toHaveLength(1);
    expect(epsItems[0]!.rawValue).toBe(1.21); // restated value wins, not 12.05 and not the 999 stub
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

  it("getBalanceSheet returns an honest unavailable when no concept has any real data (Milestone 12B)", async () => {
    mockRoutedFetch({ "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE } });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getBalanceSheet({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("unavailable"); // every concept 404s -> no fabricated data
  });

  it("getBalanceSheet returns unavailable for QUARTER period_type (not implemented)", async () => {
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getBalanceSheet({ ticker: "NVDA" }, "QUARTER");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("ANNUAL");
  });

  it("getCashFlow returns an honest unavailable when no concept has any real data (Milestone 12B)", async () => {
    mockRoutedFetch({ "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE } });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getCashFlow({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("unavailable"); // every concept 404s -> no fabricated data
  });

  it("getCashFlow returns unavailable for QUARTER period_type (not implemented)", async () => {
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getCashFlow({ ticker: "NVDA" }, "QUARTER");
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("ANNUAL");
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

// ============================================================================
// Milestone 12B — getBalanceSheet (instant facts) and getCashFlow (duration
// facts), plus the 4 new getIncomeStatement additions.
// ============================================================================

describe("SecEdgarAdapter — getBalanceSheet (Milestone 12B)", () => {
  it("maps cash/total_assets/total_liabilities/equity/current_assets/current_liabilities from real-shaped instant facts, tagged periodType INSTANT with no periodStart", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/CashAndCashEquivalentsAtCarryingValue.json": { status: 200, body: factsBody("USD", [
        { end: "2026-01-25", val: 8_589_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents.json": { status: 404, body: {} },
      "us-gaap/Assets.json": { status: 200, body: factsBody("USD", [
        { end: "2026-01-25", val: 111_601_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "us-gaap/Liabilities.json": { status: 200, body: factsBody("USD", [
        { end: "2026-01-25", val: 32_274_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "us-gaap/StockholdersEquity.json": { status: 200, body: factsBody("USD", [
        { end: "2026-01-25", val: 79_327_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest.json": { status: 404, body: {} },
      "us-gaap/AssetsCurrent.json": { status: 200, body: factsBody("USD", [
        { end: "2026-01-25", val: 79_034_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "us-gaap/LiabilitiesCurrent.json": { status: 200, body: factsBody("USD", [
        { end: "2026-01-25", val: 18_047_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getBalanceSheet({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("available");
    const byMetric = Object.fromEntries(result.data!.map((i) => [i.metricName, i]));
    expect(byMetric.cash?.rawValue).toBe(8_589_000_000);
    expect(byMetric.total_assets?.rawValue).toBe(111_601_000_000);
    expect(byMetric.total_liabilities?.rawValue).toBe(32_274_000_000);
    expect(byMetric.equity?.rawValue).toBe(79_327_000_000);
    expect(byMetric.current_assets?.rawValue).toBe(79_034_000_000);
    expect(byMetric.current_liabilities?.rawValue).toBe(18_047_000_000);
    for (const item of result.data!) {
      expect(item.periodType).toBe("INSTANT");
      expect(item.periodStart).toBeUndefined(); // instant facts have no start
    }
  });

  it("falls back to StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest when plain StockholdersEquity is stale — most-current-wins, same principle as revenue/net income (confirmed live for JNJ/CAT/PG)", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "CashAndCashEquivalentsAtCarryingValue.json": { status: 404, body: {} },
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents.json": { status: 404, body: {} },
      "us-gaap/Assets.json": { status: 404, body: {} },
      "us-gaap/Liabilities.json": { status: 404, body: {} },
      "us-gaap/StockholdersEquity.json": { status: 200, body: factsBody("USD", [
        { end: "2015-12-31", val: 1, fy: 2015, fp: "FY", form: "10-K", filed: "2016-02-01" }, // stale
      ]) },
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest.json": { status: 200, body: factsBody("USD", [
        { end: "2025-12-28", val: 99, fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-15" }, // current
      ]) },
      "us-gaap/AssetsCurrent.json": { status: 404, body: {} },
      "us-gaap/LiabilitiesCurrent.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getBalanceSheet({ ticker: "NVDA" }, "ANNUAL");
    const equity = result.data!.find((i) => i.metricName === "equity");
    expect(equity?.rawValue).toBe(99);
    expect(equity?.periodEnd).toBe("2025-12-28");
    expect(equity?.metricIdentifier).toContain("StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest");
  });

  it("a company legitimately missing one concept (e.g. no current_assets tag, as verified live for banks) still yields the others — per-metric independence", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/CashAndCashEquivalentsAtCarryingValue.json": { status: 200, body: factsBody("USD", [
        { end: "2025-12-31", val: 500, fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-15" },
      ]) },
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents.json": { status: 404, body: {} },
      "us-gaap/Assets.json": { status: 404, body: {} },
      "us-gaap/Liabilities.json": { status: 404, body: {} },
      "us-gaap/StockholdersEquity.json": { status: 404, body: {} },
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest.json": { status: 404, body: {} },
      "us-gaap/AssetsCurrent.json": { status: 404, body: {} }, // e.g. banks don't classify current/non-current
      "us-gaap/LiabilitiesCurrent.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getBalanceSheet({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("available");
    expect(result.data!.map((i) => i.metricName)).toEqual(["cash"]);
  });

  it("only keeps genuinely 10-K/FY instant facts, ignoring quarterly instant facts even if present", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/CashAndCashEquivalentsAtCarryingValue.json": { status: 200, body: factsBody("USD", [
        { end: "2026-04-26", val: 999, fy: 2027, fp: "Q1", form: "10-Q", filed: "2026-05-20" }, // quarterly, must be excluded
        { end: "2026-01-25", val: 8_589_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents.json": { status: 404, body: {} },
      "us-gaap/Assets.json": { status: 404, body: {} },
      "us-gaap/Liabilities.json": { status: 404, body: {} },
      "us-gaap/StockholdersEquity.json": { status: 404, body: {} },
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest.json": { status: 404, body: {} },
      "us-gaap/AssetsCurrent.json": { status: 404, body: {} },
      "us-gaap/LiabilitiesCurrent.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getBalanceSheet({ ticker: "NVDA" }, "ANNUAL");
    const cash = result.data!.filter((i) => i.metricName === "cash");
    expect(cash).toHaveLength(1);
    expect(cash[0]!.rawValue).toBe(8_589_000_000);
  });
});

describe("SecEdgarAdapter — getCashFlow (Milestone 12B)", () => {
  it("maps operating_cash_flow/capex/depreciation_amortization from real-shaped duration facts", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/NetCashProvidedByUsedInOperatingActivities.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 64_089_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "us-gaap/PaymentsToAcquirePropertyPlantAndEquipment.json": { status: 404, body: {} }, // stale for NVDA, confirmed live
      "us-gaap/PaymentsToAcquireProductiveAssets.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 3_236_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "us-gaap/DepreciationDepletionAndAmortization.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 1_864_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "DepreciationAmortizationAndAccretionNet.json": { status: 404, body: {} },
      "us-gaap/DepreciationAndAmortization.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getCashFlow({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("available");
    const byMetric = Object.fromEntries(result.data!.map((i) => [i.metricName, i]));
    expect(byMetric.operating_cash_flow?.rawValue).toBe(64_089_000_000);
    expect(byMetric.capex?.rawValue).toBe(3_236_000_000);
    expect(byMetric.capex?.metricIdentifier).toContain("PaymentsToAcquireProductiveAssets"); // fallback concept won
    expect(byMetric.depreciation_amortization?.rawValue).toBe(1_864_000_000);
    for (const item of result.data!) expect(item.periodType).toBe("ANNUAL");
  });

  it("a company with no capex concept at all (e.g. a bank) still yields operating_cash_flow — per-metric independence", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/NetCashProvidedByUsedInOperatingActivities.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-01", end: "2025-12-31", val: 42, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" },
      ]) },
      "us-gaap/PaymentsToAcquirePropertyPlantAndEquipment.json": { status: 404, body: {} },
      "us-gaap/PaymentsToAcquireProductiveAssets.json": { status: 404, body: {} },
      "us-gaap/DepreciationDepletionAndAmortization.json": { status: 404, body: {} },
      "DepreciationAmortizationAndAccretionNet.json": { status: 404, body: {} },
      "us-gaap/DepreciationAndAmortization.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getCashFlow({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("available");
    expect(result.data!.map((i) => i.metricName)).toEqual(["operating_cash_flow"]);
  });
});

describe("SecEdgarAdapter — getIncomeStatement Milestone 12B additions", () => {
  it("collects gross_profit/operating_income/interest_expense/research_development alongside the existing 3 metrics", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 215_938_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "NetIncomeLoss.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 120_067_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "EarningsPerShareBasic.json": { status: 200, body: factsBody("USD/shares", [
        { start: "2025-01-27", end: "2026-01-25", val: 4.93, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "us-gaap/GrossProfit.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 160_000_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "us-gaap/OperatingIncomeLoss.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 130_000_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "us-gaap/InterestExpense.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 300_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
      "InterestExpenseDebt.json": { status: 404, body: {} },
      "us-gaap/ResearchAndDevelopmentExpense.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-27", end: "2026-01-25", val: 16_000_000_000, fy: 2026, fp: "FY", form: "10-K", filed: "2026-02-25" },
      ]) },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("available");
    const byMetric = Object.fromEntries(result.data!.map((i) => [i.metricName, i]));
    expect(byMetric.gross_profit?.rawValue).toBe(160_000_000_000);
    expect(byMetric.operating_income?.rawValue).toBe(130_000_000_000);
    expect(byMetric.interest_expense?.rawValue).toBe(300_000_000);
    expect(byMetric.research_development?.rawValue).toBe(16_000_000_000);
    // Original 3 metrics still present and unaffected by the additions.
    expect(byMetric.revenue?.rawValue).toBe(215_938_000_000);
    expect(byMetric.net_income?.rawValue).toBe(120_067_000_000);
    expect(byMetric.eps?.rawValue).toBe(4.93);
  });

  it("missing gross_profit/operating_income/interest_expense/research_development (e.g. a bank) does not block revenue/net_income/eps", async () => {
    mockRoutedFetch({
      "company_tickers.json": { status: 200, body: TICKER_MAP_FIXTURE },
      "us-gaap/Revenues.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-01", end: "2025-12-31", val: 1, fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-15" },
      ]) },
      "NetIncomeLoss.json": { status: 200, body: factsBody("USD", [
        { start: "2025-01-01", end: "2025-12-31", val: 1, fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-15" },
      ]) },
      "EarningsPerShareBasic.json": { status: 200, body: factsBody("USD/shares", [
        { start: "2025-01-01", end: "2025-12-31", val: 1, fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-15" },
      ]) },
      "us-gaap/GrossProfit.json": { status: 404, body: {} },
      "us-gaap/OperatingIncomeLoss.json": { status: 404, body: {} },
      "us-gaap/InterestExpense.json": { status: 404, body: {} },
      "InterestExpenseDebt.json": { status: 404, body: {} },
      "us-gaap/ResearchAndDevelopmentExpense.json": { status: 404, body: {} },
    });
    const adapter = new SecEdgarAdapter("EquityAI-Test test@example.com");
    const result = await adapter.getIncomeStatement({ ticker: "NVDA" }, "ANNUAL");
    expect(result.status).toBe("available");
    expect(result.data!.map((i) => i.metricName).sort()).toEqual(["eps", "net_income", "revenue"]);
  });
});
