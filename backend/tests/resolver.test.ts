// ============================================================================
// Tests: ProviderResolver (Milestone 8B) — ordering, fallback, and the
// "never call a second provider once one has already succeeded" rule.
//
// Uses fake FinancialDataProvider implementations (not FmpFinancialDataAdapter
// or SecEdgarAdapter directly, and no fetch mocking) — the resolver's job is
// pure ordering/fallback logic, entirely independent of any one vendor's
// wire format. Existing adapter-specific behavior stays covered by
// fmpAdapter.test.ts and secEdgarAdapter.test.ts, unchanged by this file.
// ============================================================================

import { describe, it, expect, vi } from "vitest";
import { ProviderResolver } from "../src/providers/resolver";
import type { FinancialDataProvider, ProviderCompanyRef, ProviderResult, RawLineItem } from "../src/providers/interfaces";
import type { PeriodType } from "../src/types/domain";

const REF: ProviderCompanyRef = { ticker: "NVDA" };

function available(providerName: string, rawValue = 1): ProviderResult<RawLineItem[]> {
  return {
    status: "available",
    data: [
      {
        metricName: "revenue",
        rawValue,
        unit: "USD",
        currency: "USD",
        periodEnd: "2026-01-26",
        periodType: "ANNUAL",
      },
    ],
    source: { providerName, providerType: "FINANCIAL_API" },
  };
}

function unavailable(reason: string): ProviderResult<RawLineItem[]> {
  return { status: "unavailable", data: null, source: null, unavailableReason: reason };
}

/** Minimal fake provider — only getIncomeStatement is exercised by these
 *  tests (getBalanceSheet/getCashFlow follow the identical resolve() path,
 *  proven once via the "each statement type resolved independently" test). */
function fakeProvider(name: string, result: ProviderResult<RawLineItem[]>): FinancialDataProvider & { calls: number } {
  const provider = {
    calls: 0,
    async getIncomeStatement(_ref: ProviderCompanyRef, _periodType: PeriodType) {
      provider.calls++;
      return result;
    },
    async getBalanceSheet(_ref: ProviderCompanyRef, _periodType: PeriodType) {
      provider.calls++;
      return result;
    },
    async getCashFlow(_ref: ProviderCompanyRef, _periodType: PeriodType) {
      provider.calls++;
      return result;
    },
  };
  Object.defineProperty(provider, "constructor", { value: { name } });
  return provider;
}

describe("ProviderResolver — construction", () => {
  it("throws if constructed with an empty provider list", () => {
    expect(() => new ProviderResolver([])).toThrow();
  });
});

describe("ProviderResolver — SEC succeeds", () => {
  it("returns SEC's result and never calls FMP", async () => {
    const sec = fakeProvider("SecEdgarAdapter", available("SEC EDGAR", 42));
    const fmp = fakeProvider("FmpFinancialDataAdapter", available("Financial Modeling Prep", 99));
    const resolver = new ProviderResolver([sec, fmp]);

    const result = await resolver.getIncomeStatement(REF, "ANNUAL");

    expect(result.status).toBe("available");
    expect(result.source?.providerName).toBe("SEC EDGAR");
    expect(result.data![0].rawValue).toBe(42);
    expect(sec.calls).toBe(1);
    expect(fmp.calls).toBe(0); // FMP must never be called once SEC succeeded
  });
});

describe("ProviderResolver — SEC unavailable, FMP attempted", () => {
  it("falls back to FMP when SEC is unavailable", async () => {
    const sec = fakeProvider("SecEdgarAdapter", unavailable("Ticker 'NVDA' not found in SEC's mapping."));
    const fmp = fakeProvider("FmpFinancialDataAdapter", available("Financial Modeling Prep", 7));
    const resolver = new ProviderResolver([sec, fmp]);

    const result = await resolver.getIncomeStatement(REF, "ANNUAL");

    expect(sec.calls).toBe(1);
    expect(fmp.calls).toBe(1);
    expect(result.status).toBe("available");
    expect(result.source?.providerName).toBe("Financial Modeling Prep");
    expect(result.data![0].rawValue).toBe(7);
  });
});

describe("ProviderResolver — SEC unavailable + FMP succeeds returns FMP's unmodified result", () => {
  it("returns exactly what FMP returned, unaltered", async () => {
    const fmpResult = available("Financial Modeling Prep", 123);
    const sec = fakeProvider("SecEdgarAdapter", unavailable("SEC HTTP 500."));
    const fmp = fakeProvider("FmpFinancialDataAdapter", fmpResult);
    const resolver = new ProviderResolver([sec, fmp]);

    const result = await resolver.getIncomeStatement(REF, "ANNUAL");

    expect(result).toEqual(fmpResult);
  });
});

