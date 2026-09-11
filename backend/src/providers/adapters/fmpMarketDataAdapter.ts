// ============================================================================
// Equity AI — FMP Market Data Adapter (Milestone 13F)
//
// Implements MarketDataProvider against FMP's real REST API. This is the
// ONLY file besides fmpAdapter.ts that talks to FMP or reads FMP_API_KEY —
// kept separate from FmpFinancialDataAdapter because it answers a different
// question (market/price facts, not financial-statement facts) and the
// schema keeps them apart the same way (market_data vs financial_metrics).
//
// SCOPE (Milestone 13F — minimum viable valuation foundation):
//   - getQuote: sourced from /stable/enterprise-values, NOT /stable/quote.
//     The audit (Milestone 13 valuation audit) confirmed enterprise-values
//     returns a `date`-tagged, internally consistent bundle — stockPrice,
//     numberOfShares, marketCapitalization, enterpriseValue all computed
//     together, together — rather than a live "right now" price with no
//     period alignment to anything. Enterprise Value is included in Quote
//     for exactly this reason: it must never be reconstructed by combining
//     this adapter's price/shares with a different provider's debt/cash.
//   - getHistoricalPrices: NOT implemented — valuation needs a single
//     period-end price, not a price history. Honest "unavailable", same
//     pattern as every other not-yet-implemented method in this codebase.
//   - getValuationRatios: sourced from /stable/ratios-ttm. Every field is
//     copied verbatim from FMP's own already-divided ratio — never
//     recomputed from separately-fetched pieces, so it can never mix a
//     period or a provider by accident.
//
// KNOWN FEASIBILITY FINDING this adapter encodes (valuation audit,
// verified live against all 30 demo tickers): the current FMP_API_KEY's
// subscription tier serves exactly 16 of the 30 demo tickers — the SAME 14
// (TXN, IBM, ORCL, QCOM, LOW, MCD, MA, SCHW, LLY, MRK, CAT, DE, PG, COP)
// return HTTP 402 "Premium Query Parameter... not available under your
// current subscription" on EVERY endpoint tested, including the
// income-statement endpoint already in production use. This is a per-symbol
// subscription gate, not a per-endpoint one, and not a code bug — a 402 is
// mapped to an honest "unavailable" result here, the same as any other
// missing-data case, never worked around.
//
// SECURITY: FMP_API_KEY is read from process.env at call time, never
// hardcoded, never logged, and never included in any URL that gets stored
// or returned — see redactApiKey() below (copied from fmpAdapter.ts's own,
// not re-derived differently).
// ============================================================================

import type {
  LivePrice,
  MarketDataProvider,
  ProviderCompanyRef,
  ProviderResult,
  Quote,
  ValuationRatios,
} from "../interfaces";

const FMP_BASE_URL = "https://financialmodelingprep.com/stable";

/** Strips the apikey query param before a URL is stored in data_sources.source_url
 *  or surfaced anywhere — same rule, same implementation, as fmpAdapter.ts. */
function redactApiKey(url: string): string {
  const u = new URL(url);
  u.searchParams.delete("apikey");
  return u.toString();
}

/** Shape of one element of FMP's GET /enterprise-values response. Only the
 *  fields this adapter reads are declared. */
interface FmpEnterpriseValueRow {
  symbol?: string;
  date?: string;
  stockPrice?: number;
  numberOfShares?: number;
  marketCapitalization?: number;
  minusCashAndCashEquivalents?: number;
  addTotalDebt?: number;
  enterpriseValue?: number;
}

/** Shape of FMP's GET /ratios-ttm response (single object, not an array).
 *  Only the 5 fields this milestone maps are declared — FMP's real response
 *  has many more (see the audit's full key dump); Forward P/E and any
 *  diluted/TTM-EPS-specific field are intentionally NOT read here, per
 *  Milestone 13F's explicit scope boundary. */
interface FmpRatiosTtmRow {
  symbol?: string;
  priceToEarningsRatioTTM?: number;
  priceToFreeCashFlowRatioTTM?: number;
}

