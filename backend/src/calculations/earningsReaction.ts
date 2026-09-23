// ============================================================================
// Equity AI — Earnings Reaction (2-Day Window) Formula (Milestone 14E)
//
// Pure, deterministic — no I/O, no provider/db access — same convention as
// calculations/earningsSurprise.ts and calculations/metrics.ts: return null
// (never 0, never a guess, never an interpolated/substituted price) whenever
// a required input is missing or invalid.
//
// Formula (product decision, Milestone 14E Part 1 — not open to reinterpretation
// here): close(prev trading day) -> close(next trading day) around
// earnings.report_date, as close_next / close_prev - 1.
//
// "Prev"/"next" = the nearest daily_prices rows STRICTLY before / strictly
// AFTER report_date's calendar date — never the row ON report_date itself,
// even if one exists. This is deliberate, not an oversight: the 14C audit
// found FMP's earnings data carries no AM/PM timing, so it is never known
// whether report_date's own close already reflects the reaction or not.
// Bracketing report_date on both sides (excluding it) is the only
// timing-neutral interpretation — it always captures the full 2-day window
// around the event regardless of when during report_date the release
// actually happened. "Nearest" automatically absorbs weekends and holidays
// (a Friday close before a Monday report, a gap after a mid-week holiday)
// since it walks the REAL rows present, never assumes a fixed offset.
//
// Scale: stored as percentage POINTS (e.g. 7.04, not 0.0704), matching the
// sibling "_percent" metrics already in calculated_metrics (eps_surprise_
// percent / revenue_surprise_percent, via calculations/metrics.ts's
// pctChange, which also multiplies by 100) — see this milestone's report
// for why, and note this is a judgment call on the raw formula's scale,
// not a reinterpretation of the formula itself.
// ============================================================================

export interface DailyClose {
  date: string; // "YYYY-MM-DD"
  close: number;
}

export interface EarningsReactionResult {
  value: number | null;
  reason?: string;
  prevDate: string | null;
  prevClose: number | null;
  nextDate: string | null;
  nextClose: number | null;
}

function unavailable(
  reason: string,
  prev: DailyClose | null,
  next: DailyClose | null
): EarningsReactionResult {
  return {
    value: null,
    reason,
    prevDate: prev?.date ?? null,
    prevClose: prev?.close ?? null,
    nextDate: next?.date ?? null,
    nextClose: next?.close ?? null,
  };
}

/**
 * `prices` need not be pre-sorted or pre-filtered to one company — callers
 * pass whatever they have; this function only reads `date`/`close` and does
 * its own scan. `reportDate` and every `date` in `prices` are "YYYY-MM-DD"
 * strings (never a datetime), compared lexicographically, which is valid
 * for ISO dates.
 */
export function calculateEarningsReaction2dWindow(reportDate: string, prices: DailyClose[]): EarningsReactionResult {
  const sorted = [...prices].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let prev: DailyClose | null = null;
  let next: DailyClose | null = null;
  for (const p of sorted) {
    if (p.date < reportDate) {
      prev = p; // keep advancing — the last one assigned before the loop passes reportDate is the nearest
    } else if (p.date > reportDate) {
      next = p;
      break; // sorted ascending — the first date past reportDate is the nearest
    }
    // p.date === reportDate is neither prev nor next — deliberately excluded (see header comment)
  }

  if (!prev) return unavailable(`No daily_prices row found before report_date ${reportDate}.`, prev, next);
  if (!next) return unavailable(`No daily_prices row found after report_date ${reportDate}.`, prev, next);

  if (!Number.isFinite(prev.close) || prev.close <= 0) {
    return unavailable(`prev close (${prev.close} on ${prev.date}) is non-positive or invalid — rejected, never used.`, prev, next);
  }
  if (!Number.isFinite(next.close) || next.close <= 0) {
    return unavailable(`next close (${next.close} on ${next.date}) is non-positive or invalid — rejected, never used.`, prev, next);
  }

  const value = (next.close / prev.close - 1) * 100; // percentage points — see header comment
  if (!Number.isFinite(value)) {
    return unavailable("computed reaction value is not a finite number.", prev, next);
  }

  return { value, prevDate: prev.date, prevClose: prev.close, nextDate: next.date, nextClose: next.close };
}
