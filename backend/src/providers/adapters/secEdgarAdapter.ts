// ============================================================================
// Equity AI — SEC EDGAR Adapter (Milestone 7B)
//
// Implements FinancialDataProvider against SEC's real, free, public XBRL
// API. This is the ONLY file in the codebase that talks to SEC EDGAR. Not
// wired into src/providers/registry.ts yet — this milestone is standalone
// validation only (see Milestone 7B scope).
//
// SCOPE (matches the Milestone 7A feasibility findings exactly):
//   - getIncomeStatement: ANNUAL period only (form=="10-K", fp=="FY", and —
//     Milestone 9D — a genuinely ~1-year start/end span). Maps revenue
//     (REVENUE_CONCEPTS fallback), net_income (NET_INCOME_CONCEPTS
//     fallback), and eps (EarningsPerShareBasic) — the same 3 metrics
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

/** All evaluated; the concept whose annual series is most CURRENT wins (see
 *  fetchMostCurrentAnnualConcept) — order here is not a preference, just the
 *  set of concepts considered (confirmed empirically in Milestones 7A/9B/9C,
 *  never assumed). RevenuesNetOfInterestExpense added in Milestone 9D:
 *  banks/broker-dealers (e.g. WFC, MS) report their top-line "total net
 *  revenue" under this concept instead of Revenues/RevenueFromContract...,
 *  which for them carries only stale historical facts. */
const REVENUE_CONCEPTS = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenuesNetOfInterestExpense"];
/** Same "evaluate all, most current wins" principle as REVENUE_CONCEPTS
 *  (Milestone 9D) — some filers' NetIncomeLoss facts go stale while
 *  ProfitLoss (a standard, generic GAAP concept, not company-specific)
 *  remains current, confirmed live for MA and CAT. */
const NET_INCOME_CONCEPTS = ["NetIncomeLoss", "ProfitLoss"];
const EPS_CONCEPT = "EarningsPerShareBasic";

// ----------------------------------------------------------------------------
// Milestone 12B — additional income-statement, balance-sheet, and cash-flow
// concepts. Every candidate list below was verified empirically (read-only,
// against real SEC data) across a sector-diverse sample of the 30-company
// demo universe before being written here — never assumed from general XBRL
// knowledge alone. Same "evaluate all candidates, most current wins"
// principle throughout; a metric legitimately missing for a company (e.g.
// gross_profit for a bank, R&D for a restaurant chain) is honestly absent,
// not an error to work around.
// ----------------------------------------------------------------------------

/** Duration (income-statement) facts. */
const GROSS_PROFIT_CONCEPTS = ["GrossProfit"];
const OPERATING_INCOME_CONCEPTS = ["OperatingIncomeLoss"];
/** InterestExpenseDebt rescues CVX, whose InterestExpense tag has no
 *  genuinely-annual facts — confirmed empirically, same fallback pattern as
 *  revenue/net income. */
const INTEREST_EXPENSE_CONCEPTS = ["InterestExpense", "InterestExpenseDebt"];
const RD_EXPENSE_CONCEPTS = ["ResearchAndDevelopmentExpense"];
/** Milestone 13E — approved Milestone 13B/13D methodology. TAX_EXPENSE_CONCEPTS
 *  is a single concept, empirically verified (Milestone 13D) present with
 *  real current annual data for all 30 demo companies — no fallback needed.
 *  PRETAX_INCOME_CONCEPTS' two entries are the approved primary/fallback: two
 *  true ALTERNATIVE representations of the same continuing-operations
 *  pretax-income concept (never both real for the same company in practice —
 *  fetchMostCurrentAnnualConcept's existing "most current wins" selection
 *  applies, same mechanism already used for revenue/equity/debt), NOT
 *  additive components. Explicitly excluded per the approved decision: the
 *  "...Domestic" concept (a domestic-only breakdown, not total pretax
 *  income — would silently understate earnings for internationally-exposed
 *  companies; empirically confirmed in Milestone 13D to be the only current
 *  tag for MCD and ORCL, which is exactly why those two are not substituted
 *  with it here), any statutory/hardcoded rate, and
 *  CurrentIncomeTaxExpenseBenefit (a materially different, narrower
 *  current-portion-only figure, not a fallback for total tax expense). */
const TAX_EXPENSE_CONCEPTS = ["IncomeTaxExpenseBenefit"];
const PRETAX_INCOME_CONCEPTS = [
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
];

