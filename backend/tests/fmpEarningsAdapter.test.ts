// ============================================================================
// Tests: FMP earnings/estimates adapter (Milestone 13H) — analyst-estimates
// parsing, and the "never fabricate" rule, against a MOCKED fetch. No real
// network call, no real API key needed. Fixtures use the actual field
// shapes/values observed live against FMP in the Milestone 13G audit.
// ============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { FmpEarningsAdapter } from "../src/providers/adapters/fmpEarningsAdapter";

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

const NVDA_ROWS = [
  { symbol: "NVDA", date: "2031-01-25", epsAvg: 20, epsHigh: 23.84049, epsLow: 13.59295, numAnalystsEps: 17 },
  { symbol: "NVDA", date: "2027-01-25", epsAvg: 9.25503, epsHigh: 9.74689, epsLow: 9.03419, numAnalystsEps: 31 },
  { symbol: "NVDA", date: "2026-01-25", epsAvg: 4.69388, epsHigh: 4.73408, epsLow: 4.67378, numAnalystsEps: 30 },
];

describe("FmpEarningsAdapter — construction", () => {
  it("throws if constructed with no API key", () => {
    expect(() => new FmpEarningsAdapter("")).toThrow();
  });
});

describe("FmpEarningsAdapter.getEstimates — analyst-estimates parsing", () => {
  it("maps date/epsAvg/numAnalystsEps into EstimateRecord for every row, preserving API order (selection logic handles ordering separately)", async () => {
    mockRoutedFetch({ "analyst-estimates": { status: 200, body: NVDA_ROWS } });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEstimates({ ticker: "NVDA" });

    expect(result.status).toBe("available");
    expect(result.data).toHaveLength(3);
    expect(result.data?.[0]).toMatchObject({
      metricName: "eps",
      estimatePeriodEnd: "2031-01-25",
      estimatePeriodType: "ANNUAL",
      consensusValue: 20,
      analystCount: 17,
    });
    expect(result.data?.[1]).toMatchObject({ estimatePeriodEnd: "2027-01-25", consensusValue: 9.25503, analystCount: 31 });
    expect(result.source?.providerType).toBe("FINANCIAL_API");
  });

  it("does NOT map epsHigh/epsLow into EstimateRecord — the interface has no field for them", async () => {
    mockRoutedFetch({ "analyst-estimates": { status: 200, body: NVDA_ROWS } });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEstimates({ ticker: "NVDA" });
    const row = result.data?.[0] as Record<string, unknown>;
    expect(row.epsHigh).toBeUndefined();
    expect(row.epsLow).toBeUndefined();
  });

  it("does not invent an estimatePeriodStart or vintage/as-of date — FMP's response has none", async () => {
    mockRoutedFetch({ "analyst-estimates": { status: 200, body: NVDA_ROWS } });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEstimates({ ticker: "NVDA" });
    expect(result.data?.[0]?.estimatePeriodStart).toBeUndefined();
  });

  it("never includes the API key in the returned source URL", async () => {
    mockRoutedFetch({ "analyst-estimates": { status: 200, body: NVDA_ROWS } });
    const adapter = new FmpEarningsAdapter("super-secret-key");
    const result = await adapter.getEstimates({ ticker: "NVDA" });
    expect(result.source?.sourceUrl).not.toContain("super-secret-key");
  });

  it("requests period=annual and a limit of 8", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => NVDA_ROWS, text: async () => "" }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = new FmpEarningsAdapter("test-key");
    await adapter.getEstimates({ ticker: "NVDA" });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("period=annual");
    expect(url).toContain("limit=8");
    expect(url).toContain("symbol=NVDA");
  });

  it("a row missing 'date' is skipped, but does not block other valid rows in the same response", async () => {
    mockRoutedFetch({
      "analyst-estimates": {
        status: 200,
        body: [{ symbol: "NVDA", epsAvg: 1, numAnalystsEps: 5 }, ...NVDA_ROWS], // first row has no date
      },
    });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEstimates({ ticker: "NVDA" });
    expect(result.status).toBe("available");
    expect(result.data).toHaveLength(3);
  });

  it("a null/missing epsAvg on one row is preserved as null, not fabricated or defaulted", async () => {
    mockRoutedFetch({
      "analyst-estimates": { status: 200, body: [{ symbol: "NVDA", date: "2026-01-25", numAnalystsEps: 30 }] },
    });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEstimates({ ticker: "NVDA" });
    expect(result.data?.[0]?.consensusValue).toBeNull();
    expect(result.data?.[0]?.analystCount).toBe(30);
  });

  it("returns unavailable, not fabricated data, when FMP returns HTTP 402 (subscription-gated symbol — same 14 tickers gated on every other FMP endpoint)", async () => {
    mockRoutedFetch({ "analyst-estimates": { status: 402, body: { error: "Premium Query Parameter" } } });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEstimates({ ticker: "TXN" });
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
    expect(result.unavailableReason).toContain("402");
  });

  it("returns unavailable when analyst-estimates returns an empty array", async () => {
    mockRoutedFetch({ "analyst-estimates": { status: 200, body: [] } });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEstimates({ ticker: "MA" });
    expect(result.status).toBe("unavailable");
  });

  it("preserves a real negative epsAvg row (e.g. INTC FY2024: -0.14244) rather than rejecting/zeroing it at the adapter layer", async () => {
    mockRoutedFetch({
      "analyst-estimates": { status: 200, body: [{ symbol: "INTC", date: "2024-12-28", epsAvg: -0.14244, numAnalystsEps: 24 }] },
    });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEstimates({ ticker: "INTC" });
    expect(result.data?.[0]?.consensusValue).toBe(-0.14244);
  });
});

describe("FmpEarningsAdapter.getEarnings — explicitly out of scope this milestone", () => {
  it("returns an honest unavailable, never a fabricated result", async () => {
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEarnings({ ticker: "NVDA" });
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });
});
