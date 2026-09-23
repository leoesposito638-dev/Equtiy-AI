// ============================================================================
// Equity AI — Provider Interfaces
//
// The application NEVER imports a concrete provider (e.g. an SEC EDGAR
// client or a market-data vendor SDK) directly. It depends only on these
// interfaces. Swapping or adding a data vendor means writing one new adapter
// file in src/providers/adapters/ — nothing else in the codebase changes.
//
// Every method returns a `ProviderResult<T>`, which is EITHER real data with
// full source attribution, OR an explicit "unavailable" — never a fabricated
// fallback value. Ingestion (src/ingestion) is the only layer allowed to
// write these results into the database.
// ============================================================================

import type { DataStatus, PeriodType, ProviderType } from "../types/domain";

/** Every fact a provider returns is wrapped with this envelope. */
export interface ProviderResult<T> {
  status: DataStatus;
  data: T | null;
  source: {
    providerName: string;
    providerType: ProviderType;
    sourceUrl?: string;
    sourceDocumentId?: string;
    publishedAt?: string;
    filingDate?: string;
    reportingPeriodStart?: string;
    reportingPeriodEnd?: string;
    currency?: string;
  } | null;
  /** Present when status !== 'available' — human-readable, never guessed at. */
  unavailableReason?: string;
}

export interface RawLineItem {
  metricName: string;
  metricIdentifier?: string; // e.g. XBRL tag
  rawValue: number | null;
  rawText?: string;
  unit: string;
  currency: string;
  periodStart?: string;
  periodEnd: string;
  periodType: PeriodType;
  filingDate?: string;
}

export interface Quote {
  price: number;
  marketCap: number | null;
  volume: number | null;
  sharesOutstanding: number | null;
  high52w: number | null;
  low52w: number | null;
  timestamp: string;
  /** Milestone 13F. Not part of the original Quote shape — added because
   *  Enterprise Value is one of the minimum required valuation inputs and,
   *  per that milestone's explicit decision, must come from a single
   *  provider's own bundled figure (never reconstructed by combining this
   *  provider's price/shares with a different provider's debt/cash), so it
   *  belongs alongside the rest of this same quote, not a separate call. */
  enterpriseValue: number | null;
}

/** Milestone 13F — a provider's own pre-computed, internally consistent TTM
 *  valuation ratios. Deliberately NOT derived here from separately-fetched
 *  numerator/denominator pairs (e.g. our own EV ÷ our own EBITDA) — each
 *  value is exactly what the provider itself already divided, so it can
 *  never silently mix two different periods or two different providers
 *  inside one ratio. A field is null when the provider didn't return it,
 *  never computed as a fallback. */
export interface ValuationRatios {
  pe: number | null;
  evToEbitda: number | null;
  evToSales: number | null;
  priceToFcf: number | null;
  fcfYield: number | null;
}

/** Milestone 15C — one fiscal year of FMP's own balance-sheet-statement +
 *  income-statement facts, ALREADY period-aligned by FMP itself (both
 *  statements share the same `date`/fiscal year for a real 10-K filing —
 *  confirmed live for every FMP-entitled company). Every field here comes
 *  from FMP alone; this type exists specifically so the debt-metric
 *  calculations built on it are never tempted to reach for a SEC-sourced
 *  value to fill a gap — see calculations/fmpDebtMetrics.ts. */
export interface FmpDebtMetricsPeriod {
  periodEnd: string;
  totalDebt: number | null;
  cashAndCashEquivalents: number | null;
  totalStockholdersEquity: number | null;
  operatingIncome: number | null;
  depreciationAndAmortization: number | null;
}

export interface EarningsRecord {
  periodStart?: string;
  periodEnd: string;
  reportDate: string;
  epsActual?: number;
  epsEstimate?: number;
  revenueActual?: number;
  revenueEstimate?: number;
  guidanceText?: string;
  guidanceDirection?: "RAISED" | "MAINTAINED" | "LOWERED" | "WITHDRAWN" | "UNKNOWN";
}

export interface EstimateRecord {
  metricName: string;
  estimatePeriodStart?: string;
  estimatePeriodEnd: string;
  estimatePeriodType: "QUARTER" | "ANNUAL" | "TTM";
  consensusValue: number | null;
  analystCount: number | null;
}

