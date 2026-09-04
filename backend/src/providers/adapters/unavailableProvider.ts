// ============================================================================
// Equity AI — "Unavailable" Reference Adapter
//
// This is the ONLY provider adapter shipped in this environment, because this
// sandbox has no network access and no vendor API credentials configured.
// It implements every provider interface honestly: every call returns
// status: "unavailable" with a clear reason, never a fabricated number.
//
// This is not a placeholder to leave in production. It exists so that:
//   1. The rest of the pipeline (ingestion → validation → scoring → API) is
//      fully exercisable and testable without real data.
//   2. It demonstrates the required behavior of every real adapter you write
//      later: on any failure, timeout, or missing field, return
//      "unavailable" — never guess, never zero-fill, never carry over a
//      stale value silently.
//
// To go live: implement the same interfaces (MarketDataProvider,
// FinancialDataProvider, EarningsProvider, NewsProvider, FilingProvider)
// against a real vendor (e.g. SEC EDGAR + a market data API) in a sibling
// file, e.g. secEdgarAdapter.ts / polygonAdapter.ts, and register it in
// src/providers/registry.ts instead of this one. No other file changes.
// ============================================================================

import type {
  MarketDataProvider,
  FinancialDataProvider,
  EarningsProvider,
  NewsProvider,
  FilingProvider,
  ProviderResult,
  ProviderCompanyRef,
} from "../interfaces";

const NOT_CONFIGURED = "No live provider configured for this environment (no network access / no API credentials).";

function unavailable<T>(): ProviderResult<T> {
  return { status: "unavailable", data: null, source: null, unavailableReason: NOT_CONFIGURED };
}

export const unavailableMarketDataProvider: MarketDataProvider = {
  async getQuote(_ref: ProviderCompanyRef) {
    return unavailable();
  },
  async getHistoricalPrices(_ref: ProviderCompanyRef, _from: string, _to: string) {
    return unavailable();
  },
};

export const unavailableFinancialDataProvider: FinancialDataProvider = {
  async getIncomeStatement() {
    return unavailable();
  },
  async getBalanceSheet() {
    return unavailable();
  },
  async getCashFlow() {
    return unavailable();
  },
};

export const unavailableEarningsProvider: EarningsProvider = {
  async getEarnings() {
    return unavailable();
  },
  async getEstimates() {
    return unavailable();
  },
};

export const unavailableNewsProvider: NewsProvider = {
  async getCompanyNews() {
    return unavailable();
  },
};

export const unavailableFilingProvider: FilingProvider = {
  async getFilings() {
    return unavailable();
  },
};
