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
import { SecEdgarAdapter } from "./adapters/secEdgarAdapter";
import { ProviderResolver } from "./resolver";
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
  // FMP_API_KEY / SEC_EDGAR_USER_AGENT are read here — the only place
  // financialData construction happens — and never logged or hardcoded.
  // financialData resolves through a ProviderResolver (Milestone 8B):
  // SEC EDGAR first (primary — see Milestone 8A Part 9), FMP as fallback.
  // Each is included only if its credential/config is present; if neither
  // is present, financialData falls back to the honest "unavailable"
  // adapter, same as every other not-yet-connected provider below.
  const financialDataProviders: FinancialDataProvider[] = [];
  if (process.env.SEC_EDGAR_USER_AGENT) {
    financialDataProviders.push(new SecEdgarAdapter(process.env.SEC_EDGAR_USER_AGENT));
  }
  if (process.env.FMP_API_KEY) {
    financialDataProviders.push(new FmpFinancialDataAdapter(process.env.FMP_API_KEY));
  }
  const financialData =
    financialDataProviders.length > 0
      ? new ProviderResolver(financialDataProviders)
      : unavailableFinancialDataProvider;

  return {
    marketData: unavailableMarketDataProvider,
    financialData,
    earnings: unavailableEarningsProvider,
    news: unavailableNewsProvider,
    filings: unavailableFilingProvider,
  };
}
