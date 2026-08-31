// ============================================================================
// Equity AI — Financial Modeling Prep (FMP) Adapter
//
// Implements FinancialDataProvider against FMP's real REST API. This is the
// ONLY file in the codebase that talks to FMP or reads FMP_API_KEY.
//
// SCOPE (Milestone 2 — GROWTH category raw-data foundation):
//   - getIncomeStatement: implemented for real, ANNUAL and QUARTER periods,
//     mapping `revenue`, `netIncome` -> net_income, and `eps` into
//     RawLineItems, across up to LOOKBACK_PERIODS periods (not just
//     the latest one) — this is what score_rules for GROWTH actually needs:
//     revenue_growth_yoy / eps_growth_yoy need 2 periods, growth_acceleration
//     needs 3, revenue_cagr_3y / eps_cagr need 4 (see schema/004_seed_scoring_config.sql).
//     Every other line item on FMP's income-statement response (grossProfit,
//     operatingIncome, ebitda, ...) is intentionally left unmapped for now —
//     see the TODO below. Extending it is additive (more entries in the
//     returned array), not a redesign.
//   - Each period-row is processed independently: a row missing a specific
//     metric (e.g. no `eps` for one year) simply doesn't produce a line item
//     for that metric/period — it never blocks the other metrics or periods
//     in the same response. A row missing structural fields (date/currency)
//     or reporting FMP's own `period` label mismatched from what was
//     requested is skipped entirely, same "never fabricate" rule as before.
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
 *  response has many more fields (grossProfit, operatingIncome, ebitda,
 *  costOfRevenue, ...) that a future increment will map once more metrics
 *  are brought online. Declaring only what we use also means a
 *  missing/renamed field elsewhere in FMP's response can't silently break
 *  parsing of the fields we do rely on. Field names confirmed against FMP's
 *  stable income-statement schema (date, symbol, reportedCurrency,
 *  fillingDate, period, revenue, netIncome, eps, ... — unchanged from v3). */
interface FmpIncomeStatementRow {
  date?: string; // period end, e.g. "2026-01-26"
  symbol?: string;
  reportedCurrency?: string;
  period?: string; // "FY" for annual, "Q1".."Q4" for quarterly
  revenue?: number;
  netIncome?: number;
  eps?: number; // basic EPS (net income / weighted average basic shares)
  fillingDate?: string; // FMP's historical (misspelled) field name
  filingDate?: string; // some FMP endpoints/versions use the correctly-spelled key
  cik?: string;
  link?: string; // SEC filing index page
  finalLink?: string; // direct link to the filed document
}

/** How many trailing periods to request. Matches the largest
 *  minimum_data_points among GROWTH's score_rules (revenue_cagr_3y /
 *  eps_cagr both require 4: current + 3 years back) — see
 *  schema/004_seed_scoring_config.sql. Not a guess: fetching more than the
 *  rules actually need would be scope creep, fetching less would leave the
 *  CAGR rules permanently under-covered. */
const LOOKBACK_PERIODS = 4;

function fmpPeriodParam(periodType: PeriodType): string | null {
  if (periodType === "ANNUAL") return "annual";
  if (periodType === "QUARTER") return "quarter";
  return null; // TTM/INSTANT are not directly served by this endpoint — see below
}

/** One (metricName, unit) pair this adapter knows how to pull off an
 *  FmpIncomeStatementRow, keyed by the row field it reads. Adding a metric
 *  is adding one entry here — see the TODO at the bottom of this file for
 *  what's still unmapped. */
