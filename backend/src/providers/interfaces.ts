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
  getHistoricalPrices(
    ref: ProviderCompanyRef,
    from: string,
    to: string
  ): Promise<ProviderResult<Array<{ date: string; close: number; volume: number }>>>;
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
