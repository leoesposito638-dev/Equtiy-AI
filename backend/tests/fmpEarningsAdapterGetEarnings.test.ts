// ============================================================================
// Tests: FmpEarningsAdapter.getEarnings() (Milestone 14B §12.C) — mocked
// fetch, no real network call. fmpEarningsAdapter.test.ts (Milestone 13H)
// already covers getEstimates(); this file covers the newly-implemented
// getEarnings() method and its own dedicated fixtures. Fixture shapes match
// the actual live /stable/earnings response observed in Milestone 14B.
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
  { symbol: "NVDA", date: "2026-11-18", epsActual: null, epsEstimated: 2.47, revenueActual: null, revenueEstimated: 108_672_700_000, lastUpdated: "2026-09-11" },
  { symbol: "NVDA", date: "2026-08-26", epsActual: 2.22, epsEstimated: 2.09, revenueActual: 96_221_000_000, revenueEstimated: 92_270_940_000, lastUpdated: "2026-09-11" },
];

describe("FmpEarningsAdapter.getEarnings — valid historical record", () => {
  it("maps a historical row (actual populated) into an EarningsRecord with all real fields", async () => {
    mockRoutedFetch({ "/earnings": { status: 200, body: NVDA_ROWS } });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEarnings({ ticker: "NVDA" });

    expect(result.status).toBe("available");
    const historical = result.data!.find((r) => r.epsActual != null)!;
    expect(historical).toMatchObject({
      periodEnd: "2026-08-26",
      reportDate: "2026-08-26",
      epsActual: 2.22,
      epsEstimate: 2.09,
      revenueActual: 96_221_000_000,
      revenueEstimate: 92_270_940_000,
    });
    expect(result.source?.providerType).toBe("FINANCIAL_API");
  });

  it("never includes the API key in the returned source URL", async () => {
    mockRoutedFetch({ "/earnings": { status: 200, body: NVDA_ROWS } });
    const adapter = new FmpEarningsAdapter("super-secret-key");
    const result = await adapter.getEarnings({ ticker: "NVDA" });
    expect(result.source?.sourceUrl).not.toContain("super-secret-key");
  });

  it("requests a limit of 5 (this endpoint's live-verified subscription cap)", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => NVDA_ROWS, text: async () => "" }));
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = new FmpEarningsAdapter("test-key");
    await adapter.getEarnings({ ticker: "NVDA" });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("limit=5");
    expect(url).toContain("symbol=NVDA");
  });
});

describe("FmpEarningsAdapter.getEarnings — upcoming record", () => {
  it("maps a row with no actual yet into an EarningsRecord with epsActual/revenueActual undefined, never zero/fabricated", async () => {
    mockRoutedFetch({ "/earnings": { status: 200, body: NVDA_ROWS } });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEarnings({ ticker: "NVDA" });

    const upcoming = result.data!.find((r) => r.epsActual == null)!;
    expect(upcoming.epsActual).toBeUndefined();
    expect(upcoming.revenueActual).toBeUndefined();
    expect(upcoming.epsEstimate).toBe(2.47);
    expect(upcoming.reportDate).toBe("2026-11-18");
  });

  it("never invents guidanceText/guidanceDirection — FMP's response has no such field", async () => {
    mockRoutedFetch({ "/earnings": { status: 200, body: NVDA_ROWS } });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEarnings({ ticker: "NVDA" });
    for (const record of result.data!) {
      expect(record.guidanceText).toBeUndefined();
      expect(record.guidanceDirection).toBeUndefined();
    }
  });
});

describe("FmpEarningsAdapter.getEarnings — missing/null actual handled per-row, not fatal", () => {
  it("a row missing 'date' is skipped, but does not block other valid rows", async () => {
    mockRoutedFetch({
      "/earnings": { status: 200, body: [{ symbol: "NVDA", epsActual: 1, epsEstimated: 1 }, ...NVDA_ROWS] },
    });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEarnings({ ticker: "NVDA" });
    expect(result.status).toBe("available");
    expect(result.data).toHaveLength(2);
  });
});

describe("FmpEarningsAdapter.getEarnings — provider error", () => {
  it("a network error returns unavailable, never a fabricated result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEarnings({ ticker: "NVDA" });
    expect(result.status).toBe("unavailable");
    expect(result.unavailableReason).toContain("Network error");
  });

  it("invalid JSON returns unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); }, text: async () => "" })));
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEarnings({ ticker: "NVDA" });
    expect(result.status).toBe("unavailable");
  });

  it("an empty array returns unavailable, not an empty-but-available result", async () => {
    mockRoutedFetch({ "/earnings": { status: 200, body: [] } });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEarnings({ ticker: "NVDA" });
    expect(result.status).toBe("unavailable");
  });
});

describe("FmpEarningsAdapter.getEarnings — gated/unavailable response", () => {
  it("returns unavailable, not fabricated data, on HTTP 402 (subscription-gated symbol)", async () => {
    mockRoutedFetch({ "/earnings": { status: 402, body: { error: "Premium Query Parameter" } } });
    const adapter = new FmpEarningsAdapter("test-key");
    const result = await adapter.getEarnings({ ticker: "TXN" });
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
    expect(result.unavailableReason).toContain("402");
  });
});
