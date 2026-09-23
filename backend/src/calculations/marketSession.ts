// ============================================================================
// Equity AI — US Market Session Settlement Check (Milestone 14D.1)
//
// The Milestone 14D live run happened ~09:40 America/New_York on
// 2026-09-23 — during market hours — so the row FMP returned for that
// trade_date was an in-progress intraday snapshot, not a final daily bar,
// and got stored as if it were a settled close. This module is the fix:
// a trade_date is only trustworthy as a daily OHLCV fact once the US
// market session for that date has actually closed, plus a safe buffer
// for the vendor's own data to settle.
//
// Pure, deterministic, no I/O — `now` is an explicit parameter (defaulting
// to the real current time only at the one real call site, in
// fmpMarketDataAdapter.ts) specifically so this is unit-testable without
// depending on wall-clock time.
// ============================================================================

/** NYSE/Nasdaq regular-session close, in America/New_York wall-clock time. */
const MARKET_CLOSE_HOUR_ET = 16;
const MARKET_CLOSE_MINUTE_ET = 0;

/** Extra margin after the 4:00 PM ET close before a vendor's daily bar is
 *  trusted as final — covers the vendor's own settlement/consolidation lag,
 *  not just the exchange close itself. A deliberately conservative but
 *  small buffer: this is a plausibility floor, not an attempt to model
 *  FMP's actual publication SLA precisely. */
export const SETTLEMENT_BUFFER_MINUTES = 30;

/** Converts a wall-clock time in America/New_York (e.g. "16:00 on
 *  2026-09-23") into the real UTC instant it corresponds to, correctly
 *  accounting for EDT/EST without any external timezone library — Node's
 *  built-in Intl carries the IANA tz database. Works by formatting a naive
 *  UTC guess into America/New_York, measuring how far that reading is from
 *  the guess, and correcting by exactly that (whole-hour, for US zones)
 *  offset — a standard single-pass technique that is exact because US
 *  timezone offsets are always a whole number of hours. */
function nyWallClockToUtc(dateStr: string, hour: number, minute: number): Date {
  const guess = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(guess)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  const nyReadingOfGuessAsIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  const offsetMs = guess.getTime() - nyReadingOfGuessAsIfUtc;
  return new Date(guess.getTime() + offsetMs);
}

/** True iff `tradeDate` ("YYYY-MM-DD")'s US market session has closed and
 *  the settlement buffer has elapsed, as of `now`. Never assumes a date is
 *  settled just because it's in the past on some OTHER timezone's clock —
 *  always evaluated against the actual America/New_York close instant. */
export function isTradingDaySettled(tradeDate: string, now: Date = new Date()): boolean {
  const closeInstant = nyWallClockToUtc(tradeDate, MARKET_CLOSE_HOUR_ET, MARKET_CLOSE_MINUTE_ET);
  const settledAtInstant = new Date(closeInstant.getTime() + SETTLEMENT_BUFFER_MINUTES * 60_000);
  return now.getTime() >= settledAtInstant.getTime();
}
