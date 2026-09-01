// ============================================================================
// Equity AI — SEC EDGAR Adapter (Milestone 7B)
//
// Implements FinancialDataProvider against SEC's real, free, public XBRL
// API. This is the ONLY file in the codebase that talks to SEC EDGAR. Not
// wired into src/providers/registry.ts yet — this milestone is standalone
// validation only (see Milestone 7B scope).
//
// SCOPE (matches the Milestone 7A feasibility findings exactly):
//   - getIncomeStatement: ANNUAL period only (form=="10-K", fp=="FY").
//     Maps revenue (Revenues, falling back to
//     RevenueFromContractWithCustomerExcludingAssessedTax), net_income
//     (NetIncomeLoss), and eps (EarningsPerShareBasic) — the same 3 metrics
//     FmpFinancialDataAdapter maps, same RawLineItem shape, same
//     per-metric/per-period independence (a period missing one metric still
//     yields line items for the others).
//   - getBalanceSheet / getCashFlow: NOT implemented, honest "unavailable" —
//     same pattern as FmpFinancialDataAdapter and unavailableProvider.ts.
//
// KEY FEASIBILITY FINDINGS THIS ADAPTER ENCODES (Milestone 7A, verified
// against real SEC data):
//   - No single revenue tag works for every company — NVDA/JPM/KO use
//     us-gaap:Revenues; AAPL/MSFT use
//     us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax. Both are
//     attempted (see REVENUE_CONCEPTS below); the concept whose annual
//     series is most CURRENT is selected (Milestone 9B) — a company that
//     migrated tags around ASC 606 adoption (~2018) can still have old,
//     frozen facts under its former concept years later (confirmed live for
//     AAPL/MSFT/META/CSCO/AMAT/HON/UNP/HD/AVGO/WFC/MS), so "has any annual
//     data" is not sufficient — see fetchAnnualRevenue().
//   - The SAME period can appear in multiple filings (as "current year" in
//     one 10-K, then again as the prior-year comparative in the next one) —
//     sometimes with a DIFFERENT value (NVDA's FY2024 EPS: 12.05 as
//     originally filed vs. 1.21 in every later filing, reflecting NVIDIA's
//     2024 stock split). The only correct rule: for a given period, always
//     take the value from the most-recently-`filed` fact, never the first
//     match and never the value from that period's own original filing.
//   - Ticker->CIK resolution MUST use SEC's own authoritative mapping, never
//     fuzzy name matching — verified live that name-matching "Coca-Cola"
//     against SEC data can return an entirely different, legally distinct
//     company (Coca-Cola Consolidated, Inc., not The Coca-Cola Company).
//
// SECURITY: SEC does not require an API key, but does require an
// identifying User-Agent per its fair-access policy. That identifying
// string is read from process.env at call time — same pattern as
// FMP_API_KEY — never hardcoded into source. This file never logs it.
// ============================================================================

import type {
  FinancialDataProvider,
  ProviderCompanyRef,
  ProviderResult,
  RawLineItem,
} from "../interfaces";
import type { PeriodType } from "../../types/domain";

const SEC_DATA_BASE_URL = "https://data.sec.gov/api/xbrl/companyconcept";
const SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";

/** Tried in this exact order — see the file header for why a fallback list
 *  is required at all (confirmed empirically in Milestone 7A, not assumed). */
const REVENUE_CONCEPTS = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"];
const NET_INCOME_CONCEPT = "NetIncomeLoss";
const EPS_CONCEPT = "EarningsPerShareBasic";

/** Matches FmpFinancialDataAdapter's LOOKBACK_PERIODS exactly, for
 *  consistent behavior/volume across providers implementing the same
 *  interface — not a SEC API limitation (SEC returns a company's entire
 *  filing history; this adapter deliberately slices to the most recent 4
 *  periods after dedup). */
const LOOKBACK_PERIODS = 4;

interface SecFact {
  start?: string;
  end: string;
  val: number;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
  accn?: string;
}

interface SecConceptResponse {
  units?: Record<string, SecFact[]>;
}

interface SecTickerMapEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

function pad10(cik: number): string {
  return String(cik).padStart(10, "0");
}

export class SecEdgarAdapter implements FinancialDataProvider {
  private tickerToCik: Map<string, string> | null = null;

  constructor(private readonly userAgent: string) {
    if (!userAgent) {
      // Fail loudly at construction, same defensive pattern as
      // FmpFinancialDataAdapter — a caller must supply a real identifying
      // string (SEC's fair-access policy requires one); the registry (once
      // this is wired up, not in this milestone) is the only place that
      // should read it from process.env.
      throw new Error("SecEdgarAdapter constructed without a User-Agent string.");
    }
  }

