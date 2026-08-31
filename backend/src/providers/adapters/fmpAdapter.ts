// ============================================================================
// Equity AI — Financial Modeling Prep (FMP) Adapter
//
// Implements FinancialDataProvider against FMP's real REST API. This is the
// ONLY file in the codebase that talks to FMP or reads FMP_API_KEY.
//
// SCOPE FOR THIS FIRST INCREMENT (deliberately narrow, per the integration
// test brief):
//   - getIncomeStatement: implemented for real, ANNUAL period only, and maps
//     ONLY the `revenue` field into a RawLineItem. Every other line item on
//     FMP's income-statement response (grossProfit, operatingIncome,
//     netIncome, eps, ...) is intentionally left unmapped for now — see the
//     TODO below. Extending it is additive (more entries in the returned
//     array), not a redesign.
//   - getBalanceSheet / getCashFlow: NOT implemented yet. They return an
//     explicit "unavailable" result rather than silently returning nothing
//     or guessing — consistent with every other adapter in this codebase
//     (see unavailableProvider.ts).
//
// SECURITY: FMP_API_KEY is read from process.env at call time, never
// hardcoded, never logged, and never included in any URL that gets stored
// or returned — see redactApiKey() below. This file is backend-only; it is
// never imported by anything in the frontend project, so the key can't reach
// the browser.
// ============================================================================

import type {
  FinancialDataProvider,
  ProviderCompanyRef,
  ProviderResult,
  RawLineItem,
} from "../interfaces";
import type { PeriodType } from "../../types/domain";

// FMP retired the /api/v3/* endpoints (legacy, pre-2025-08-31 subscriptions only)
// in favor of /stable/* — same response shape, symbol passed as a query param
// instead of a path segment. See https://site.financialmodelingprep.com/developer/docs/stable/income-statement
const FMP_BASE_URL = "https://financialmodelingprep.com/stable";

/** Strips the apikey query param before a URL is stored in data_sources.source_url
 *  or surfaced anywhere — the secret must never end up in the database or in
 *  anything the frontend could eventually display as "source". */
function redactApiKey(url: string): string {
  const u = new URL(url);
  u.searchParams.delete("apikey");
  return u.toString();
}

/** Shape of one element of FMP's GET /income-statement/{symbol} response.
 *  Only the fields this adapter currently reads are declared — FMP's real
 *  response has many more fields (grossProfit, operatingIncome, netIncome,
 *  eps, costOfRevenue, ...) that a future increment will map once more
 *  metrics are brought online. Declaring only what we use also means a
 *  missing/renamed field elsewhere in FMP's response can't silently break
 *  parsing of the fields we do rely on. */
interface FmpIncomeStatementRow {
  date?: string; // period end, e.g. "2026-01-26"
  symbol?: string;
  reportedCurrency?: string;
  period?: string; // "FY" for annual, "Q1".."Q4" for quarterly
  revenue?: number;
  fillingDate?: string; // FMP's historical (misspelled) field name
  filingDate?: string; // some FMP endpoints/versions use the correctly-spelled key
  cik?: string;
  link?: string; // SEC filing index page
  finalLink?: string; // direct link to the filed document
}

function fmpPeriodParam(periodType: PeriodType): string | null {
  if (periodType === "ANNUAL") return "annual";
  if (periodType === "QUARTER") return "quarter";
  return null; // TTM/INSTANT are not directly served by this endpoint — see below
}

export class FmpFinancialDataAdapter implements FinancialDataProvider {
  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      // Fail loudly at construction time rather than on first use — the
      // registry only constructs this class when FMP_API_KEY is present
      // (see providers/registry.ts), so reaching this means a caller
      // bypassed the registry.
      throw new Error("FmpFinancialDataAdapter constructed without an API key.");
    }
  }

  async getIncomeStatement(ref: ProviderCompanyRef, periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>> {
    const periodParam = fmpPeriodParam(periodType);
    if (!periodParam) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason:
          `FMP income-statement adapter does not yet support period_type '${periodType}' ` +
          `(only ANNUAL and QUARTER map directly to FMP's period= parameter; TTM would require ` +
          `summing four quarters and isn't implemented in this increment).`,
      };
    }

    const requestUrl =
      `${FMP_BASE_URL}/income-statement` +
      `?symbol=${encodeURIComponent(ref.ticker)}&period=${periodParam}&limit=1&apikey=${encodeURIComponent(this.apiKey)}`;
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

    // FMP returns [] (not an error status) for an invalid/unknown ticker or
    // a plan/entitlement limitation — treat that as unavailable, not "zero revenue".
    if (!Array.isArray(body) || body.length === 0) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `FMP returned no income-statement rows for ${ref.ticker} at ${redactedUrl}.`,
      };
    }

    const row = body[0] as FmpIncomeStatementRow;

    // Defensive field validation — refuse to fabricate/guess any of these.
    const missing: string[] = [];
    if (typeof row.revenue !== "number" || Number.isNaN(row.revenue)) missing.push("revenue");
    if (!row.date) missing.push("date");
    if (!row.reportedCurrency) missing.push("reportedCurrency");
    const filingDate = row.fillingDate ?? row.filingDate;

    if (missing.length > 0) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `FMP row for ${ref.ticker} is missing required field(s): ${missing.join(", ")} (from ${redactedUrl}).`,
      };
    }

    // Sanity-check that FMP actually gave us the period type we asked for,
    // rather than trusting it blindly — mislabeling QUARTER data as ANNUAL
    // (or vice versa) is exactly the kind of silent corruption the brief's
    // validation rules exist to catch.
    const expectedFmpPeriod = periodType === "ANNUAL" ? "FY" : undefined;
    if (expectedFmpPeriod && row.period && row.period !== expectedFmpPeriod) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `Requested period_type ANNUAL but FMP row for ${ref.ticker} reports period='${row.period}' (expected 'FY') — refusing to mislabel it.`,
      };
    }

    const lineItems: RawLineItem[] = [
      {
        metricName: "revenue",
        metricIdentifier: "fmp.income_statement.revenue",
        rawValue: row.revenue!,
        unit: "USD",
        currency: row.reportedCurrency!,
        periodEnd: row.date!,
        periodType,
        filingDate,
      },
      // TODO(next increment): map grossProfit -> gross_profit,
      // operatingIncome -> operating_income, netIncome -> net_income,
      // eps -> eps, following this exact same pattern. Each addition is one
      // more object in this array — ingest.ts requires no changes.
    ];

    return {
      status: "available",
      data: lineItems,
      source: {
        providerName: "Financial Modeling Prep",
        providerType: "FINANCIAL_API",
        sourceUrl: redactedUrl, // API key stripped — never persisted or returned
        sourceDocumentId: row.cik ?? undefined,
        filingDate,
        reportingPeriodEnd: row.date,
        currency: row.reportedCurrency,
      },
    };
  }

  async getBalanceSheet(ref: ProviderCompanyRef, _periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>> {
    return {
      status: "unavailable",
      data: null,
      source: null,
      unavailableReason: `FmpFinancialDataAdapter.getBalanceSheet is not implemented yet for ${ref.ticker} — this first FMP integration increment covers income-statement revenue only.`,
    };
  }

  async getCashFlow(ref: ProviderCompanyRef, _periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>> {
    return {
      status: "unavailable",
      data: null,
      source: null,
      unavailableReason: `FmpFinancialDataAdapter.getCashFlow is not implemented yet for ${ref.ticker} — this first FMP integration increment covers income-statement revenue only.`,
    };
  }
}
