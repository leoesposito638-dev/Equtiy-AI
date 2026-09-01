// ============================================================================
// Equity AI — Milestone 12B: PROFITABILITY / FINANCIAL_HEALTH /
// COMPETITIVE_ADVANTAGE ratio metrics.
//
// Pure, DB-free — same split as growthMetrics.ts. Every formula here is an
// EXISTING function from ./metrics.ts (marginOf, roe, currentRatio,
// interestCoverage, freeCashFlow); nothing new is invented. This file only
// declares WHICH inputs feed which score_rules metric_name and how periods
// are aligned across raw facts of different shapes (duration vs instant).
//
// Deliberately NOT implemented here (see Milestone 12B report for the full
// reasoning — each is a genuine STOP, not an oversight):
//   - roic (both PROFITABILITY and CAPITAL_ALLOCATION): the existing
//     roic() function in metrics.ts takes `investedCapital` as a pre-computed
//     input; nothing in this repository defines how to derive invested
//     capital from balance-sheet facts, and inventing that definition here
//     would be inventing methodology.
//   - debt_to_equity, net_debt_to_ebitda, debt_trend, net_debt_trend: no
//     single standard XBRL concept represents "total debt" (companies
//     decompose it inconsistently across current/noncurrent/finance-lease
//     line items) — summing an arbitrary subset would invent a debt
//     aggregation methodology not present anywhere in this repository.
//   - fcf_reinvestment_rate: no formula for this metric exists anywhere in
//     the codebase (unlike every metric below, which reuses an existing
//     ./metrics.ts function) — implementing it would mean inventing both the
//     formula and its OPTIMAL_RANGE thresholds.
//   - share_count_trend, share_dilution_trend: shares outstanding was
//     investigated (Milestone 12B Phase 6) and found unreliable via this
//     adapter's mechanism for most companies — see secEdgarAdapter.ts.
//   - margin_trend, gross_margin_stability, roic_persistence: these are
//     TREND rules over an already-computed metric's OWN stored history
//     (net_margin, gross_margin, roic respectively) — scoreCategory.ts's
//     existing generic TREND handling already covers them with zero new
//     code, once/if that underlying metric has enough stored periods. No
//     separate "calculate the trend" function is needed or written here.
// ============================================================================

import { marginOf, roe as roeOf, currentRatio as currentRatioOf, interestCoverage as interestCoverageOf, freeCashFlow as freeCashFlowOf } from "./metrics";

export interface PeriodValue {
  id: string;
  periodEnd: string;
  value: number | null;
}

export interface RatioResult {
  metricName: string;
  periodEnd: string;
  value: number;
  sourceObservationIds: string[];
}

/** Pairs two raw series by period_end (the fiscal year-end date is the same
 *  whether the fact is a duration fact, e.g. net_income, or an instant fact,
 *  e.g. equity — both describe the same 10-K's fiscal year end) and applies
 *  `formula` to every period where BOTH inputs are real and non-null. A
 *  period missing either input simply produces no result — never a guess. */
function alignAndCompute(
  metricName: string,
  numerator: PeriodValue[],
  denominator: PeriodValue[],
  formula: (num: number, den: number) => number | null
): RatioResult[] {
  const denomByPeriod = new Map(denominator.filter((d) => d.value !== null).map((d) => [d.periodEnd, d]));
  const results: RatioResult[] = [];
  for (const n of numerator) {
    if (n.value === null) continue;
    const d = denomByPeriod.get(n.periodEnd);
    if (!d || d.value === null) continue;
    const value = formula(n.value, d.value);
    if (value === null) continue;
    results.push({ metricName, periodEnd: n.periodEnd, value, sourceObservationIds: [n.id, d.id] });
  }
  return results;
}

export function computeNetMargin(netIncome: PeriodValue[], revenue: PeriodValue[]): RatioResult[] {
  return alignAndCompute("net_margin", netIncome, revenue, (ni, rev) => marginOf(ni, rev));
}

export function computeGrossMargin(grossProfit: PeriodValue[], revenue: PeriodValue[]): RatioResult[] {
  return alignAndCompute("gross_margin", grossProfit, revenue, (gp, rev) => marginOf(gp, rev));
}

export function computeOperatingMargin(operatingIncome: PeriodValue[], revenue: PeriodValue[]): RatioResult[] {
  return alignAndCompute("operating_margin", operatingIncome, revenue, (oi, rev) => marginOf(oi, rev));
}

export function computeRoe(netIncome: PeriodValue[], equity: PeriodValue[]): RatioResult[] {
  return alignAndCompute("roe", netIncome, equity, (ni, eq) => roeOf(ni, eq));
}

export function computeCurrentRatio(currentAssets: PeriodValue[], currentLiabilities: PeriodValue[]): RatioResult[] {
  return alignAndCompute("current_ratio", currentAssets, currentLiabilities, (ca, cl) => currentRatioOf(ca, cl));
}

export function computeInterestCoverage(operatingIncome: PeriodValue[], interestExpense: PeriodValue[]): RatioResult[] {
  return alignAndCompute("interest_coverage", operatingIncome, interestExpense, (oi, ie) => interestCoverageOf(oi, ie));
}

export function computeFreeCashFlow(operatingCashFlow: PeriodValue[], capex: PeriodValue[]): RatioResult[] {
  return alignAndCompute("free_cash_flow", operatingCashFlow, capex, (ocf, cpx) => freeCashFlowOf(ocf, cpx));
}

export function computeFcfMargin(freeCashFlow: PeriodValue[], revenue: PeriodValue[]): RatioResult[] {
  return alignAndCompute("fcf_margin", freeCashFlow, revenue, (fcf, rev) => marginOf(fcf, rev));
}

export function computeRdIntensity(researchDevelopment: PeriodValue[], revenue: PeriodValue[]): RatioResult[] {
  return alignAndCompute("rd_intensity", researchDevelopment, revenue, (rd, rev) => marginOf(rd, rev));
}