  private async fetchJson(url: string): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
    let httpResponse: Response;
    try {
      httpResponse = await fetch(url, { headers: { "User-Agent": this.userAgent } });
    } catch (e) {
      return { ok: false, reason: `Network error calling SEC EDGAR (${url}): ${(e as Error).message}` };
    }
    if (!httpResponse.ok) {
      return { ok: false, reason: `SEC EDGAR returned HTTP ${httpResponse.status} for ${url}.` };
    }
    try {
      return { ok: true, body: await httpResponse.json() };
    } catch (e) {
      return { ok: false, reason: `SEC EDGAR response for ${url} was not valid JSON: ${(e as Error).message}` };
    }
  }

  /** Ticker -> CIK via SEC's own authoritative mapping file — never fuzzy
   *  name matching (see file header: verified this is a real, not
   *  hypothetical, risk). Fetched once and cached per adapter instance. */
  private async resolveCik(ticker: string): Promise<{ ok: true; cik: string } | { ok: false; reason: string }> {
    if (!this.tickerToCik) {
      const result = await this.fetchJson(SEC_TICKER_MAP_URL);
      if (!result.ok) return { ok: false, reason: `SEC ticker->CIK mapping unavailable: ${result.reason}` };
      const map = new Map<string, string>();
      for (const entry of Object.values(result.body as Record<string, SecTickerMapEntry>)) {
        if (entry?.ticker && typeof entry.cik_str === "number") {
          map.set(entry.ticker.toUpperCase(), pad10(entry.cik_str));
        }
      }
      this.tickerToCik = map;
    }
    const cik = this.tickerToCik.get(ticker.toUpperCase());
    if (!cik) return { ok: false, reason: `Ticker '${ticker}' not found in SEC's authoritative ticker->CIK mapping.` };
    return { ok: true, cik };
  }

  /** Fetches one concept, filters to ANNUAL 10-K/FY facts, and deduplicates
   *  by period (`end`), keeping the most-recently-`filed` fact for each —
   *  never the first match, per the restatement risk documented above. */
  private async fetchAnnualConcept(
    cik: string,
    concept: string,
    unitsKey: "USD" | "USD/shares"
  ): Promise<{ ok: true; factsByPeriodEnd: Map<string, SecFact> } | { ok: false; reason: string }> {
    const url = `${SEC_DATA_BASE_URL}/CIK${cik}/us-gaap/${concept}.json`;
    const result = await this.fetchJson(url);
    if (!result.ok) return { ok: false, reason: result.reason };

    const body = result.body as SecConceptResponse;
    const facts = body.units?.[unitsKey];
    if (!Array.isArray(facts) || facts.length === 0) {
      return { ok: false, reason: `SEC concept us-gaap:${concept} has no '${unitsKey}' facts (from ${url}).` };
    }

    const annualFacts = facts.filter((f) => f.form === "10-K" && f.fp === "FY" && typeof f.val === "number" && !Number.isNaN(f.val));
    if (annualFacts.length === 0) {
      return { ok: false, reason: `SEC concept us-gaap:${concept} has no annual (10-K, FY) facts (from ${url}).` };
    }

    const factsByPeriodEnd = new Map<string, SecFact>();
    for (const fact of annualFacts) {
      const existing = factsByPeriodEnd.get(fact.end);
      if (!existing || fact.filed > existing.filed) {
        factsByPeriodEnd.set(fact.end, fact); // most-recently-filed wins, restatements included
      }
    }
    return { ok: true, factsByPeriodEnd };
  }

  /** Revenue-only: fetches EVERY concept in REVENUE_CONCEPTS (does not stop
   *  at the first one with any annual data) and selects whichever concept's
   *  annual series is most CURRENT — i.e. has the latest period end. Never
   *  assumes one tag works for every company (Milestone 7A, C1), and never
   *  assumes the first concept with *any* historical data is the *right*
   *  concept (Milestone 9B): a company that migrated off `Revenues` around
   *  ASC 606 adoption (~2018) can still have old, frozen `Revenues` facts
   *  years after switching to `RevenueFromContractWithCustomerExcludingAssessedTax`
   *  for its actual current filings — confirmed live for
   *  AAPL/MSFT/META/CSCO/AMAT/HON/UNP/HD/AVGO/WFC/MS. Selection is entirely
   *  data-driven from the facts SEC actually returns — no ticker-specific
   *  logic. */
  private async fetchAnnualRevenue(cik: string): Promise<{ ok: true; concept: string; factsByPeriodEnd: Map<string, SecFact> } | { ok: false; reason: string }> {
    const reasons: string[] = [];
    const candidates: Array<{ concept: string; factsByPeriodEnd: Map<string, SecFact>; latestPeriodEnd: string }> = [];

    for (const concept of REVENUE_CONCEPTS) {
      const result = await this.fetchAnnualConcept(cik, concept, "USD");
      if (!result.ok) {
        reasons.push(result.reason);
        continue;
      }
      const latestPeriodEnd = [...result.factsByPeriodEnd.keys()].sort().at(-1)!;
      candidates.push({ concept, factsByPeriodEnd: result.factsByPeriodEnd, latestPeriodEnd });
    }

    if (candidates.length === 0) {
      return { ok: false, reason: reasons.join(" ") };
    }

    // Most current series wins, regardless of REVENUE_CONCEPTS order — a
    // concept with only stale historical facts must never shadow a concept
    // whose annual series actually extends to the present.
    const best = candidates.reduce((a, b) => (b.latestPeriodEnd > a.latestPeriodEnd ? b : a));
    return { ok: true, concept: best.concept, factsByPeriodEnd: best.factsByPeriodEnd };
  }

  async getIncomeStatement(ref: ProviderCompanyRef, periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>> {
    if (periodType !== "ANNUAL") {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `SecEdgarAdapter does not yet support period_type '${periodType}' — only ANNUAL (form=10-K, fp=FY) is implemented this milestone.`,
      };
    }

    const cikResult = await this.resolveCik(ref.ticker);
    if (!cikResult.ok) {
      return { status: "unavailable", data: null, source: null, unavailableReason: cikResult.reason };
    }
    const cik = cikResult.cik;

    const [revenue, netIncome, eps] = await Promise.all([
      this.fetchAnnualRevenue(cik),
      this.fetchAnnualConcept(cik, NET_INCOME_CONCEPT, "USD"),
      this.fetchAnnualConcept(cik, EPS_CONCEPT, "USD/shares"),
    ]);

    const unavailableReasons: string[] = [];
    const lineItems: RawLineItem[] = [];
    let mostRecentFact: SecFact | undefined;
    let mostRecentPeriodEnd: string | undefined;

    const collect = (metricName: string, metricIdentifier: string, unit: string, result: typeof revenue | typeof netIncome | typeof eps) => {
      if (!result.ok) {
        unavailableReasons.push(result.reason);
        return;
      }
      const sortedPeriods = [...result.factsByPeriodEnd.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
      for (const [periodEnd, fact] of sortedPeriods.slice(0, LOOKBACK_PERIODS)) {
        lineItems.push({
          metricName,
          metricIdentifier,
          rawValue: fact.val,
          unit,
          currency: "USD", // confirmed empirically for all Milestone 7A test companies; SEC's units.USD implies this
          periodStart: fact.start,
          periodEnd,
          periodType: "ANNUAL",
          filingDate: fact.filed,
        });
        if (!mostRecentPeriodEnd || periodEnd > mostRecentPeriodEnd) {
          mostRecentPeriodEnd = periodEnd;
          mostRecentFact = fact;
        }
      }
    };

    collect("revenue", revenue.ok ? `sec.us-gaap.${revenue.concept}` : "sec.us-gaap.revenue", "USD", revenue);
    collect("net_income", `sec.us-gaap.${NET_INCOME_CONCEPT}`, "USD", netIncome);
    collect("eps", `sec.us-gaap.${EPS_CONCEPT}`, "USD_PER_SHARE", eps);

    if (lineItems.length === 0 || !mostRecentFact) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: unavailableReasons.join(" ") || `No usable SEC annual facts found for ${ref.ticker} (CIK ${cik}).`,
      };
    }

    return {
      status: "available",
      data: lineItems,
      source: {
        providerName: "SEC EDGAR",
        providerType: "SEC",
        sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K`,
        sourceDocumentId: mostRecentFact.accn,
        filingDate: mostRecentFact.filed,
        reportingPeriodEnd: mostRecentPeriodEnd,
        currency: "USD",
      },
    };
  }

  async getBalanceSheet(ref: ProviderCompanyRef, _periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>> {
    return {
      status: "unavailable",
      data: null,
      source: null,
      unavailableReason: `SecEdgarAdapter.getBalanceSheet is not implemented yet for ${ref.ticker} — income-statement (revenue/net_income/eps) is the only statement implemented so far.`,
    };
  }

  async getCashFlow(ref: ProviderCompanyRef, _periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>> {
    return {
      status: "unavailable",
      data: null,
      source: null,
      unavailableReason: `SecEdgarAdapter.getCashFlow is not implemented yet for ${ref.ticker} — income-statement (revenue/net_income/eps) is the only statement implemented so far.`,
    };
  }
}