/** Shape of FMP's GET /key-metrics-ttm response (single object). Used for
 *  evToEBITDATTM, evToSalesTTM, and freeCashFlowYieldTTM — verified live
 *  (Milestone 13F) that freeCashFlowYieldTTM exists ONLY here, not on
 *  ratios-ttm, despite both endpoints sharing several other TTM field names.
 *  Both endpoints are queried and each of this milestone's 5 ratios is read
 *  from whichever one actually names it — never recomputed from the other's
 *  components. */
interface FmpKeyMetricsTtmRow {
  symbol?: string;
  evToEBITDATTM?: number;
  evToSalesTTM?: number;
  freeCashFlowYieldTTM?: number;
}

/** Shape of FMP's GET /quote response (an array). This is the LIVE quote
 *  endpoint — deliberately NOT used by getQuote() above (see that method's
 *  own comment and this file's header). Only the two fields getLivePrice()
 *  reads are declared; the real response also has changePercentage, volume,
 *  dayLow/High, yearLow/High, marketCap, priceAvg50/200, exchange, open,
 *  previousClose (verified live, Milestone 13G Part E), all unused here. */
interface FmpQuoteRow {
  symbol?: string;
  price?: number;
  timestamp?: number; // unix seconds, verified live (e.g. 1789055787)
}

async function fmpGet<T>(path: string, apiKey: string): Promise<{ ok: true; body: T; redactedUrl: string } | { ok: false; reason: string }> {
  const requestUrl = `${FMP_BASE_URL}${path}${path.includes("?") ? "&" : "?"}apikey=${encodeURIComponent(apiKey)}`;
  const redactedUrl = redactApiKey(requestUrl);

  let httpResponse: Response;
  try {
    httpResponse = await fetch(requestUrl);
  } catch (e) {
    return { ok: false, reason: `Network error calling FMP (${redactedUrl}): ${(e as Error).message}` };
  }

  if (!httpResponse.ok) {
    const bodyText = await httpResponse.text().catch(() => "");
    // HTTP 402 here specifically means "this symbol/endpoint is not
    // entitled under the current subscription" (verified empirically,
    // Milestone 13 valuation audit) — surfaced as unavailable like any
    // other missing-data case, never retried, never worked around.
    return {
      ok: false,
      reason: `FMP returned HTTP ${httpResponse.status} for ${redactedUrl}${bodyText ? `: ${bodyText.slice(0, 300)}` : ""}`,
    };
  }

  let body: unknown;
  try {
    body = await httpResponse.json();
  } catch (e) {
    return { ok: false, reason: `FMP response for ${redactedUrl} was not valid JSON: ${(e as Error).message}` };
  }

  return { ok: true, body: body as T, redactedUrl };
}

