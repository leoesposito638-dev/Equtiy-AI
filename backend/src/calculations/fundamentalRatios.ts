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
// Milestone 13C added total_debt, net_debt, ebitda, debt_to_equity, and
// net_debt_to_ebitda below, per the product-authorized methodology from
// Milestone 13B (Total Debt = LongTermDebtCurrent + LongTermDebtNoncurrent +
// ShortTermBorrowings; Net Debt = Total Debt − cash-and-equivalents-only;
// EBITDA = operating_income + depreciation_amortization, a formula already
// documented — but until now unimplemented — in secEdgarAdapter.ts). debt_trend
// and net_debt_trend need no new code here: like margin_trend before them,
// they are TREND rules over total_debt's/net_debt's own stored history,
// wired via supabaseScoringRepo.ts's TREND_METRIC_SOURCE alias map.
//
// Milestone 13E added invested_capital, effective_tax_rate, and roic below,
// per the product-authorized methodology from Milestone 13B/13D (Invested
// Capital = Total Assets − Current Liabilities − Cash, deliberately NOT
// dependent on Total Debt; Effective Tax Rate = tax_expense / pretax_income,
// pretax_income sourced from the approved primary/fallback SEC continuing-
// operations concepts; ROIC reuses metrics.ts's existing, unmodified roic()
// formula). roic_persistence needs no new code here: like margin_trend and
// debt_trend before it, it is a TREND rule over roic's own stored history,
// already wired via supabaseScoringRepo.ts's TREND_METRIC_SOURCE alias map.
//
// Deliberately still NOT implemented here (see Milestone 12B/13A/13B reports
// for the full reasoning — each remains a genuine STOP, not an oversight):
//   - fcf_reinvestment_rate: no formula for this metric exists anywhere in
//     the codebase — implementing it would mean inventing both the formula
//     and its OPTIMAL_RANGE thresholds; still an unresolved product decision.
//   - share_count_trend, share_dilution_trend: shares outstanding was
//     investigated (Milestone 12B Phase 6) and found unreliable via this
//     adapter's mechanism for most companies — see secEdgarAdapter.ts.
//   - margin_trend, gross_margin_stability: TREND rules over an already-
//     computed metric's OWN stored history (net_margin, gross_margin
//     respectively) — scoreCategory.ts's existing generic TREND handling
//     already covers them with zero new code (margin_trend since Milestone
//     12D; gross_margin_stability now reachable via the Milestone 13C
//     score_rules v1.1 minimum_data_points fix — see schema/007).
// ============================================================================

import {
  marginOf,
  roe as roeOf,
  currentRatio as currentRatioOf,
  interestCoverage as interestCoverageOf,
  freeCashFlow as freeCashFlowOf,
  debtToEquity as debtToEquityOf,
  netDebtToEbitda as netDebtToEbitdaOf,
  investedCapital as investedCapitalOf,
  effectiveTaxRate as effectiveTaxRateOf,
  roic as roicOf,
} from "./metrics";

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

/** Three-way counterpart to alignAndCompute — produces a result for a period
 *  only when ALL THREE inputs have a real value there; a period missing any
 *  one component yields no result, never a partial sum. This mirrors
 *  alignAndCompute's own missing-data discipline (see its comment above)
 *  rather than treating an untagged concept as a genuine zero. */
function alignAndSum3(
  metricName: string,
  a: PeriodValue[],
  b: PeriodValue[],
  c: PeriodValue[]
): RatioResult[] {
  const byPeriodB = new Map(b.filter((x) => x.value !== null).map((x) => [x.periodEnd, x]));
  const byPeriodC = new Map(c.filter((x) => x.value !== null).map((x) => [x.periodEnd, x]));
  const results: RatioResult[] = [];
  for (const x of a) {
    if (x.value === null) continue;
    const y = byPeriodB.get(x.periodEnd);
    const z = byPeriodC.get(x.periodEnd);
    if (!y || y.value === null || !z || z.value === null) continue;
    results.push({
      metricName,
      periodEnd: x.periodEnd,
      value: x.value + y.value + z.value,
      sourceObservationIds: [x.id, y.id, z.id],
    });
  }
  return results;
}

/** Total Debt (Milestone 13C, approved Milestone 13B Option B) =
 *  LongTermDebtCurrent + LongTermDebtNoncurrent + ShortTermBorrowings, only
 *  where all three are real for the same period — see the constants'
 *  comment in secEdgarAdapter.ts for why no fallback concepts are used. */
export function computeTotalDebt(
  longTermDebtCurrent: PeriodValue[],
  longTermDebtNoncurrent: PeriodValue[],
  shortTermBorrowings: PeriodValue[]
): RatioResult[] {
  return alignAndSum3("total_debt", longTermDebtCurrent, longTermDebtNoncurrent, shortTermBorrowings);
}

/** EBITDA = operating_income + depreciation_amortization — the formula
 *  secEdgarAdapter.ts has documented since Milestone 12B ("EBITDA is NOT a
 *  standard GAAP XBRL concept... it is calculated... never fetched as a raw
 *  fact"), implemented here for the first time now that net_debt_to_ebitda
 *  has a defined net_debt input to pair it with. */