/** Duration (cash-flow-statement) facts. EBITDA is NOT a standard GAAP XBRL
 *  concept (no company tags "EBITDA" directly) — it is calculated
 *  (operating_income + depreciation_amortization) at the calculation layer,
 *  never fetched as a raw fact; depreciation_amortization is fetched here
 *  because it is structurally a cash-flow-statement line (the non-cash
 *  add-back in the operating-activities reconciliation), confirmed
 *  empirically for all 8 sample companies. */
const OPERATING_CASH_FLOW_CONCEPTS = ["NetCashProvidedByUsedInOperatingActivities"];
/** PaymentsToAcquireProductiveAssets rescues NVDA (whose
 *  PaymentsToAcquirePropertyPlantAndEquipment tag has been stale since FY2012
 *  — confirmed empirically) and CVX; same fallback pattern as revenue/net
 *  income. JPM has neither concept — a bank genuinely has no traditional
 *  capex line, confirmed empirically, not an error. */
const CAPEX_CONCEPTS = ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"];
const DEPRECIATION_AMORTIZATION_CONCEPTS = [
  "DepreciationDepletionAndAmortization",
  "DepreciationAmortizationAndAccretionNet",
  "DepreciationAndAmortization",
];

/** Instant (balance-sheet) facts — point-in-time, NOT duration facts: they
 *  have no `start`, only `end` (see isGenuinelyAnnualSpan's doc comment —
 *  the day-span check does not and must not apply to these; see
 *  fetchInstantConcept below, which reuses the same form/fp/restatement-dedup
 *  logic as fetchAnnualConcept but correctly omits the span check). */
const CASH_CONCEPTS = ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"];
const TOTAL_ASSETS_CONCEPTS = ["Assets"];
const TOTAL_LIABILITIES_CONCEPTS = ["Liabilities"];
/** StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest
 *  rescues JNJ/CAT/PG, who tag only that concept, not plain
 *  StockholdersEquity — confirmed empirically. */
const EQUITY_CONCEPTS = ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"];
const CURRENT_ASSETS_CONCEPTS = ["AssetsCurrent"];
const CURRENT_LIABILITIES_CONCEPTS = ["LiabilitiesCurrent"];
/** Milestone 13C: Total Debt = LongTermDebtCurrent + LongTermDebtNoncurrent +
 *  ShortTermBorrowings (Option B, approved in Milestone 13B — see that
 *  report for the full options analysis). Deliberately NOT a fallback list:
 *  Milestone 13C's empirical investigation
 *  (milestone13cDebtConceptInvestigate.ts) against all 30 demo companies
 *  found that candidate synonyms (plain "LongTermDebt", "DebtCurrent",
 *  "OtherShortTermBorrowings") overlap with these three for a majority of
 *  companies (e.g. 20/30 tag BOTH "LongTermDebt" and the split current/
 *  noncurrent concepts for the same obligation) — adopting them would
 *  double-count debt, so they are excluded rather than added "to maximize
 *  coverage." total_debt is therefore only computed for a company/period
 *  where all three of these concepts have real data (see
 *  fundamentalRatios.ts's computeTotalDebt) — never a partial sum, since a
 *  missing concept cannot be distinguished from "genuinely zero" without
 *  inventing that assumption. Coverage (13C investigation): 9/30 companies
 *  have all three (IBM, QCOM, VZ, AMZN, JNJ, LLY, COST, PEP, CVX). JPM/BAC/
 *  MA/SCHW are naturally excluded — none of the four tag both
 *  LongTermDebtCurrent and LongTermDebtNoncurrent (a bank's balance sheet
 *  doesn't decompose debt the way an industrial company's does) — with no
 *  financial-company-specific code needed. */
