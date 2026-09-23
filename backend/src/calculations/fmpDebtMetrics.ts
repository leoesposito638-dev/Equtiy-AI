// ============================================================================
// Equity AI — FMP-sourced debt metrics (Milestone 15C)
//
// Pure, deterministic — no I/O, same convention as fundamentalRatios.ts and
// calculations/metrics.ts. Computes total_debt/net_debt/debt_to_equity/
// net_debt_to_ebitda from FMP's OWN period-aligned balance-sheet +
// income-statement facts (FmpDebtMetricsPeriod — see its doc comment in
// providers/interfaces.ts for why period alignment is guaranteed upstream,
// in the adapter, not here).
//
// EBITDA = operatingIncome + depreciationAndAmortization — the EXACT same
// formula fundamentalRatios.ts's computeEbitda already uses for the
// SEC-sourced path (calculations/fundamentalRatios.ts's own header explains
// why: "EBITDA is NOT a standard GAAP XBRL concept... it is calculated").
// Deliberately NOT FMP's own `ebitda` field — see fmpMarketDataAdapter.ts's
// getDebtMetricsHistory() doc comment for the live-confirmed discrepancy
// (FMP's ebitda used a different, undocumented formula for NVDA: ~144.55B
// vs ~133.23B for operatingIncome + D&A). Same formula, different source
// data — this is what keeps the METHODOLOGY identical across the SEC and
// FMP paths, even though the underlying facts (and therefore the results)
// legitimately differ.
//
// net_debt = totalDebt - cashAndCashEquivalents — the exact same definition
// calculations/fundamentalRatios.ts's computeNetDebt already documents,
// applied to FMP's own totalDebt/cashAndCashEquivalents fields instead of
// SEC's decomposed long_term_debt_current/noncurrent/short_term_borrowings
// + cash. debt_to_equity and net_debt_to_ebitda reuse the EXISTING pure
// formulas from calculations/metrics.ts (debtToEquity, netDebtToEbitda) —
// never reimplemented.
//
// No fallback, no estimate: a period missing any required FMP field never
// reaches this function at all (the adapter already filters those out), and
// debtToEquity/netDebtToEbitda's own null-on-zero-denominator guards are
// preserved exactly as the SEC path already relies on them.
// ============================================================================

import { debtToEquity, netDebtToEbitda } from "./metrics";
import type { FmpDebtMetricsPeriod } from "../providers/interfaces";

export interface FmpDebtMetricResult {
  periodEnd: string;
  totalDebt: number;
  netDebt: number;
  ebitda: number;
  debtToEquity: number | null;
  netDebtToEbitda: number | null;
}

/** One FmpDebtMetricsPeriod in, one fully-computed result out — never
 *  drops a period, since every input field is already guaranteed non-null
 *  by the adapter. debtToEquity/netDebtToEbitda can still legitimately be
 *  null (zero equity, zero EBITDA — real, not a missing-data case). */
export function calculateFmpDebtMetricsForPeriod(period: FmpDebtMetricsPeriod): FmpDebtMetricResult | null {
  const { totalDebt, cashAndCashEquivalents, totalStockholdersEquity, operatingIncome, depreciationAndAmortization } = period;
  if (
    totalDebt === null ||
    cashAndCashEquivalents === null ||
    totalStockholdersEquity === null ||
    operatingIncome === null ||
    depreciationAndAmortization === null
  ) {
    return null;
  }

  const netDebt = totalDebt - cashAndCashEquivalents;
  const ebitda = operatingIncome + depreciationAndAmortization;

  return {
    periodEnd: period.periodEnd,
    totalDebt,
    netDebt,
    ebitda,
    debtToEquity: debtToEquity(totalDebt, totalStockholdersEquity),
    netDebtToEbitda: netDebtToEbitda(netDebt, ebitda),
  };
}

/** Runs calculateFmpDebtMetricsForPeriod over every period, dropping any
 *  (defensively — the adapter should never hand this function a period
 *  with a null field, but this function does not trust that silently). */
export function calculateFmpDebtMetrics(periods: FmpDebtMetricsPeriod[]): FmpDebtMetricResult[] {
  const results: FmpDebtMetricResult[] = [];
  for (const period of periods) {
    const result = calculateFmpDebtMetricsForPeriod(period);
    if (result) results.push(result);
  }
  return results;
}