export class FmpMarketDataAdapter implements MarketDataProvider {
  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error("FmpMarketDataAdapter constructed without an API key.");
    }
  }

  async getQuote(ref: ProviderCompanyRef): Promise<ProviderResult<Quote>> {
    const result = await fmpGet<FmpEnterpriseValueRow[]>(
      `/enterprise-values?symbol=${encodeURIComponent(ref.ticker)}&limit=1`,
      this.apiKey
    );
    if (!result.ok) {
      return { status: "unavailable", data: null, source: null, unavailableReason: result.reason };
    }

    const row = Array.isArray(result.body) ? result.body[0] : undefined;
    if (!row || typeof row.stockPrice !== "number" || !row.date) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `FMP returned no usable enterprise-values row for ${ref.ticker} at ${result.redactedUrl}.`,
      };
    }

    const quote: Quote = {
      price: row.stockPrice,
      marketCap: typeof row.marketCapitalization === "number" ? row.marketCapitalization : null,
      // Not returned by enterprise-values — honestly absent, never guessed.
      volume: null,
      high52w: null,
      low52w: null,
      sharesOutstanding: typeof row.numberOfShares === "number" ? row.numberOfShares : null,
      enterpriseValue: typeof row.enterpriseValue === "number" ? row.enterpriseValue : null,
      timestamp: row.date,
    };

    return {
      status: "available",
      data: quote,
      source: {
        providerName: "Financial Modeling Prep",
        providerType: "MARKET_DATA",
        sourceUrl: result.redactedUrl,
        reportingPeriodEnd: row.date,
        currency: "USD",
      },
    };
  }

  async getHistoricalPrices(
    ref: ProviderCompanyRef,
    _from: string,
    _to: string
  ): Promise<ProviderResult<Array<{ date: string; close: number; volume: number }>>> {
    return {
      status: "unavailable",
      data: null,
      source: null,
      unavailableReason: `FmpMarketDataAdapter.getHistoricalPrices is not implemented for ${ref.ticker} — Milestone 13F only needs a single period-end quote for valuation, not a price history.`,
    };
  }

  async getValuationRatios(ref: ProviderCompanyRef): Promise<ProviderResult<ValuationRatios>> {
    const [ratiosResult, keyMetricsResult] = await Promise.all([
      fmpGet<FmpRatiosTtmRow[] | FmpRatiosTtmRow>(`/ratios-ttm?symbol=${encodeURIComponent(ref.ticker)}`, this.apiKey),
      fmpGet<FmpKeyMetricsTtmRow[] | FmpKeyMetricsTtmRow>(`/key-metrics-ttm?symbol=${encodeURIComponent(ref.ticker)}`, this.apiKey),
    ]);

    if (!ratiosResult.ok && !keyMetricsResult.ok) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `${ratiosResult.ok ? "" : ratiosResult.reason} ${keyMetricsResult.ok ? "" : keyMetricsResult.reason}`.trim(),
      };
    }

    const ratiosRow = ratiosResult.ok
      ? (Array.isArray(ratiosResult.body) ? ratiosResult.body[0] : ratiosResult.body)
      : undefined;
    const keyMetricsRow = keyMetricsResult.ok
      ? (Array.isArray(keyMetricsResult.body) ? keyMetricsResult.body[0] : keyMetricsResult.body)
      : undefined;

    if (!ratiosRow && !keyMetricsRow) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `FMP returned no usable TTM ratio data for ${ref.ticker}.`,
      };
    }

    const num = (v: unknown): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null);

    const ratios: ValuationRatios = {
      pe: num(ratiosRow?.priceToEarningsRatioTTM),
      evToEbitda: num(keyMetricsRow?.evToEBITDATTM),
      evToSales: num(keyMetricsRow?.evToSalesTTM),
      priceToFcf: num(ratiosRow?.priceToFreeCashFlowRatioTTM),
      fcfYield: num(keyMetricsRow?.freeCashFlowYieldTTM),
    };

    if (Object.values(ratios).every((v) => v === null)) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `FMP TTM ratio responses for ${ref.ticker} contained no usable values for any of the 5 supported metrics.`,
      };
    }

    return {
      status: "available",
      data: ratios,
      source: {
        providerName: "Financial Modeling Prep",
        providerType: "MARKET_DATA",
        sourceUrl: (ratiosResult.ok ? ratiosResult.redactedUrl : (keyMetricsResult as { ok: true; redactedUrl: string }).redactedUrl),
        currency: "USD",
      },
    };
  }

  /** Milestone 13H. Sourced from /stable/quote — a genuinely live price,
   *  confirmed live against NVDA to carry today's actual timestamp (unlike
   *  getQuote()'s enterprise-values price, which is tagged to the last
   *  annual reporting period). Never used to backfill Quote.enterpriseValue
   *  or any TTM ratio above — this method exists solely for Forward P/E's
   *  numerator. */
  async getLivePrice(ref: ProviderCompanyRef): Promise<ProviderResult<LivePrice>> {
    const result = await fmpGet<FmpQuoteRow[]>(`/quote?symbol=${encodeURIComponent(ref.ticker)}`, this.apiKey);
    if (!result.ok) {
      return { status: "unavailable", data: null, source: null, unavailableReason: result.reason };
    }

    const row = Array.isArray(result.body) ? result.body[0] : undefined;
    if (!row || typeof row.price !== "number" || typeof row.timestamp !== "number") {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `FMP returned no usable /quote row for ${ref.ticker} at ${result.redactedUrl}.`,
      };
    }

    const timestamp = new Date(row.timestamp * 1000).toISOString();

    return {
      status: "available",
      data: { price: row.price, timestamp },
      source: {
        providerName: "Financial Modeling Prep",
        providerType: "MARKET_DATA",
        sourceUrl: result.redactedUrl,
        publishedAt: timestamp,
        currency: "USD",
      },
    };
  }
}