const LONG_TERM_DEBT_CURRENT_CONCEPTS = ["LongTermDebtCurrent"];
const LONG_TERM_DEBT_NONCURRENT_CONCEPTS = ["LongTermDebtNoncurrent"];
const SHORT_TERM_BORROWINGS_CONCEPTS = ["ShortTermBorrowings"];
// NOTE: shares_outstanding (needed for share_count_trend/share_dilution_trend)
// was investigated and NOT implemented — see file-level STOP note below
// fetchMostCurrentInstantConcept. us-gaap:CommonStockSharesOutstanding was
// verified empirically present for only 3 of 8 sampled companies (NVDA, JPM,
// CAT); most large-cap filers disclose share count via the `dei` taxonomy's
// cover-page tag instead, a materially different namespace/mechanism this
// adapter does not use — per Milestone 12B Phase 6, documenting this rather
// than inventing a partial/unreliable solution.
// NOTE: total_debt / net_debt were investigated in Milestone 12B and left
// NOT implemented — there is no single standard XBRL concept for "total
// debt" and summing an arbitrary subset would have invented a debt-
// aggregation methodology not present anywhere in this repository. Milestone
// 13B's product-decision process resolved this ambiguity (Option B: LT debt
// current + LT debt noncurrent + short-term borrowings, explicitly excluding
// operating leases and any concept not empirically verified), and Milestone
// 13C implements it — see LONG_TERM_DEBT_CURRENT_CONCEPTS et al. above and
// fundamentalRatios.ts's computeTotalDebt/computeNetDebt. Finance leases are
// NOT included: they are not unambiguously part of the three adopted
// concepts for any company in the 30-company universe (verified empirically
// during 13C), so including them would require a separate, not-yet-approved
// aggregation the same way the excluded synonyms above would.

/** A genuinely annual fact's start/end span should be about one year.
 *  Milestone 9D: SEC facts carrying form="10-K" && fp="FY" are NOT
 *  sufficient on their own to guarantee an annual span — a 10-K can
 *  disclose quarterly/stub figures (e.g. supplementary quarterly data)
 *  tagged with the same form/fp metadata as the filing itself. Confirmed
 *  live for HON (three ~90-day facts ranked ahead of real prior-year annual
 *  facts) and reproduced for TSLA/JNJ. Range is inclusive and wide enough to
 *  cover legitimate 52/53-week fiscal years (~364-371 days) and minor
 *  fiscal-calendar drift, while excluding quarters (~90 days) and half-years. */
const MIN_ANNUAL_SPAN_DAYS = 340;
const MAX_ANNUAL_SPAN_DAYS = 390;

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

/** Milestone 9D: true iff `fact` spans roughly one year, computed from its
 *  ACTUAL start/end dates — never inferred from form/fp/calendar-year/period
 *  spacing alone (see MIN/MAX_ANNUAL_SPAN_DAYS above). A fact with no
 *  `start` cannot be verified and is treated as not-annual — flow concepts
 *  like revenue/net income/EPS always carry a start in real SEC data, so
 *  this only excludes genuinely unverifiable facts, never guesses. */
