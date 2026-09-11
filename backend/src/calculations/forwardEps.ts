// ============================================================================
// Equity AI — Forward EPS Selection + Forward P/E Formula (Milestone 13H)
//
// Pure, deterministic functions — no I/O, no provider/db access — same
// convention as calculations/metrics.ts: return null/"unavailable" (never
// 0, never a guess, never a silent fallback to a different row) whenever a
// required input is missing or fails a validation rule.
//
// selectForwardEps() implements exactly the algorithm the Milestone 13G
// audit established and Milestone 13H specifies:
//   1. Exclude every estimate whose period end is <= the latest reported
//      ANNUAL period_end (which must come from our own trusted
//      financial_metrics — never assumed, never derived from the estimates
//      payload itself, since FMP's analyst-estimates response always
//      includes the already-reported year alongside true future years;
//      see Milestone 13G Part B/C).
//   2. Select the smallest remaining (soonest future) period end.
//   3. Reject — never fall back to a different year — if the selected
//      row's epsAvg is null, <= 0, or backed by fewer than
//      MIN_ANALYST_COUNT analysts.
//   4. Reject — never fall back — if the selected estimate spikes above
//      the latest reported year's OWN estimate row AND is immediately
//      followed by a LOWER next-future-year estimate. This is the exact
//      non-monotonic "spike then reversal" pattern the 13G audit found
//      live for GOOGL/AMZN/CVX (Part D/H) and could not explain from FMP's
//      data alone. Verified against all 16 FMP-supported demo tickers'
//      live 13G data: this rule flags GOOGL/AMZN/CVX and ONLY those three
//      — legitimate large moves (NVDA/INTC's post-trough ramps, UNH's 2025
//      earnings collapse, PFE's gradual multi-year decline) all pass
//      cleanly, because each either keeps rising after the selected year,
//      or never spikes above the latest-reported year's own estimate in
//      the first place.
//      This is a REJECTION guard, never a correction: the value itself is
//      never modified, smoothed, or averaged — only ever accepted as-is or
//      marked unavailable, the same shape as every other "never fabricate"
//      guard in this codebase (compare secEdgarAdapter.ts's
//      MIN/MAX_ANNUAL_SPAN_DAYS span check and its MA shares-outstanding
//      staleness guard — both additive final sanity checks layered on top
//      of an already-correct selection, not new selection algorithms).
// ============================================================================

import type { EstimateRecord } from "../providers/interfaces";

/** Below this many contributing analysts, "consensus" isn't a meaningful
 *  word — Milestone 13H's explicit threshold. */
export const MIN_ANALYST_COUNT = 3;

export interface ForwardEpsSelection {
  status: "available" | "unavailable";
  forwardEps: number | null;
  periodEnd: string | null;
  analystCount: number | null;
  unavailableReason?: string;
}

function unavailable(reason: string): ForwardEpsSelection {
  return { status: "unavailable", forwardEps: null, periodEnd: null, analystCount: null, unavailableReason: reason };
}

/** `estimates` may be in any order and may include both past (already
 *  reported) and future fiscal years — exactly what FMP's analyst-estimates
 *  endpoint returns (Milestone 13G, Part B). `latestReportedPeriodEnd` must
 *  come from our own trusted financial_metrics data (ANNUAL revenue),
 *  never from the estimates payload itself. Both are ISO "YYYY-MM-DD"
 *  date strings, compared lexicographically (safe for that format). */
export function selectForwardEps(estimates: EstimateRecord[], latestReportedPeriodEnd: string): ForwardEpsSelection {
  const future = estimates
    .filter((e) => e.estimatePeriodEnd > latestReportedPeriodEnd)
    .sort((a, b) => (a.estimatePeriodEnd < b.estimatePeriodEnd ? -1 : a.estimatePeriodEnd > b.estimatePeriodEnd ? 1 : 0));

  if (future.length === 0) {
    return unavailable(
      `No FMP analyst-estimate row exists for a fiscal year after the latest reported period (${latestReportedPeriodEnd}).`
    );
  }

  const selected = future[0]!;

  if (selected.consensusValue == null) {
    return unavailable(`Selected estimate row (period end ${selected.estimatePeriodEnd}) has no epsAvg.`);
  }
  if (selected.consensusValue <= 0) {
    return unavailable(
      `Selected estimate row (period end ${selected.estimatePeriodEnd}) has epsAvg <= 0 (${selected.consensusValue}) — not usable for Forward P/E.`
    );
  }
  if (selected.analystCount == null || selected.analystCount < MIN_ANALYST_COUNT) {
    return unavailable(
      `Selected estimate row (period end ${selected.estimatePeriodEnd}) is backed by fewer than ${MIN_ANALYST_COUNT} analysts (${
        selected.analystCount ?? "null"
      }).`
    );
  }

  // Non-monotonic spike-then-reversal guard — see file header. Both
  // comparison rows are optional (the latest-reported row may not be
  // present in the payload; there may be no further future row to compare
  // against) — in either case there is no evidence of the pattern, so the
  // guard does not fire, matching "never invent unavailability" the same
  // way it matches "never invent a correction".
  const latestReportedRow = estimates.find((e) => e.estimatePeriodEnd === latestReportedPeriodEnd);
  const nextFutureRow = future[1];
  if (
    latestReportedRow?.consensusValue != null &&
    nextFutureRow?.consensusValue != null &&
    selected.consensusValue > latestReportedRow.consensusValue &&
    nextFutureRow.consensusValue < selected.consensusValue
  ) {
    return unavailable(
      `Selected estimate row (period end ${selected.estimatePeriodEnd}, epsAvg=${selected.consensusValue}) spikes above the latest ` +
        `reported year's own estimate (${latestReportedRow.consensusValue}) and is immediately followed by a lower estimate ` +
        `(${nextFutureRow.consensusValue}) — rejected as a non-monotonic/implausible consensus per the Milestone 13G audit finding ` +
        `(confirmed live for GOOGL/AMZN/CVX). Never corrected or smoothed, only rejected.`
    );
  }

  return {
    status: "available",
    forwardEps: selected.consensusValue,
    periodEnd: selected.estimatePeriodEnd,
    analystCount: selected.analystCount,
  };
}

/** Forward P/E = current live price / selected forward EPS. Null on any
 *  invalid input — never Infinity, never zero, never fabricated. Mirrors
 *  the null-on-invalid-denominator convention used throughout
 *  calculations/metrics.ts (pctChange, marginOf, roic, ...). */
export function forwardPe(price: number | null, forwardEps: number | null): number | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  if (forwardEps == null || !Number.isFinite(forwardEps) || forwardEps <= 0) return null;
  return price / forwardEps;
}