const INCOME_STATEMENT_METRIC_FIELDS: Array<{
  metricName: string;
  metricIdentifier: string;
  unit: string;
  read: (row: FmpIncomeStatementRow) => number | undefined;
}> = [
  { metricName: "revenue", metricIdentifier: "fmp.income_statement.revenue", unit: "USD", read: (r) => r.revenue },
  { metricName: "net_income", metricIdentifier: "fmp.income_statement.netIncome", unit: "USD", read: (r) => r.netIncome },
  { metricName: "eps", metricIdentifier: "fmp.income_statement.eps", unit: "USD_PER_SHARE", read: (r) => r.eps },
];

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
      `?symbol=${encodeURIComponent(ref.ticker)}&period=${periodParam}&limit=${LOOKBACK_PERIODS}&apikey=${encodeURIComponent(this.apiKey)}`;
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

    const expectedFmpPeriod = periodType === "ANNUAL" ? "FY" : undefined;

    const lineItems: RawLineItem[] = [];
    const skipReasons: string[] = [];
    // One data_sources row covers this whole call (see ingest.ts — a single
    // FMP request is one source), so its period/filing metadata comes from
    // the first row that actually passes the structural checks below.
    let sourceRow: FmpIncomeStatementRow | undefined;

    for (const raw of body as unknown[]) {
      const row = raw as FmpIncomeStatementRow;

      // Structural fields every metric on this row depends on — refuse to
      // fabricate/guess any of these. A row failing this check is skipped
      // entirely; it does not block metrics from other, valid rows.
      const missingStructural: string[] = [];
      if (!row.date) missingStructural.push("date");
      if (!row.reportedCurrency) missingStructural.push("reportedCurrency");
      if (missingStructural.length > 0) {
        skipReasons.push(
          `row for ${ref.ticker} is missing required field(s): ${missingStructural.join(", ")} (from ${redactedUrl}).`
        );
        continue;
      }

      // Sanity-check that FMP actually gave us the period type we asked
      // for, rather than trusting it blindly — mislabeling QUARTER data as
      // ANNUAL (or vice versa) is exactly the kind of silent corruption the
      // brief's validation rules exist to catch.
      if (expectedFmpPeriod && row.period && row.period !== expectedFmpPeriod) {
        skipReasons.push(
          `requested period_type ANNUAL but FMP row for ${ref.ticker} (period end ${row.date}) reports period='${row.period}' (expected 'FY') — refusing to mislabel it.`
        );
        continue;
      }

      const filingDate = row.fillingDate ?? row.filingDate;
      if (!sourceRow) sourceRow = row;

      // Each metric on this row is independent: a row missing `eps` still
      // yields revenue/net_income line items for that period, and vice
      // versa. Never require all three just because they share a row.
      let matchedAny = false;
      for (const field of INCOME_STATEMENT_METRIC_FIELDS) {
        const value = field.read(row);
        if (typeof value !== "number" || Number.isNaN(value)) continue;
        matchedAny = true;
        lineItems.push({
          metricName: field.metricName,
          metricIdentifier: field.metricIdentifier,
          rawValue: value,
          unit: field.unit,
          currency: row.reportedCurrency!,
          periodEnd: row.date!,
          periodType,
          filingDate,
        });
      }
      if (!matchedAny) {
        skipReasons.push(
          `row for ${ref.ticker} (period end ${row.date}) contained no valid revenue, net_income, or eps values (from ${redactedUrl}).`
        );
      }
    }

    if (lineItems.length === 0 || !sourceRow) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: skipReasons.join(" ") || `FMP returned no usable income-statement rows for ${ref.ticker} at ${redactedUrl}.`,
      };
    }

    return {
      status: "available",
      data: lineItems,
      source: {
        providerName: "Financial Modeling Prep",
        providerType: "FINANCIAL_API",
        sourceUrl: redactedUrl, // API key stripped — never persisted or returned
        sourceDocumentId: sourceRow.cik ?? undefined,
        filingDate: sourceRow.fillingDate ?? sourceRow.filingDate,
        reportingPeriodEnd: sourceRow.date,
        currency: sourceRow.reportedCurrency,
      },
    };
  }

  async getBalanceSheet(ref: ProviderCompanyRef, _periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>> {
    return {
      status: "unavailable",
      data: null,
      source: null,
      unavailableReason: `FmpFinancialDataAdapter.getBalanceSheet is not implemented yet for ${ref.ticker} — income-statement (revenue/net_income/eps) is the only statement implemented so far.`,
    };
  }

  async getCashFlow(ref: ProviderCompanyRef, _periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>> {
    return {
      status: "unavailable",
      data: null,
      source: null,
      unavailableReason: `FmpFinancialDataAdapter.getCashFlow is not implemented yet for ${ref.ticker} — income-statement (revenue/net_income/eps) is the only statement implemented so far.`,
    };
  }
}