function isGenuinelyAnnualSpan(fact: SecFact): boolean {
  if (!fact.start) return false;
  const days = Math.round((new Date(fact.end).getTime() - new Date(fact.start).getTime()) / (1000 * 60 * 60 * 24));
  return days >= MIN_ANNUAL_SPAN_DAYS && days <= MAX_ANNUAL_SPAN_DAYS;
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

  /** Fetches one concept, filters to genuinely ANNUAL 10-K/FY facts (form/fp
   *  metadata AND an actual ~1-year start/end span — Milestone 9D, see
   *  isGenuinelyAnnualSpan), and deduplicates by period (`end`), keeping the
   *  most-recently-`filed` fact for each — never the first match, per the
   *  restatement risk documented above. Order: form/fp filter -> span
   *  filter -> restatement dedup, exactly as approved. */
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

    const annualFacts = facts.filter(
      (f) => f.form === "10-K" && f.fp === "FY" && typeof f.val === "number" && !Number.isNaN(f.val) && isGenuinelyAnnualSpan(f)
    );
    if (annualFacts.length === 0) {
      return { ok: false, reason: `SEC concept us-gaap:${concept} has no genuinely annual (10-K, FY, ~1-year span) facts (from ${url}).` };
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

  /** Shared by revenue (Milestone 9B) and net income (Milestone 9D):
   *  fetches EVERY concept in `concepts` (does not stop at the first one
   *  with any annual data) and selects whichever concept's annual series is
   *  most CURRENT — i.e. has the latest period end. Never assumes one tag
   *  works for every company (Milestone 7A, C1), and never assumes the
   *  first concept with *any* historical data is the *right* concept
   *  (Milestone 9B): a company can have old, frozen facts under a former
   *  concept years after switching to a different one for its actual
   *  current filings — confirmed live for revenue
   *  (AAPL/MSFT/META/CSCO/AMAT/HON/UNP/HD/AVGO/WFC/MS) and for net income
   *  (MA/CAT). Selection is entirely data-driven from the facts SEC
   *  actually returns — no ticker-specific logic, no arbitrary preference
   *  by list order. */
  private async fetchMostCurrentAnnualConcept(
    cik: string,
    concepts: string[],
    unitsKey: "USD" | "USD/shares"
  ): Promise<{ ok: true; concept: string; factsByPeriodEnd: Map<string, SecFact> } | { ok: false; reason: string }> {
    const reasons: string[] = [];
    const candidates: Array<{ concept: string; factsByPeriodEnd: Map<string, SecFact>; latestPeriodEnd: string }> = [];

    for (const concept of concepts) {
      const result = await this.fetchAnnualConcept(cik, concept, unitsKey);
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

    // Most current series wins, regardless of list order — a concept with
    // only stale historical facts must never shadow a concept whose annual
    // series actually extends to the present.
    const best = candidates.reduce((a, b) => (b.latestPeriodEnd > a.latestPeriodEnd ? b : a));
    return { ok: true, concept: best.concept, factsByPeriodEnd: best.factsByPeriodEnd };
  }

  private fetchAnnualRevenue(cik: string) {
    return this.fetchMostCurrentAnnualConcept(cik, REVENUE_CONCEPTS, "USD");
  }

  private fetchAnnualNetIncome(cik: string) {
    return this.fetchMostCurrentAnnualConcept(cik, NET_INCOME_CONCEPTS, "USD");
  }

  /** Milestone 12B — instant (point-in-time) counterpart to
   *  fetchAnnualConcept, for balance-sheet facts. SEC XBRL instant facts
   *  (Assets, Liabilities, StockholdersEquity, Cash, ...) carry only `end`,
   *  never `start` — isGenuinelyAnnualSpan's day-span check is meaningless
   *  for them and must not be applied (it would reject every real fact, since
   *  it requires a start date). Everything else — form=10-K/fp=FY filtering,
   *  most-recently-filed-wins restatement dedup — is identical to
   *  fetchAnnualConcept, reused exactly, not reimplemented differently. */
  private async fetchInstantConcept(
    cik: string,
    concept: string,
    unitsKey: "USD" | "shares"
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
      return { ok: false, reason: `SEC concept us-gaap:${concept} has no genuinely annual (10-K, FY) instant facts (from ${url}).` };
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

  /** Instant-fact counterpart to fetchMostCurrentAnnualConcept — same
   *  "evaluate every candidate, most current series wins" principle. */
  private async fetchMostCurrentInstantConcept(
    cik: string,
    concepts: string[],
    unitsKey: "USD" | "shares"
  ): Promise<{ ok: true; concept: string; factsByPeriodEnd: Map<string, SecFact> } | { ok: false; reason: string }> {
    const reasons: string[] = [];
    const candidates: Array<{ concept: string; factsByPeriodEnd: Map<string, SecFact>; latestPeriodEnd: string }> = [];

    for (const concept of concepts) {
      const result = await this.fetchInstantConcept(cik, concept, unitsKey);
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

    const [revenue, netIncome, eps, grossProfit, operatingIncome, interestExpense, rdExpense, taxExpense, pretaxIncome] = await Promise.all([
      this.fetchAnnualRevenue(cik),
      this.fetchAnnualNetIncome(cik),
      this.fetchAnnualConcept(cik, EPS_CONCEPT, "USD/shares"),
      this.fetchMostCurrentAnnualConcept(cik, GROSS_PROFIT_CONCEPTS, "USD"),
      this.fetchMostCurrentAnnualConcept(cik, OPERATING_INCOME_CONCEPTS, "USD"),
      this.fetchMostCurrentAnnualConcept(cik, INTEREST_EXPENSE_CONCEPTS, "USD"),
      this.fetchMostCurrentAnnualConcept(cik, RD_EXPENSE_CONCEPTS, "USD"),
      this.fetchMostCurrentAnnualConcept(cik, TAX_EXPENSE_CONCEPTS, "USD"),
      this.fetchMostCurrentAnnualConcept(cik, PRETAX_INCOME_CONCEPTS, "USD"),
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
    collect("net_income", netIncome.ok ? `sec.us-gaap.${netIncome.concept}` : "sec.us-gaap.net_income", "USD", netIncome);
    collect("eps", `sec.us-gaap.${EPS_CONCEPT}`, "USD_PER_SHARE", eps);
    // Milestone 12B additions — same collect(), same per-metric independence
    // (a company legitimately missing one of these, e.g. gross_profit for a
    // bank, still yields line items for the others).
    collect("gross_profit", grossProfit.ok ? `sec.us-gaap.${grossProfit.concept}` : "sec.us-gaap.gross_profit", "USD", grossProfit);
    collect("operating_income", operatingIncome.ok ? `sec.us-gaap.${operatingIncome.concept}` : "sec.us-gaap.operating_income", "USD", operatingIncome);
    collect("interest_expense", interestExpense.ok ? `sec.us-gaap.${interestExpense.concept}` : "sec.us-gaap.interest_expense", "USD", interestExpense);
    collect("research_development", rdExpense.ok ? `sec.us-gaap.${rdExpense.concept}` : "sec.us-gaap.research_development", "USD", rdExpense);
    // Milestone 13E additions — same collect(), same per-metric independence.
    collect("tax_expense", taxExpense.ok ? `sec.us-gaap.${taxExpense.concept}` : "sec.us-gaap.tax_expense", "USD", taxExpense);
    collect("pretax_income", pretaxIncome.ok ? `sec.us-gaap.${pretaxIncome.concept}` : "sec.us-gaap.pretax_income", "USD", pretaxIncome);

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

  /** Milestone 12B. periodType is required "ANNUAL" for consistency with
   *  getIncomeStatement, even though every fact this method returns is
   *  tagged periodType "INSTANT" — the requested "ANNUAL" here means "the
   *  balance sheet as of this company's fiscal year end," not that the facts
   *  themselves are duration facts (they are not; see the file-level note on
   *  CASH_CONCEPTS et al.). */
  async getBalanceSheet(ref: ProviderCompanyRef, periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>> {
    if (periodType !== "ANNUAL") {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `SecEdgarAdapter does not yet support period_type '${periodType}' for getBalanceSheet — only ANNUAL (form=10-K, fp=FY) is implemented.`,
      };
    }

    const cikResult = await this.resolveCik(ref.ticker);
    if (!cikResult.ok) {
      return { status: "unavailable", data: null, source: null, unavailableReason: cikResult.reason };
    }
    const cik = cikResult.cik;

    const [
      cash, totalAssets, totalLiabilities, equity, currentAssets, currentLiabilities,
      longTermDebtCurrent, longTermDebtNoncurrent, shortTermBorrowings,
    ] = await Promise.all([
      this.fetchMostCurrentInstantConcept(cik, CASH_CONCEPTS, "USD"),
      this.fetchMostCurrentInstantConcept(cik, TOTAL_ASSETS_CONCEPTS, "USD"),
      this.fetchMostCurrentInstantConcept(cik, TOTAL_LIABILITIES_CONCEPTS, "USD"),
      this.fetchMostCurrentInstantConcept(cik, EQUITY_CONCEPTS, "USD"),
      this.fetchMostCurrentInstantConcept(cik, CURRENT_ASSETS_CONCEPTS, "USD"),
      this.fetchMostCurrentInstantConcept(cik, CURRENT_LIABILITIES_CONCEPTS, "USD"),
      this.fetchMostCurrentInstantConcept(cik, LONG_TERM_DEBT_CURRENT_CONCEPTS, "USD"),
      this.fetchMostCurrentInstantConcept(cik, LONG_TERM_DEBT_NONCURRENT_CONCEPTS, "USD"),
      this.fetchMostCurrentInstantConcept(cik, SHORT_TERM_BORROWINGS_CONCEPTS, "USD"),
    ]);

    const unavailableReasons: string[] = [];
    const lineItems: RawLineItem[] = [];
    let mostRecentFact: SecFact | undefined;
    let mostRecentPeriodEnd: string | undefined;

    const collect = (metricName: string, fallbackIdentifier: string, result: typeof cash) => {
      if (!result.ok) {
        unavailableReasons.push(result.reason);
        return;
      }
      const sortedPeriods = [...result.factsByPeriodEnd.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
      for (const [periodEnd, fact] of sortedPeriods.slice(0, LOOKBACK_PERIODS)) {
        lineItems.push({
          metricName,
          metricIdentifier: `sec.us-gaap.${result.concept}`,
          rawValue: fact.val,
          unit: "USD",
          currency: "USD",
          // No periodStart: these are instant (point-in-time) facts, not
          // duration facts — there is no meaningful "start" to report.
          periodEnd,
          periodType: "INSTANT",
          filingDate: fact.filed,
        });
        if (!mostRecentPeriodEnd || periodEnd > mostRecentPeriodEnd) {
          mostRecentPeriodEnd = periodEnd;
          mostRecentFact = fact;
        }
      }
      void fallbackIdentifier; // symmetry with getIncomeStatement's collect(); unreachable when result.ok
    };

    collect("cash", "sec.us-gaap.cash", cash);
    collect("total_assets", "sec.us-gaap.total_assets", totalAssets);
    collect("total_liabilities", "sec.us-gaap.total_liabilities", totalLiabilities);
    collect("equity", "sec.us-gaap.equity", equity);
    collect("current_assets", "sec.us-gaap.current_assets", currentAssets);
    collect("current_liabilities", "sec.us-gaap.current_liabilities", currentLiabilities);
    collect("long_term_debt_current", "sec.us-gaap.long_term_debt_current", longTermDebtCurrent);
    collect("long_term_debt_noncurrent", "sec.us-gaap.long_term_debt_noncurrent", longTermDebtNoncurrent);
    collect("short_term_borrowings", "sec.us-gaap.short_term_borrowings", shortTermBorrowings);

    if (lineItems.length === 0 || !mostRecentFact) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: unavailableReasons.join(" ") || `No usable SEC annual balance-sheet facts found for ${ref.ticker} (CIK ${cik}).`,
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

  /** Milestone 12B — operating_cash_flow, capex, and the D&A figure used to
   *  calculate EBITDA (never fetched as a raw fact — EBITDA is not a
   *  standard GAAP XBRL concept; see the file-level note above
   *  DEPRECIATION_AMORTIZATION_CONCEPTS). free_cash_flow is NOT fetched or
   *  stored here — it is calculated (operating_cash_flow - capex) at the
   *  calculation layer, same separation growth_acceleration already
   *  maintains between raw facts and derived metrics. */
  async getCashFlow(ref: ProviderCompanyRef, periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>> {
    if (periodType !== "ANNUAL") {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: `SecEdgarAdapter does not yet support period_type '${periodType}' for getCashFlow — only ANNUAL (form=10-K, fp=FY) is implemented.`,
      };
    }

    const cikResult = await this.resolveCik(ref.ticker);
    if (!cikResult.ok) {
      return { status: "unavailable", data: null, source: null, unavailableReason: cikResult.reason };
    }
    const cik = cikResult.cik;

    const [operatingCashFlow, capex, depreciationAmortization] = await Promise.all([
      this.fetchMostCurrentAnnualConcept(cik, OPERATING_CASH_FLOW_CONCEPTS, "USD"),
      this.fetchMostCurrentAnnualConcept(cik, CAPEX_CONCEPTS, "USD"),
      this.fetchMostCurrentAnnualConcept(cik, DEPRECIATION_AMORTIZATION_CONCEPTS, "USD"),
    ]);

    const unavailableReasons: string[] = [];
    const lineItems: RawLineItem[] = [];
    let mostRecentFact: SecFact | undefined;
    let mostRecentPeriodEnd: string | undefined;

    const collect = (metricName: string, fallbackIdentifier: string, result: typeof operatingCashFlow) => {
      if (!result.ok) {
        unavailableReasons.push(result.reason);
        return;
      }
      const sortedPeriods = [...result.factsByPeriodEnd.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
      for (const [periodEnd, fact] of sortedPeriods.slice(0, LOOKBACK_PERIODS)) {
        lineItems.push({
          metricName,
          metricIdentifier: `sec.us-gaap.${result.concept}`,
          rawValue: fact.val,
          unit: "USD",
          currency: "USD",
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
      void fallbackIdentifier;
    };

    collect("operating_cash_flow", "sec.us-gaap.operating_cash_flow", operatingCashFlow);
    collect("capex", "sec.us-gaap.capex", capex);
    collect("depreciation_amortization", "sec.us-gaap.depreciation_amortization", depreciationAmortization);

    if (lineItems.length === 0 || !mostRecentFact) {
      return {
        status: "unavailable",
        data: null,
        source: null,
        unavailableReason: unavailableReasons.join(" ") || `No usable SEC annual cash-flow facts found for ${ref.ticker} (CIK ${cik}).`,
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
}
