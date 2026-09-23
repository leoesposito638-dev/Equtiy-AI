// ============================================================================
// Equity AI — FMP Earnings/Estimates Adapter (Milestone 13H, extended 14B)
//
// Implements EarningsProvider against FMP's real REST API. getEstimates()
// (annual consensus EPS, for Forward P/E) was implemented in Milestone 13H.
// getEarnings() (actual reported quarterly earnings + consensus, for EPS/
// revenue surprise) is implemented in Milestone 14B below.
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

/** Milestone 14B: live-verified against the current subscription — this
 *  endpoint's own `limit` parameter is capped independently of
 *  analyst-estimates' (requesting more than 5 returns an HTTP 402
 *  "Special Parameters" error, not a truncated result). 5 quarters is
 *  roughly the last year plus the next upcoming report, which is what
 *  historical-surprise + earnings-date coverage needs. */
const EARNINGS_LIMIT = 5;

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

/** Shape of one element of FMP's GET /earnings response. Only the fields
 *  this adapter reads are declared. Live-verified (Milestone 14B): NO
 *  distinct fiscal-period-end field exists on this endpoint — `date` is the
 *  report/announcement date only. See getEarnings()'s own comment for how
 *  that is handled without fabricating a period end. */
interface FmpEarningsRow {
  symbol?: string;
  date?: string; // report/announcement date, e.g. "2026-07-22"
  epsActual?: number | null;
  epsEstimated?: number | null;
  revenueActual?: number | null;
  revenueEstimated?: number | null;
  lastUpdated?: string;
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

  /** Milestone 14B. GET /stable/earnings?symbol={T}&limit=5 — returns both
   *  historical rows (epsActual/revenueActual populated) and the next
   *  upcoming scheduled report (both null, only the estimate side
   *  populated), all in one call. Gated on the same 14 demo tickers as
   *  every other FMP endpoint in this codebase (live-verified, Milestone
   *  14B: TXN/MA etc. return HTTP 402 here too) — never bypassed.
   *
   *  KNOWN LIMITATION, documented rather than worked around: this endpoint
   *  has no field distinguishing a fiscal PERIOD end from the report/
   *  announcement date — only `date` (the report date) is returned. The
   *  EarningsRecord interface (and the `earnings` table's `period_end`
   *  column) require a periodEnd, so this adapter deliberately reuses the
   *  one real date FMP provides for both `reportDate` and `periodEnd`
   *  rather than inventing an estimated fiscal-quarter-end date that FMP
   *  never supplied. This is NOT a fabricated value — no new date is
   *  invented — but it does mean `periodEnd` here is looser than its name
   *  implies (report date, not a true fiscal period end); see this
   *  milestone's final report for the "known limitations" note. */
  async getEarnings(ref: ProviderCompanyRef): Promise<ProviderResult<EarningsRecord[]>> {
    const requestUrl =
      `${FMP_BASE_URL}/earnings?symbol=${encodeURIComponent(ref.ticker)}&limit=${EARNINGS_LIMIT}` +
      `&apikey=${encodeURIComponent(this.apiKey)}`;
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
      // current subscription. Surfaced as unavailable, never bypassed.
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
    // "no earnings history exists".
    if (!Array.isArray(body) || body.length === 0) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `FMP returned no earnings rows for ${ref.ticker} at ${redactedUrl}.`,
      };
    }

    const records: EarningsRecord[] = [];
    const skipReasons: string[] = [];

    for (const raw of body as unknown[]) {
      const row = raw as FmpEarningsRow;

      if (!row.date) {
        skipReasons.push(`row for ${ref.ticker} is missing required field 'date' (from ${redactedUrl}).`);
        continue;
      }

      records.push({
        // See this method's doc comment: FMP does not separately supply a
        // fiscal period end on this endpoint, so the one real report date
        // is reused here rather than inventing one.
        periodEnd: row.date,
        reportDate: row.date,
        epsActual: typeof row.epsActual === "number" && !Number.isNaN(row.epsActual) ? row.epsActual : undefined,
        epsEstimate: typeof row.epsEstimated === "number" && !Number.isNaN(row.epsEstimated) ? row.epsEstimated : undefined,
        revenueActual: typeof row.revenueActual === "number" && !Number.isNaN(row.revenueActual) ? row.revenueActual : undefined,
        revenueEstimate:
          typeof row.revenueEstimated === "number" && !Number.isNaN(row.revenueEstimated) ? row.revenueEstimated : undefined,
        // guidanceText/guidanceDirection intentionally left undefined — FMP's
        // /stable/earnings response has no structured guidance field
        // (verified live, Milestone 14A/14B). Never inferred from estimates.
      });
    }

    if (records.length === 0) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: skipReasons.join(" ") || `FMP returned no usable earnings rows for ${ref.ticker} at ${redactedUrl}.`,
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