export function computeEbitda(operatingIncome: PeriodValue[], depreciationAmortization: PeriodValue[]): RatioResult[] {
  return alignAndCompute("ebitda", operatingIncome, depreciationAmortization, (oi, da) => oi + da);
}

/** Net Debt (Milestone 13C, approved Milestone 13B) = Total Debt − cash.
 *  `cash` must already be restricted by the caller to companies whose
 *  ingested cash value is verified to be cash-and-equivalents-only (not the
 *  restricted-cash-inclusive CASH_CONCEPTS fallback) — see
 *  supabaseFundamentalRatiosRepo.ts's CASH_INCLUDES_RESTRICTED_CASH. Negative
 *  results (a net-cash position) are preserved, never floored to zero, per
 *  the approved decision. */
export function computeNetDebt(totalDebt: PeriodValue[], cash: PeriodValue[]): RatioResult[] {
  return alignAndCompute("net_debt", totalDebt, cash, (td, c) => td - c);
}

export function computeDebtToEquity(totalDebt: PeriodValue[], equity: PeriodValue[]): RatioResult[] {
  return alignAndCompute("debt_to_equity", totalDebt, equity, (td, eq) => debtToEquityOf(td, eq));
}

export function computeNetDebtToEbitda(netDebt: PeriodValue[], ebitda: PeriodValue[]): RatioResult[] {
  return alignAndCompute("net_debt_to_ebitda", netDebt, ebitda, (nd, eb) => netDebtToEbitdaOf(nd, eb));
}

/** Three-way counterpart to alignAndCompute, generalized with a formula
 *  callback (unlike alignAndSum3, which is hardcoded to addition) — produces
 *  a result for a period only when all three inputs have a real value
 *  there, same missing-data discipline as every align* helper in this file.
 *  Milestone 13E: used for Invested Capital (a subtraction) and ROIC (the
 *  existing metrics.ts roic() formula, unmodified). */
function alignAndCompute3(
  metricName: string,
  a: PeriodValue[],
  b: PeriodValue[],
  c: PeriodValue[],
  formula: (a: number, b: number, c: number) => number | null
): RatioResult[] {
  const byPeriodB = new Map(b.filter((x) => x.value !== null).map((x) => [x.periodEnd, x]));
  const byPeriodC = new Map(c.filter((x) => x.value !== null).map((x) => [x.periodEnd, x]));
  const results: RatioResult[] = [];
  for (const x of a) {
    if (x.value === null) continue;
    const y = byPeriodB.get(x.periodEnd);
    const z = byPeriodC.get(x.periodEnd);
    if (!y || y.value === null || !z || z.value === null) continue;
    const value = formula(x.value, y.value, z.value);
    if (value === null) continue;
    results.push({ metricName, periodEnd: x.periodEnd, value, sourceObservationIds: [x.id, y.id, z.id] });
  }
  return results;
}

/** Invested Capital (Milestone 13E, approved Milestone 13B/13D) =
 *  Total Assets − Current Liabilities − Cash. Deliberately NOT dependent on
 *  Total Debt, per the approved decision. Uses the full `cash` series (not
 *  the CASH_INCLUDES_RESTRICTED_CASH-gated series Net Debt uses) — the
 *  approved Invested Capital formula, unlike Net Debt, was never qualified
 *  with a "cash-and-equivalents-only" requirement in Milestone 13B/13D, so
 *  no cash-cleanliness gate applies here. */
export function computeInvestedCapital(totalAssets: PeriodValue[], currentLiabilities: PeriodValue[], cash: PeriodValue[]): RatioResult[] {
  return alignAndCompute3("invested_capital", totalAssets, currentLiabilities, cash, (ta, cl, c) => investedCapitalOf(ta, cl, c));
}

/** Effective Tax Rate (Milestone 13E, approved Milestone 13B/13D/13E) =
 *  tax_expense / pretax_income, as a fraction. pretax_income is sourced from
 *  the primary/fallback SEC concepts wired in secEdgarAdapter.ts — two true
 *  alternative representations of the same concept (never additive), so a
 *  plain 2-way align is correct here, same as every other ratio in this
 *  file. */
export function computeEffectiveTaxRate(taxExpense: PeriodValue[], pretaxIncome: PeriodValue[]): RatioResult[] {
  return alignAndCompute("effective_tax_rate", taxExpense, pretaxIncome, (te, pi) => effectiveTaxRateOf(te, pi));
}

/** ROIC (Milestone 13E, approved Milestone 13B/13D) — the existing,
 *  unmodified metrics.ts roic() formula, applied only where operating
 *  income, effective tax rate, and invested capital all have a real value
 *  for the SAME period_end (no quarterly/stub contamination, no mixing
 *  fiscal years) — the period-alignment safeguard that naturally leaves
 *  ORCL unavailable (its only current pretax concept is stale since 2018,
 *  so effective_tax_rate has no period overlapping operating_income's
 *  current years) without any company-specific code. */
export function computeRoic(operatingIncome: PeriodValue[], effectiveTaxRate: PeriodValue[], investedCapital: PeriodValue[]): RatioResult[] {
  return alignAndCompute3("roic", operatingIncome, effectiveTaxRate, investedCapital, (oi, etr, ic) => roicOf(oi, etr, ic));
}