/** Milestone 13H. A live/current market price — deliberately a SEPARATE
 *  shape from Quote, never a reinterpretation of Quote.price. Quote (see
 *  above) is period-tagged to the vendor's last reporting-period bundle
 *  (Milestone 13F's enterprise-values source) and is correct for TRAILING
 *  valuation (price as of the same period as the trailing EPS/EBITDA it's
 *  divided by). Forward P/E needs the opposite: today's price divided by a
 *  FUTURE consensus estimate — reusing Quote.price there would silently
 *  mismatch two different reference dates (verified live, Milestone 13G
 *  Part E: NVDA's enterprise-values price was ~7 months stale relative to
 *  its live price, a ~17% difference). Kept as its own interface method
 *  rather than adding a field to Quote so existing Quote consumers/tests
 *  are unaffected. */
export interface LivePrice {
  price: number;
  timestamp: string;
}

/** Milestone 14D. Only one value exists today — the codebase reads exactly
 *  one FMP endpoint variant (dividend-adjusted) and never any other. Kept
 *  as its own type (not a bare string) so a future second source/variant
 *  is a real, reviewed addition here, never an implicit reinterpretation
 *  of what's already stored. See daily_prices.adjustment_type. */
export type PriceAdjustmentType = "split_and_dividend_adjusted";

/** Milestone 14D — one trading day's OHLCV, explicitly adjusted (see
 *  PriceAdjustmentType). Replaces getHistoricalPrices()'s old inline
 *  `{date, close, volume}` shape: the Milestone 14C audit found that FMP's
 *  plain-named `full` endpoint (open/high/low/close, no "adj" prefix) is
 *  ALREADY split-adjusted but NOT dividend-adjusted, while a same-shaped
 *  `non-split-adjusted` endpoint returns genuinely raw prices under
 *  identically-named fields — a real, easy-to-miss correctness trap if the
 *  adjustment basis is left implicit in a URL string instead of the type.
 *  `adjustmentType` makes every consumer state, at compile time, which
 *  basis it is reading. */
export interface DailyPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  adjustmentType: PriceAdjustmentType;
}

export interface NewsItem {
  title: string;
  description?: string;
  publishedAt: string;
  url?: string;
  eventType?: string; // maps toward company_events.event_type once classified
}

export interface FilingRecord {
  documentType: string;
  documentId: string;
  filingDate: string;
  periodEnd?: string;
  url?: string;
}

/** External identifier used by providers — usually ticker+exchange, or a provider-native id. */
export interface ProviderCompanyRef {
  ticker: string;
  exchange?: string;
  providerNativeId?: string;
}

export interface MarketDataProvider {
  getQuote(ref: ProviderCompanyRef): Promise<ProviderResult<Quote>>;
  /** Milestone 14D — see DailyPrice's own doc comment for why this is no
   *  longer an inline `{date, close, volume}` shape. */
  getHistoricalPrices(ref: ProviderCompanyRef, from: string, to: string): Promise<ProviderResult<DailyPrice[]>>;
  /** Milestone 13F. */
  getValuationRatios(ref: ProviderCompanyRef): Promise<ProviderResult<ValuationRatios>>;
  /** Milestone 13H — see LivePrice's doc comment for why this is not just
   *  Quote.price. */
  getLivePrice(ref: ProviderCompanyRef): Promise<ProviderResult<LivePrice>>;
  /** Milestone 15C — real, historical (up to 4 fiscal years) balance-sheet +
   *  income-statement facts sourced ONLY from FMP, for the debt-derived
   *  metrics (total_debt_fmp/net_debt_fmp/debt_to_equity_fmp/
   *  net_debt_to_ebitda_fmp) — never SEC EDGAR. See FmpDebtMetricsPeriod's
   *  own doc comment. */
  getDebtMetricsHistory(ref: ProviderCompanyRef): Promise<ProviderResult<FmpDebtMetricsPeriod[]>>;
}

export interface FinancialDataProvider {
  getIncomeStatement(ref: ProviderCompanyRef, periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>>;
  getBalanceSheet(ref: ProviderCompanyRef, periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>>;
  getCashFlow(ref: ProviderCompanyRef, periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>>;
}

export interface EarningsProvider {
  getEarnings(ref: ProviderCompanyRef): Promise<ProviderResult<EarningsRecord[]>>;
  getEstimates(ref: ProviderCompanyRef): Promise<ProviderResult<EstimateRecord[]>>;
}

export interface NewsProvider {
  getCompanyNews(ref: ProviderCompanyRef, since?: string): Promise<ProviderResult<NewsItem[]>>;
}

export interface FilingProvider {
  getFilings(ref: ProviderCompanyRef, since?: string): Promise<ProviderResult<FilingRecord[]>>;
}
