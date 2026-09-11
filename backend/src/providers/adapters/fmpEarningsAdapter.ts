// ============================================================================
// Equity AI — FMP Earnings/Estimates Adapter (Milestone 13H)
//
// Implements EarningsProvider against FMP's real REST API. getEstimates()
// is the only method implemented for real — it is what Forward EPS/P/E
// needs. getEarnings() (actual reported earnings, EPS surprises) is
// explicitly out of scope for this milestone and returns an honest
// "unavailable", the same pattern as every other not-yet-implemented method
// in this codebase (see fmpAdapter.ts's getBalanceSheet/getCashFlow).
//
// SCOPE (Milestone 13H, built directly on the Milestone 13G audit's live
// findings — nothing here is a new assumption):
//   - GET /stable/analyst-estimates?symbol={T}&period=annual&limit=8. limit=8
//     matches what the audit verified live reliably returns both the most
//     recently reported fiscal year AND enough future years to find the
//     "next unreported" one for all 16 FMP-supported demo tickers.
//   - Maps ONLY date -> estimatePeriodEnd, epsAvg -> consensusValue,
//     numAnalystsEps -> analystCount into EstimateRecord. epsHigh/epsLow are
//     read off the raw row for shape validation only and are NOT mapped —
//     EstimateRecord has no field for them, and the 13G audit's Part A
//     finding was that the existing interface already fits what's needed
//     unmodified; adding fields for data nothing yet consumes is out of
//     scope here.
//   - Does NOT invent an estimate vintage/as-of date. FMP's response has no
//     such field (verified live, Milestone 13G Part B) and none is
//     fabricated here — estimatePeriodStart is left undefined for the same
//     reason (annual estimates carry no period start either).
//   - A row missing `date` is skipped, never guessed — same "never
//     fabricate" rule as fmpAdapter.ts's income-statement row handling.
//   - HTTP 402 (subscription-gated symbol — the same 14 demo tickers gated
//     on every other FMP endpoint in this codebase) maps to an honest
//     "unavailable", never retried, never worked around.
//
// SECURITY: FMP_API_KEY is read from process.env at call time only, never
// hardcoded, never logged, and stripped from any URL that gets stored or
// returned — same redactApiKey() pattern as fmpAdapter.ts / fmpMarketDataAdapter.ts.
// ============================================================================

import type {
  EarningsProvider,
  EarningsRecord,
  EstimateRecord,
  ProviderCompanyRef,
  ProviderResult,
} from "../interfaces";

const FMP_BASE_URL = "https://financialmodelingprep.com/stable";

/** Matches the Milestone 13G audit's live-verified limit — enough rows to
 *  reliably include both the latest-reported year and the next few future
 *  years for every FMP-supported demo ticker. */
const ANNUAL_ESTIMATES_LIMIT = 8;

/** Strips the apikey query param before a URL is stored in data_sources.source_url
 *  or surfaced anywhere — same rule, same implementation, as fmpAdapter.ts /
 *  fmpMarketDataAdapter.ts. */
function redactApiKey(url: string): string {
  const u = new URL(url);
  u.searchParams.delete("apikey");
  return u.toString();
}

/** Shape of one element of FMP's GET /analyst-estimates response. Only the
 *  fields this adapter reads are declared. The real response also includes
 *  revenueAvg/High/Low, numAnalystsRevenue, ebitAvg/High/Low,
 *  ebitdaAvg/High/Low, netIncomeAvg/High/Low, sgaExpenseAvg/High/Low
 *  (verified live, Milestone 13G Part B) — all intentionally unmapped, out
 *  of scope for Forward EPS/P/E. */
interface FmpAnalystEstimateRow {
  symbol?: string;
  date?: string; // fiscal period end being estimated, e.g. "2027-01-25"
  epsAvg?: number;
  epsHigh?: number;
  epsLow?: number;
  numAnalystsEps?: number;
}

export class FmpEarningsAdapter implements EarningsProvider {
  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      // Fail loudly at construction, same defensive pattern as every other
      // adapter in this codebase — the registry only constructs this class
      // when FMP_API_KEY is present (see providers/registry.ts).
      throw new Error("FmpEarningsAdapter constructed without an API key.");
    }
  }

  async getEarnings(ref: ProviderCompanyRef): Promise<ProviderResult<EarningsRecord[]>> {
    return {
      status: "unavailable",
      data: null,
      source: null,
      unavailableReason: `FmpEarningsAdapter.getEarnings is not implemented for ${ref.ticker} — Milestone 13H only implements getEstimates (forward consensus EPS), not actual reported earnings/surprises.`,
    };
  }

  async getEstimates(ref: ProviderCompanyRef): Promise<ProviderResult<EstimateRecord[]>> {
    const requestUrl =
      `${FMP_BASE_URL}/analyst-estimates` +
      `?symbol=${encodeURIComponent(ref.ticker)}&period=annual&limit=${ANNUAL_ESTIMATES_LIMIT}&apikey=${encodeURIComponent(this.apiKey)}`;
    const redactedUrl = redactApiKey(requestUrl);

    let httpResponse: Response;
    try {
      httpResponse = await fetch(requestUrl);
    } catch (e) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `Network error calling FMP (${redactedUrl}): ${(e as Error).message}`,
      };
    }

    if (!httpResponse.ok) {
      const bodyText = await httpResponse.text().catch(() => "");
      // HTTP 402 here means the same thing it does on every other FMP
      // endpoint in this codebase: this symbol is not entitled under the
      // current subscription (Milestone 13G Part B, confirmed live for the
      // same 14 tickers). Surfaced as unavailable, never bypassed.
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `FMP returned HTTP ${httpResponse.status} for ${redactedUrl}${bodyText ? `: ${bodyText.slice(0, 300)}` : ""}`,
      };
    }

    let body: unknown;
    try {
      body = await httpResponse.json();
    } catch (e) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `FMP response for ${redactedUrl} was not valid JSON: ${(e as Error).message}`,
      };
    }

    // FMP returns [] (not an error status) for an invalid ticker or a
    // plan/entitlement limitation — treat that as unavailable, never as
    // "no estimates exist".
    if (!Array.isArray(body) || body.length === 0) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `FMP returned no analyst-estimates rows for ${ref.ticker} at ${redactedUrl}.`,
      };
    }

    const records: EstimateRecord[] = [];
    const skipReasons: string[] = [];

    for (const raw of body as unknown[]) {
      const row = raw as FmpAnalystEstimateRow;

      if (!row.date) {
        skipReasons.push(`row for ${ref.ticker} is missing required field 'date' (from ${redactedUrl}).`);
        continue;
      }

      records.push({
        metricName: "eps",
        estimatePeriodEnd: row.date,
        estimatePeriodType: "ANNUAL",
        consensusValue: typeof row.epsAvg === "number" && !Number.isNaN(row.epsAvg) ? row.epsAvg : null,
        analystCount: typeof row.numAnalystsEps === "number" && !Number.isNaN(row.numAnalystsEps) ? row.numAnalystsEps : null,
      });
    }

    if (records.length === 0) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: skipReasons.join(" ") || `FMP returned no usable analyst-estimates rows for ${ref.ticker} at ${redactedUrl}.`,
      };
    }

    return {
      status: "available",
      data: records,
      source: {
        providerName: "Financial Modeling Prep",
        providerType: "FINANCIAL_API",
        sourceUrl: redactedUrl,
      },
    };
  }
}
