// ============================================================================
// Tests: provider registry conditional construction (Milestone 13F).
// buildProviderRegistry() reads FMP_API_KEY/SEC_EDGAR_USER_AGENT from
// process.env at call time — these tests manipulate process.env directly
// (saving/restoring the original values) rather than mocking a module.
// ============================================================================

import { describe, it, expect, afterEach } from "vitest";
import { buildProviderRegistry } from "../src/providers/registry";
import { unavailableMarketDataProvider, unavailableFinancialDataProvider } from "../src/providers/adapters/unavailableProvider";
import { FmpMarketDataAdapter } from "../src/providers/adapters/fmpMarketDataAdapter";

const ORIGINAL_FMP_KEY = process.env.FMP_API_KEY;
const ORIGINAL_SEC_UA = process.env.SEC_EDGAR_USER_AGENT;

afterEach(() => {
  if (ORIGINAL_FMP_KEY === undefined) delete process.env.FMP_API_KEY;
  else process.env.FMP_API_KEY = ORIGINAL_FMP_KEY;
  if (ORIGINAL_SEC_UA === undefined) delete process.env.SEC_EDGAR_USER_AGENT;
  else process.env.SEC_EDGAR_USER_AGENT = ORIGINAL_SEC_UA;
});

describe("buildProviderRegistry — marketData conditional registration (Milestone 13F)", () => {
  it("falls back to unavailableMarketDataProvider when FMP_API_KEY is absent — the app must keep working, not throw", () => {
    delete process.env.FMP_API_KEY;
    const registry = buildProviderRegistry();
    expect(registry.marketData).toBe(unavailableMarketDataProvider);
  });

  it("registers a real FmpMarketDataAdapter when FMP_API_KEY is present", () => {
    process.env.FMP_API_KEY = "test-key-for-registry-test";
    const registry = buildProviderRegistry();
    expect(registry.marketData).toBeInstanceOf(FmpMarketDataAdapter);
  });

  it("marketData registration does not affect financialData's own independent SEC/FMP resolver logic", () => {
    delete process.env.FMP_API_KEY;
    delete process.env.SEC_EDGAR_USER_AGENT;
    const registry = buildProviderRegistry();
    // Neither credential present -> financialData falls back too, same
    // honest-unavailable principle, unrelated code path from marketData.
    expect(registry.marketData).toBe(unavailableMarketDataProvider);
    expect(registry.financialData).toBe(unavailableFinancialDataProvider);
  });
});
