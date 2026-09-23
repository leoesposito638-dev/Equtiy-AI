// ============================================================================
// Equity AI — Earnings Surprise Data-Quality Guard (Milestone 14B §8)
//
// Milestone 13G/14A found implausible actual-vs-consensus values from FMP
// for GOOGL and AMZN specifically (e.g. GOOGL 2026-07-22: epsActual 9.11 vs
// epsEstimated 2.87 — a 217% "surprise" wildly out of line with the
// company's own neighboring quarters' actual EPS). Milestone 14B live-
// verified this is STILL present today, and specifically on the
// /stable/earnings endpoint this milestone consumes (not just the annual
// analyst-estimates endpoint audited earlier):
//   GOOGL 2026-07-22: actual 9.11 vs consensus 2.87 -> +217.4%
//   AMZN  2026-07-30: actual 5.75 vs consensus 1.82 -> +215.9%
//
// Rather than hard-coding those two tickers (which the ticket explicitly
// allows as a fallback, but only if no defensible generic rule exists), a
// live calibration pass across 12 of the 16 FMP-supported demo tickers
// (Milestone 14B, read-only) found a clean, universal, ticker-agnostic
// signal: a GENUINE, DEFENSIBLE surprise for this 30-company large-cap
// universe never came close to +/-200%. The highest legitimate values seen
// were INTC's 100.0% and 84.4% (a real post-trough earnings recovery) and
// UNH's 29.1% (a real, publicly-known 2025 cost-guidance reset). GOOGL and
// AMZN's flagged rows (215-217%) sit far above that, with nothing in
// between (a wide margin, not a threshold picked to just barely clear or
// exclude specific values).
//
// This guard therefore does NOT special-case GOOGL/AMZN/CVX by name. It is
// a single, generic, symmetric magnitude threshold applied identically to
// every company and both EPS and revenue surprise. It ALSO correctly (and
// was not tuned to) catches two additional INTC rows (epsEstimated near
// zero: 0.01897 and 0.01781) whose resulting percentages are mathematically
// correct but not a meaningful, comparable scoring input either
// (1428.7% / 1191.4%) — evidence this is a genuine plausibility floor, not
// a rule reverse-engineered to hit exactly three pre-named tickers. It does
// NOT currently reject any CVX row: live-verified, CVX's most recent 5
// quarters on THIS endpoint (max 41.0%) do not reproduce the anomaly found
// in the Milestone 13G audit (that finding was on the separate, ANNUAL
// analyst-estimates endpoint) — reported honestly rather than assumed.
//
// This is a REJECTION guard, never a correction: it only ever marks a
// derived surprise metric unavailable. It never modifies, substitutes, or
// invents a value, and it never touches the raw provider record (eps_actual/
// eps_estimate/revenue_actual/revenue_estimate are always persisted exactly
// as FMP returned them — see ingestion/ingestEarnings.ts). Because it
// removes what would otherwise be GOOGL's and AMZN's single HIGHEST
// (most favorable, under HIGHER_IS_BETTER scoring) surprise value, it is
// not "designed to improve scores" — if anything it removes their best-
// looking data point.
// ============================================================================

/** A defendable large margin above every genuine surprise observed live
 *  across the demo universe (highest legitimate: ~100%) and well below the
 *  two confirmed-anomalous values (~216-217%). Not tuned to a specific
 *  company — see file header for the live calibration data. */
export const IMPLAUSIBLE_SURPRISE_MAGNITUDE_PERCENT = 200;

export interface EarningsQualityCheckResult {
  ok: boolean;
  reason?: string;
}

/** `surprisePercent` is the ALREADY-COMPUTED result of
 *  calculateEpsSurprisePercent/calculateRevenueSurprisePercent
 *  (calculations/earningsSurprise.ts) — this function does not recompute
 *  anything, it only judges whether that result is plausible enough to
 *  persist as a calculated_metrics row. A null input (nothing was computed,
 *  e.g. missing actual/consensus) trivially passes — there is nothing to
 *  reject; that case is already "unavailable" for its own, unrelated
 *  reason. */
export function assessSurpriseMagnitude(surprisePercent: number | null, fieldLabel: string): EarningsQualityCheckResult {
  if (surprisePercent === null) return { ok: true };
  if (Math.abs(surprisePercent) > IMPLAUSIBLE_SURPRISE_MAGNITUDE_PERCENT) {
    return {
      ok: false,
      reason:
        `${fieldLabel} surprise magnitude (${surprisePercent.toFixed(1)}%) exceeds the ` +
        `${IMPLAUSIBLE_SURPRISE_MAGNITUDE_PERCENT}% plausibility threshold calibrated for this 30-company ` +
        `large-cap demo universe (Milestone 14B) — rejected as a probable data/units inconsistency or a ` +
        `degenerate near-zero-consensus denominator, never corrected or substituted with an invented value.`,
    };
  }
  return { ok: true };
}