describe("ProviderResolver — SEC succeeds means FMP is never even attempted (would-succeed case)", () => {
  it("does not call FMP even though FMP would also have succeeded", async () => {
    const sec = fakeProvider("SecEdgarAdapter", available("SEC EDGAR", 1));
    const fmp = fakeProvider("FmpFinancialDataAdapter", available("Financial Modeling Prep", 2));
    const resolver = new ProviderResolver([sec, fmp]);

    await resolver.getIncomeStatement(REF, "ANNUAL");

    expect(fmp.calls).toBe(0);
  });
});

describe("ProviderResolver — both providers fail", () => {
  it("returns an honest combined unavailable result naming both providers and reasons", async () => {
    const sec = fakeProvider("SecEdgarAdapter", unavailable("SEC ticker mapping unavailable: network error."));
    const fmp = fakeProvider("FmpFinancialDataAdapter", unavailable("FMP returned HTTP 402 for /income-statement."));
    const resolver = new ProviderResolver([sec, fmp]);

    const result = await resolver.getIncomeStatement(REF, "ANNUAL");

    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
    expect(result.source).toBeNull();
    expect(sec.calls).toBe(1);
    expect(fmp.calls).toBe(1);
    // Never fabricated — the combined reason must surface both failures.
    expect(result.unavailableReason).toContain("SEC ticker mapping unavailable");
    expect(result.unavailableReason).toContain("FMP returned HTTP 402");
  });
});

describe("ProviderResolver — failure information stays understandable", () => {
  it("labels each failed attempt by provider name even when source is null", async () => {
    const sec = fakeProvider("SecEdgarAdapter", unavailable("no CIK match"));
    const fmp = fakeProvider("FmpFinancialDataAdapter", unavailable("plan entitlement (402)"));
    const resolver = new ProviderResolver([sec, fmp]);

    const result = await resolver.getIncomeStatement(REF, "ANNUAL");

    // Falls back to the fake provider's constructor name since unavailable
    // results carry no source.providerName — still identifies which
    // provider produced which reason, never an anonymous blob of text.
    expect(result.unavailableReason).toContain("SecEdgarAdapter");
    expect(result.unavailableReason).toContain("no CIK match");
    expect(result.unavailableReason).toContain("FmpFinancialDataAdapter");
    expect(result.unavailableReason).toContain("plan entitlement (402)");
  });
});

describe("ProviderResolver — each statement type resolved independently", () => {
  it("does not let one statement type's outcome affect another", async () => {
    const sec: FinancialDataProvider = {
      async getIncomeStatement() {
        return available("SEC EDGAR");
      },
      async getBalanceSheet() {
        return unavailable("SEC balance sheet not implemented.");
      },
      async getCashFlow() {
        return unavailable("SEC cash flow not implemented.");
      },
    };
    const fmp: FinancialDataProvider = {
      async getIncomeStatement() {
        throw new Error("must not be called — SEC already succeeded for income statement");
      },
      async getBalanceSheet() {
        return available("Financial Modeling Prep");
      },
      async getCashFlow() {
        return unavailable("FMP cash flow not implemented.");
      },
    };
    const resolver = new ProviderResolver([sec, fmp]);

    const income = await resolver.getIncomeStatement(REF, "ANNUAL");
    const balance = await resolver.getBalanceSheet(REF, "ANNUAL");
    const cashFlow = await resolver.getCashFlow(REF, "ANNUAL");

    expect(income.source?.providerName).toBe("SEC EDGAR");
    expect(balance.source?.providerName).toBe("Financial Modeling Prep");
    expect(cashFlow.status).toBe("unavailable");
    expect(cashFlow.unavailableReason).toContain("SEC cash flow not implemented");
    expect(cashFlow.unavailableReason).toContain("FMP cash flow not implemented");
  });
});

describe("ProviderResolver — real adapter classes conform without modification", () => {
  it("accepts FmpFinancialDataAdapter and SecEdgarAdapter instances as-is", async () => {
    // Proves the resolver requires no changes to either real adapter — it
    // only depends on the FinancialDataProvider interface, unmodified.
    const { FmpFinancialDataAdapter } = await import("../src/providers/adapters/fmpAdapter");
    const { SecEdgarAdapter } = await import("../src/providers/adapters/secEdgarAdapter");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}), text: async () => "" })
    );

    const sec = new SecEdgarAdapter("EquityAI test@example.com");
    const fmp = new FmpFinancialDataAdapter("test-key");
    const resolver = new ProviderResolver([sec, fmp]);

    const result = await resolver.getIncomeStatement(REF, "ANNUAL");

    expect(result.status).toBe("unavailable");
    // Unavailable results carry no source.providerName, so the resolver
    // labels each attempt by the real adapter's class name.
    expect(result.unavailableReason).toContain("SecEdgarAdapter");
    expect(result.unavailableReason).toContain("FmpFinancialDataAdapter");
    vi.unstubAllGlobals();
  });
});
