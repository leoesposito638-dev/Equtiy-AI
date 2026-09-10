// ============================================================================
// Tests: FMP market-data adapter (Milestone 13F) — enterprise-values and
// TTM-ratio parsing, and the "never fabricate" rule, against a MOCKED
// fetch. No real network call, no real API key needed. This proves the
// adapter's own logic is correct; it does not (and cannot) prove FMP's live
// API behaves this way — the Milestone 13 valuation audit's live-tested
// evidence (against the real API, with a real key) is what established the
// field names and the 402-per-symbol subscription-gate behavior this file
// encodes.
// ============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { FmpMarketDataAdapter } from "../src/providers/adapters/fmpMarketDataAdapter";

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

afterEach(() => vi.unstubAllGlobals());

describe("FmpMarketDataAdapter — construction", () => {
  it("throws if constructed with no API key", () => {
    expect(() => new FmpMarketDataAdapter("")).toThrow();
  });
});

describe("FmpMarketDataAdapter.getQuote — enterprise-values parsing", () => {
  it("maps a well-formed enterprise-values row to a Quote, including enterpriseValue", async () => {
    mockRoutedFetch({
      "enterprise-values": {
        status: 200,
        body: [{
          symbol: "NVDA", date: "2026-01-25", stockPrice: 186.47, numberOfShares: 24_359_000_000,
          marketCapitalization: 4_542_222_730_000, minusCashAndCashEquivalents: 10_605_000_000,
          addTotalDebt: 11_412_000_000, enterpriseValue: 4_543_029_730_000,
        }],
      },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getQuote({ ticker: "NVDA" });

    expect(result.status).toBe("available");
    expect(result.data).toMatchObject({
      price: 186.47,
      marketCap: 4_542_222_730_000,
      sharesOutstanding: 24_359_000_000,
      enterpriseValue: 4_543_029_730_000,
      timestamp: "2026-01-25",
    });
    // Fields enterprise-values does not return must stay honestly null, never guessed.
    expect(result.data?.volume).toBeNull();
    expect(result.data?.high52w).toBeNull();
    expect(result.data?.low52w).toBeNull();
    expect(result.source?.providerType).toBe("MARKET_DATA");
  });

  it("never includes the API key in the returned source URL", async () => {
    mockRoutedFetch({
      "enterprise-values": { status: 200, body: [{ date: "2026-01-25", stockPrice: 1, numberOfShares: 1, marketCapitalization: 1, enterpriseValue: 1 }] },
    });
    const adapter = new FmpMarketDataAdapter("super-secret-key");
    const result = await adapter.getQuote({ ticker: "NVDA" });
    expect(result.source?.sourceUrl).not.toContain("super-secret-key");
  });

  it("does NOT call the raw /quote endpoint as the valuation source (enterprise-values only)", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("enterprise-values")) {
        return { ok: true, status: 200, json: async () => [{ date: "2026-01-25", stockPrice: 1, numberOfShares: 1, marketCapitalization: 1, enterpriseValue: 1 }], text: async () => "" };
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    });
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = new FmpMarketDataAdapter("test-key");
    await adapter.getQuote({ ticker: "NVDA" });
    const calledUrls = fetchSpy.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.some((u) => u.includes("/enterprise-values"))).toBe(true);
    expect(calledUrls.some((u) => /\/quote\?/.test(u))).toBe(false);
  });

  it("returns unavailable, not fabricated zeros, when FMP returns HTTP 402 (subscription-gated symbol — verified live for 14/30 demo tickers)", async () => {
    mockRoutedFetch({ "enterprise-values": { status: 402, body: { error: "Premium Query Parameter" } } });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getQuote({ ticker: "IBM" });
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
    expect(result.unavailableReason).toContain("402");
  });

  it("returns unavailable when enterprise-values returns an empty array", async () => {
    mockRoutedFetch({ "enterprise-values": { status: 200, body: [] } });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getQuote({ ticker: "NVDA" });
    expect(result.status).toBe("unavailable");
  });
});

describe("FmpMarketDataAdapter.getValuationRatios — TTM ratio parsing", () => {
  it("reads pe and priceToFcf from ratios-ttm, evToEbitda/evToSales/fcfYield from key-metrics-ttm — never recomputed locally", async () => {
    mockRoutedFetch({
      "ratios-ttm": { status: 200, body: [{ priceToEarningsRatioTTM: 27.4, priceToFreeCashFlowRatioTTM: 41.7 }] },
      "key-metrics-ttm": { status: 200, body: [{ evToEBITDATTM: 22.7, evToSalesTTM: 17.5, freeCashFlowYieldTTM: 0.024 }] },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getValuationRatios({ ticker: "NVDA" });
    expect(result.status).toBe("available");
    expect(result.data).toEqual({
      pe: 27.4, evToEbitda: 22.7, evToSales: 17.5, priceToFcf: 41.7, fcfYield: 0.024,
    });
  });

  it("a field missing from FMP's response stays null, never fabricated or defaulted to zero", async () => {
    mockRoutedFetch({
      "ratios-ttm": { status: 200, body: [{ priceToEarningsRatioTTM: 27.4 }] }, // priceToFreeCashFlowRatioTTM absent
      "key-metrics-ttm": { status: 200, body: [{ evToEBITDATTM: 22.7 }] }, // evToSalesTTM, freeCashFlowYieldTTM absent
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getValuationRatios({ ticker: "NVDA" });
    expect(result.status).toBe("available");
    expect(result.data?.pe).toBe(27.4);
    expect(result.data?.evToEbitda).toBe(22.7);
    expect(result.data?.evToSales).toBeNull();
    expect(result.data?.priceToFcf).toBeNull();
    expect(result.data?.fcfYield).toBeNull();
  });

  it("a negative ratio (e.g. negative TTM free cash flow) is preserved as a real value, not rejected or zeroed", async () => {
    mockRoutedFetch({
      "ratios-ttm": { status: 200, body: [{ priceToFreeCashFlowRatioTTM: -233.3 }] },
      "key-metrics-ttm": { status: 200, body: [{}] },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getValuationRatios({ ticker: "AMZN" });
    expect(result.data?.priceToFcf).toBe(-233.3);
  });

  it("returns unavailable when both endpoints 402 (subscription-gated symbol)", async () => {
    mockRoutedFetch({
      "ratios-ttm": { status: 402, body: {} },
      "key-metrics-ttm": { status: 402, body: {} },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getValuationRatios({ ticker: "IBM" });
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });

  it("returns unavailable (not an empty-but-available object) when neither endpoint has any of the 5 supported fields", async () => {
    mockRoutedFetch({
      "ratios-ttm": { status: 200, body: [{ someOtherField: 1 }] },
      "key-metrics-ttm": { status: 200, body: [{ someOtherField: 2 }] },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getValuationRatios({ ticker: "NVDA" });
    expect(result.status).toBe("unavailable");
  });
});

describe("FmpMarketDataAdapter.getHistoricalPrices — out of scope this milestone", () => {
  it("returns an honest unavailable, never a fabricated series", async () => {
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getHistoricalPrices({ ticker: "NVDA" }, "2026-01-01", "2026-06-01");
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });
});
