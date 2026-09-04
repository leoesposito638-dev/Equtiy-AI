// ============================================================================
// Equity AI — Calculation Engine (v1.0)
//
// Pure, deterministic functions over canonical FinancialMetric values.
// Every exported function:
//   - returns `null` (never 0, never a guess) when required inputs are missing
//   - is pinned to CALCULATION_VERSION so scores stay reproducible
//   - is unit-testable without a database (see tests/calculations.test.ts)
//
// If the formula ever changes, bump CALCULATION_VERSION to 'v1.1' and keep
// this file's 'v1.0' behavior available under a versioned export or git
// history — never mutate history silently.
// ============================================================================

export const CALCULATION_VERSION = "v1.0";

export function pctChange(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export function cagr(current: number | null, start: number | null, years: number): number | null {
  if (current === null || start === null || start <= 0 || current <= 0 || years <= 0) return null;
  return (Math.pow(current / start, 1 / years) - 1) * 100;
}

export function marginOf(numerator: number | null, revenue: number | null): number | null {
  if (numerator === null || revenue === null || revenue === 0) return null;
  return (numerator / revenue) * 100;
}

/** ROIC ≈ NOPAT / Invested Capital. Requires a tax-rate estimate; caller supplies it explicitly. */
export function roic(
  operatingIncome: number | null,
  effectiveTaxRate: number | null,
  investedCapital: number | null
): number | null {
  if (operatingIncome === null || effectiveTaxRate === null || investedCapital === null || investedCapital === 0) {
    return null;
  }
  const nopat = operatingIncome * (1 - effectiveTaxRate);
  return (nopat / investedCapital) * 100;
}

/** Milestone 13E — approved Milestone 13B/13D/13E methodology.
 *  effectiveTaxRate = IncomeTaxExpenseBenefit / continuing-operations pretax
 *  income, as a FRACTION (0.21, not 21) — roic()'s `(1 - effectiveTaxRate)`
 *  term requires this. Only nulls on a missing input or a zero denominator
 *  (division-safety, matching every other ratio in this file); a negative
 *  pretax income, a negative tax expense (tax benefit), or a resulting rate
 *  outside [0,1] are all preserved unclipped — real, disclosed outcomes,
 *  not data errors (see Milestone 13D's audit for empirical examples). */
export function effectiveTaxRate(taxExpense: number | null, pretaxIncome: number | null): number | null {
  if (taxExpense === null || pretaxIncome === null || pretaxIncome === 0) return null;
  return taxExpense / pretaxIncome;
}

/** Milestone 13E — approved Milestone 13B methodology: Invested Capital =
 *  Total Assets − Current Liabilities − Cash. Nulls only when a component is
 *  missing; a negative or zero result is NOT nulled here (zero is handled by
 *  roic()'s own division-safety check; negative is preserved and reported,
 *  never fabricated or floored, per the approved edge-case handling). */
export function investedCapital(totalAssets: number | null, currentLiabilities: number | null, cash: number | null): number | null {
  if (totalAssets === null || currentLiabilities === null || cash === null) return null;
  return totalAssets - currentLiabilities - cash;
}

export function roe(netIncome: number | null, equity: number | null): number | null {
  if (netIncome === null || equity === null || equity === 0) return null;
  return (netIncome / equity) * 100;
}

export function netDebtToEbitda(netDebt: number | null, ebitda: number | null): number | null {
  if (netDebt === null || ebitda === null || ebitda === 0) return null;
  return netDebt / ebitda;
}

export function debtToEquity(totalDebt: number | null, equity: number | null): number | null {
  if (totalDebt === null || equity === null || equity === 0) return null;
  return totalDebt / equity;
}

export function currentRatio(currentAssets: number | null, currentLiabilities: number | null): number | null {
  if (currentAssets === null || currentLiabilities === null || currentLiabilities === 0) return null;
  return currentAssets / currentLiabilities;
}

export function interestCoverage(operatingIncome: number | null, interestExpense: number | null): number | null {
  if (operatingIncome === null || interestExpense === null || interestExpense === 0) return null;
  return operatingIncome / Math.abs(interestExpense);
}

export function freeCashFlow(operatingCashFlow: number | null, capex: number | null): number | null {
  if (operatingCashFlow === null || capex === null) return null;
  return operatingCashFlow - Math.abs(capex);
}

/**
 * P/E — deliberately returns null (not a huge or negative number) when
 * earnings are negative or zero. A negative P/E is not meaningful valuation
 * information and must never silently pass through as if it were.
 */
export function priceToEarnings(price: number | null, epsTTM: number | null): number | null {
  if (price === null || epsTTM === null || epsTTM <= 0) return null;
  return price / epsTTM;
}

export function evToEbitda(enterpriseValue: number | null, ebitda: number | null): number | null {
  if (enterpriseValue === null || ebitda === null || ebitda <= 0) return null;
  return enterpriseValue / ebitda;
}

export function evToSales(enterpriseValue: number | null, revenue: number | null): number | null {
  if (enterpriseValue === null || revenue === null || revenue <= 0) return null;
  return enterpriseValue / revenue;
}

/**
 * FCF yield with negative FCF: returned as a negative percentage (real
 * information — "this company burns cash relative to its price") rather
 * than nulled out, unlike P/E where a negative ratio is not interpretable.
 */
export function fcfYield(fcf: number | null, marketCap: number | null): number | null {
  if (fcf === null || marketCap === null || marketCap <= 0) return null;
  return (fcf / marketCap) * 100;
}

export function priceToFcf(marketCap: number | null, fcf: number | null): number | null {
  if (marketCap === null || fcf === null || fcf <= 0) return null; // negative/zero FCF -> not meaningful as a multiple
  return marketCap / fcf;
}

/**
 * Simple growth-acceleration signal: is the most recent YoY growth rate
 * higher than the trailing rate before it? Returns a value in [-1, 1] where
 * >0 means accelerating. Requires at least 3 same-period-type observations.
 */
export function growthAcceleration(recentGrowth: number | null, priorGrowth: number | null): number | null {
  if (recentGrowth === null || priorGrowth === null) return null;
  const delta = recentGrowth - priorGrowth;
  return Math.max(-1, Math.min(1, delta / 20)); // ±20pp treated as a full-scale signal
}

/** Slope-of-best-fit trend over a series, normalized so sign is what matters most. */
export function trend(series: Array<number | null>): number | null {
  const points = series
    .map((v, i) => (v === null ? null : { x: i, y: v }))
    .filter((p): p is { x: number; y: number } => p !== null);
  if (points.length < 2) return null;

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}
