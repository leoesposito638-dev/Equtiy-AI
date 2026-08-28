// ============================================================================
// Equity AI — Provider Registry
// Single place the rest of the app resolves providers from. Swap the
// `unavailable*` adapters for real ones here once credentials exist — no
// other file needs to change.
// ============================================================================

import {
  unavailableMarketDataProvider,
  unavailableFinancialDataProvider,
  unavailableEarningsProvider,
  unavailableNewsProvider,
  unavailableFilingProvider,
} from "./adapters/unavailableProvider";
import { FmpFinancialDataAdapter } from "./adapters/fmpAdapter";
import type {
  MarketDataProvider,
  FinancialDataProvider,
  EarningsProvider,
  NewsProvider,
  FilingProvider,
} from "./interfaces";

export interface ProviderRegistry {
  marketData: MarketDataProvider;
  financialData: FinancialDataProvider;
  earnings: EarningsProvider;
  news: NewsProvider;
  filings: FilingProvider;
}

export function buildProviderRegistry(): ProviderRegistry {
  // FMP_API_KEY is read here — the only place financialData construction
  // happens — and never logged or hardcoded. If it's absent, financialData
  // falls back to the honest "unavailable" adapter, same as every other
  // not-yet-connected provider below.
  const financialData = process.env.FMP_API_KEY
    ? new FmpFinancialDataAdapter(process.env.FMP_API_KEY)
    : unavailableFinancialDataProvider;

  return {
    marketData: unavailableMarketDataProvider,
    financialData,
    earnings: unavailableEarningsProvider,
    news: unavailableNewsProvider,
    filings: unavailableFilingProvider,
  };
}
