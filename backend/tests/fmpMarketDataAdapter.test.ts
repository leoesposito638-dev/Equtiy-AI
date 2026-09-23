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

describe("FmpMarketDataAdapter.getLivePrice — Milestone 13H, sourced from /stable/quote", () => {
  it("maps a well-formed /quote row to a LivePrice, converting unix-seconds timestamp to ISO", async () => {
    mockRoutedFetch({
      "/quote": {
        status: 200,
        body: [{ symbol: "NVDA", price: 218.73, timestamp: 1789055787 }],
      },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getLivePrice({ ticker: "NVDA" });

    expect(result.status).toBe("available");
    expect(result.data?.price).toBe(218.73);
    expect(result.data?.timestamp).toBe(new Date(1789055787 * 1000).toISOString());
    expect(result.source?.providerType).toBe("MARKET_DATA");
  });

  it("never includes the API key in the returned source URL", async () => {
    mockRoutedFetch({ "/quote": { status: 200, body: [{ price: 1, timestamp: 1700000000 }] } });
    const adapter = new FmpMarketDataAdapter("super-secret-key");
    const result = await adapter.getLivePrice({ ticker: "NVDA" });
    expect(result.source?.sourceUrl).not.toContain("super-secret-key");
  });

  it("calls /quote, not /enterprise-values — a genuinely separate live-price source, never a reinterpretation of the period-end price", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("/quote")) {
        return { ok: true, status: 200, json: async () => [{ price: 218.73, timestamp: 1789055787 }], text: async () => "" };
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    });
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = new FmpMarketDataAdapter("test-key");
    await adapter.getLivePrice({ ticker: "NVDA" });
    const calledUrls = fetchSpy.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.some((u) => u.includes("/quote"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("/enterprise-values"))).toBe(false);
  });

  it("returns unavailable, not a fabricated price, on HTTP 402 (subscription-gated symbol)", async () => {
    mockRoutedFetch({ "/quote": { status: 402, body: { error: "Premium Query Parameter" } } });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getLivePrice({ ticker: "TXN" });
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
    expect(result.unavailableReason).toContain("402");
  });

  it("returns unavailable when /quote returns an empty array", async () => {
    mockRoutedFetch({ "/quote": { status: 200, body: [] } });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getLivePrice({ ticker: "NVDA" });
    expect(result.status).toBe("unavailable");
  });

  it("getQuote() and getValuationRatios() are unaffected by getLivePrice existing — Milestone 13F behavior is unchanged", async () => {
    mockRoutedFetch({
      "enterprise-values": {
        status: 200,
        body: [{ date: "2026-01-25", stockPrice: 186.47, numberOfShares: 24_359_000_000, marketCapitalization: 4_542_222_730_000, enterpriseValue: 4_543_029_730_000 }],
      },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getQuote({ ticker: "NVDA" });
    expect(result.status).toBe("available");
    expect(result.data?.price).toBe(186.47); // still the period-end price, not a live one
  });
});

describe("FmpMarketDataAdapter.getHistoricalPrices — Milestone 14D, dividend-adjusted daily OHLCV", () => {
  it("happy path: maps real-shaped dividend-adjusted rows to DailyPrice[]", async () => {
    mockRoutedFetch({
      "/historical-price-eod/dividend-adjusted": {
        status: 200,
        body: [
          { symbol: "NVDA", date: "2026-09-18", adjOpen: 219.35, adjHigh: 222.73, adjLow: 218.03, adjClose: 222.27, volume: 190287429 },
          { symbol: "NVDA", date: "2026-09-17", adjOpen: 218.38, adjHigh: 219.91, adjLow: 217.15, adjClose: 219.34, volume: 94191300 },
        ],
      },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getHistoricalPrices({ ticker: "NVDA" }, "2026-09-15", "2026-09-20");

    expect(result.status).toBe("available");
    expect(result.data).toHaveLength(2);
    expect(result.data?.[0]).toEqual({
      date: "2026-09-18",
      open: 219.35,
      high: 222.73,
      low: 218.03,
      close: 222.27,
      volume: 190287429,
      adjustmentType: "split_and_dividend_adjusted",
    });
  });

  it("calls the dividend-adjusted endpoint specifically, never full or non-split-adjusted", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("/historical-price-eod/dividend-adjusted")) {
        return { ok: true, status: 200, json: async () => [{ date: "2026-09-18", adjOpen: 1, adjHigh: 1, adjLow: 1, adjClose: 1, volume: 1 }], text: async () => "" };
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    });
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = new FmpMarketDataAdapter("test-key");
    await adapter.getHistoricalPrices({ ticker: "NVDA" }, "2026-09-15", "2026-09-20");
    const calledUrls = fetchSpy.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.some((u) => u.includes("/historical-price-eod/dividend-adjusted"))).toBe(true);
    expect(calledUrls.some((u) => /\/historical-price-eod\/full/.test(u))).toBe(false);
    expect(calledUrls.some((u) => /non-split-adjusted/.test(u))).toBe(false);
  });

  it("returns unavailable, not a fabricated series, on an empty response", async () => {
    mockRoutedFetch({ "/historical-price-eod/dividend-adjusted": { status: 200, body: [] } });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getHistoricalPrices({ ticker: "NVDA" }, "2026-09-15", "2026-09-20");
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });

  it("returns unavailable, not fabricated data, on HTTP 402 (subscription-gated symbol)", async () => {
    mockRoutedFetch({ "/historical-price-eod/dividend-adjusted": { status: 402, body: { error: "Premium Query Parameter" } } });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getHistoricalPrices({ ticker: "TXN" }, "2026-09-15", "2026-09-20");
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
    expect(result.unavailableReason).toContain("402");
  });

  it("a row missing a required OHLC field is skipped, without blocking other valid rows", async () => {
    mockRoutedFetch({
      "/historical-price-eod/dividend-adjusted": {
        status: 200,
        body: [
          { symbol: "NVDA", date: "2026-09-18", adjOpen: 219.35, adjHigh: 222.73, adjLow: 218.03, adjClose: 222.27, volume: 190287429 },
          { symbol: "NVDA", date: "2026-09-17", adjOpen: 218.38, adjHigh: 219.91, volume: 94191300 }, // missing adjLow/adjClose
        ],
      },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getHistoricalPrices({ ticker: "NVDA" }, "2026-09-15", "2026-09-20");
    expect(result.status).toBe("available");
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.date).toBe("2026-09-18");
  });

  it("a row with a zero or negative price is rejected, never persisted", async () => {
    mockRoutedFetch({
      "/historical-price-eod/dividend-adjusted": {
        status: 200,
        body: [
          { symbol: "NVDA", date: "2026-09-18", adjOpen: 219.35, adjHigh: 222.73, adjLow: 218.03, adjClose: 222.27, volume: 190287429 },
          { symbol: "NVDA", date: "2026-09-17", adjOpen: 0, adjHigh: 219.91, adjLow: 217.15, adjClose: 219.34, volume: 94191300 }, // zero open
          { symbol: "NVDA", date: "2026-09-16", adjOpen: 214.14, adjHigh: 216.76, adjLow: 212.5, adjClose: -213.9, volume: 96563600 }, // negative close
        ],
      },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getHistoricalPrices({ ticker: "NVDA" }, "2026-09-15", "2026-09-20");
    expect(result.status).toBe("available");
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.date).toBe("2026-09-18");
  });

  it("never includes the API key in the returned source URL", async () => {
    mockRoutedFetch({
      "/historical-price-eod/dividend-adjusted": {
        status: 200,
        body: [{ date: "2026-09-18", adjOpen: 1, adjHigh: 1, adjLow: 1, adjClose: 1, volume: 1 }],
      },
    });
    const adapter = new FmpMarketDataAdapter("super-secret-key");
    const result = await adapter.getHistoricalPrices({ ticker: "NVDA" }, "2026-09-15", "2026-09-20");
    expect(result.source?.sourceUrl).not.toContain("super-secret-key");
  });

  it("all-invalid response (every row rejected) returns unavailable, not an empty-but-available array", async () => {
    mockRoutedFetch({
      "/historical-price-eod/dividend-adjusted": {
        status: 200,
        body: [{ date: "2026-09-18", adjOpen: 0, adjHigh: 0, adjLow: 0, adjClose: 0, volume: 1 }],
      },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getHistoricalPrices({ ticker: "NVDA" }, "2026-09-15", "2026-09-20");
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });
});

describe("FmpMarketDataAdapter.getHistoricalPrices — Milestone 14D.1, unsettled trading day is never stored", () => {
  afterEach(() => vi.useRealTimers());

  it("reproduces the exact 14D bug: a row for 'today' returned mid-session (09:40 ET) is rejected, not stored as a partial close", async () => {
    // 2026-09-23 is EDT (UTC-4): 09:40 ET = 13:40 UTC — the exact live
    // timestamp the Milestone 14D run actually happened at.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T13:40:00Z"));

    mockRoutedFetch({
      "/historical-price-eod/dividend-adjusted": {
        status: 200,
        body: [
          { symbol: "NVDA", date: "2026-09-22", adjOpen: 215, adjHigh: 217, adjLow: 214, adjClose: 216, volume: 90000000 },
          { symbol: "NVDA", date: "2026-09-23", adjOpen: 216.5, adjHigh: 218, adjLow: 215.9, adjClose: 217.4, volume: 12000000 }, // mid-session snapshot for "today"
        ],
      },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getHistoricalPrices({ ticker: "NVDA" }, "2026-09-20", "2026-09-23");

    expect(result.status).toBe("available");
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.date).toBe("2026-09-22");
    expect(result.data?.some((p) => p.date === "2026-09-23")).toBe(false);
  });

  it("boundary: a row dated exactly at close + settlement buffer IS accepted", async () => {
    // 2026-09-23 close (16:00 ET / 20:00 UTC in EDT) + 30min buffer = 20:30 UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T20:30:00Z"));

    mockRoutedFetch({
      "/historical-price-eod/dividend-adjusted": {
        status: 200,
        body: [{ symbol: "NVDA", date: "2026-09-23", adjOpen: 216.5, adjHigh: 218, adjLow: 215.9, adjClose: 217.4, volume: 95000000 }],
      },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getHistoricalPrices({ ticker: "NVDA" }, "2026-09-23", "2026-09-23");

    expect(result.status).toBe("available");
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.date).toBe("2026-09-23");
  });

  it("boundary: one millisecond before close + settlement buffer is rejected", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(new Date("2026-09-23T20:30:00Z").getTime() - 1));

    mockRoutedFetch({
      "/historical-price-eod/dividend-adjusted": {
        status: 200,
        body: [{ symbol: "NVDA", date: "2026-09-23", adjOpen: 216.5, adjHigh: 218, adjLow: 215.9, adjClose: 217.4, volume: 95000000 }],
      },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getHistoricalPrices({ ticker: "NVDA" }, "2026-09-23", "2026-09-23");

    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });

  it("an unsettled row is a skip, not an error — other settled rows in the same response are still returned", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T13:40:00Z"));

    mockRoutedFetch({
      "/historical-price-eod/dividend-adjusted": {
        status: 200,
        body: [
          { symbol: "NVDA", date: "2026-09-21", adjOpen: 213, adjHigh: 215, adjLow: 212, adjClose: 214, volume: 88000000 },
          { symbol: "NVDA", date: "2026-09-22", adjOpen: 215, adjHigh: 217, adjLow: 214, adjClose: 216, volume: 90000000 },
          { symbol: "NVDA", date: "2026-09-23", adjOpen: 216.5, adjHigh: 218, adjLow: 215.9, adjClose: 217.4, volume: 12000000 },
        ],
      },
    });
    const adapter = new FmpMarketDataAdapter("test-key");
    const result = await adapter.getHistoricalPrices({ ticker: "NVDA" }, "2026-09-20", "2026-09-23");

    expect(result.status).toBe("available");
    expect(result.data?.map((p) => p.date)).toEqual(["2026-09-21", "2026-09-22"]);
  });
});
