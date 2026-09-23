// ============================================================================
// Tests: calculations/marketSession.ts (Milestone 14D.1) — pure functions,
// no I/O, no mocking. Fixed `now` instants only, never real wall-clock time.
// ============================================================================

import { describe, it, expect } from "vitest";
import { isTradingDaySettled, SETTLEMENT_BUFFER_MINUTES } from "../src/calculations/marketSession";

describe("isTradingDaySettled", () => {
  it("reproduces the exact Milestone 14D bug scenario: 09:40 ET on the trade date itself is NOT settled", () => {
    // 2026-09-23 is EDT (UTC-4): 09:40 ET = 13:40 UTC.
    const now = new Date("2026-09-23T13:40:00Z");
    expect(isTradingDaySettled("2026-09-23", now)).toBe(false);
  });

  it("well before the close (e.g. 10:00 ET) is not settled", () => {
    const now = new Date("2026-09-23T14:00:00Z"); // 10:00 ET
    expect(isTradingDaySettled("2026-09-23", now)).toBe(false);
  });

  it("exactly at market close (16:00 ET / 20:00 UTC in EDT), before the buffer, is NOT settled", () => {
    const now = new Date("2026-09-23T20:00:00Z");
    expect(isTradingDaySettled("2026-09-23", now)).toBe(false);
  });

  it("boundary: exactly at close + settlement buffer IS settled (inclusive)", () => {
    const now = new Date(new Date("2026-09-23T20:00:00Z").getTime() + SETTLEMENT_BUFFER_MINUTES * 60_000);
    expect(isTradingDaySettled("2026-09-23", now)).toBe(true);
  });

  it("boundary: one millisecond before close + buffer is NOT settled", () => {
    const now = new Date(new Date("2026-09-23T20:00:00Z").getTime() + SETTLEMENT_BUFFER_MINUTES * 60_000 - 1);
    expect(isTradingDaySettled("2026-09-23", now)).toBe(false);
  });

  it("one minute after close + buffer is settled", () => {
    const now = new Date(new Date("2026-09-23T20:00:00Z").getTime() + SETTLEMENT_BUFFER_MINUTES * 60_000 + 60_000);
    expect(isTradingDaySettled("2026-09-23", now)).toBe(true);
  });

  it("the next day is settled regardless of time of day", () => {
    const now = new Date("2026-09-24T05:00:00Z");
    expect(isTradingDaySettled("2026-09-23", now)).toBe(true);
  });

  it("a date far in the past is settled", () => {
    const now = new Date("2026-09-23T13:40:00Z");
    expect(isTradingDaySettled("2020-01-02", now)).toBe(true);
  });

  it("correctly handles EST (winter, UTC-5) — market close is 21:00 UTC, not 20:00 UTC", () => {
    // 2026-01-15 is EST. 16:00 ET = 21:00 UTC.
    const justBeforeCloseUtc = new Date("2026-01-15T20:59:00Z"); // 15:59 ET — before close
    expect(isTradingDaySettled("2026-01-15", justBeforeCloseUtc)).toBe(false);

    const afterCloseAndBufferUtc = new Date("2026-01-15T21:30:00Z"); // 16:30 ET — close + 30min buffer
    expect(isTradingDaySettled("2026-01-15", afterCloseAndBufferUtc)).toBe(true);
  });

  it("a future trade_date (later than now) is never settled", () => {
    const now = new Date("2026-09-23T13:40:00Z");
    expect(isTradingDaySettled("2026-09-24", now)).toBe(false);
  });
});
