// ============================================================================
// Tests: calculations/earningsReaction.ts (Milestone 14E) — pure function,
// no I/O, no mocking.
// ============================================================================

import { describe, it, expect } from "vitest";
import { calculateEarningsReaction2dWindow, type DailyClose } from "../src/calculations/earningsReaction";

describe("calculateEarningsReaction2dWindow", () => {
  it("normal case: report mid-week, prev/next are the adjacent trading days", () => {
    const prices: DailyClose[] = [
      { date: "2026-08-25", close: 213.0 }, // prev (Tue)
      { date: "2026-08-26", close: 220.0 }, // report_date itself — must be ignored
      { date: "2026-08-27", close: 228.0 }, // next (Thu)
    ];
    const result = calculateEarningsReaction2dWindow("2026-08-26", prices);
    expect(result.prevDate).toBe("2026-08-25");
    expect(result.prevClose).toBe(213.0);
    expect(result.nextDate).toBe("2026-08-27");
    expect(result.nextClose).toBe(228.0);
    expect(result.value).toBeCloseTo((228.0 / 213.0 - 1) * 100, 10);
  });

  it("report on Monday: prev is the preceding Friday, weekend rows never exist so none are considered", () => {
    const prices: DailyClose[] = [
      { date: "2026-08-21", close: 100.0 }, // Friday (prev)
      // 2026-08-22/23 are Sat/Sun — genuinely absent, not just skipped
      { date: "2026-08-24", close: 110.0 }, // Monday = report_date, ignored
      { date: "2026-08-25", close: 115.0 }, // Tuesday (next)
    ];
    const result = calculateEarningsReaction2dWindow("2026-08-24", prices);
    expect(result.prevDate).toBe("2026-08-21");
    expect(result.nextDate).toBe("2026-08-25");
    expect(result.value).toBeCloseTo((115.0 / 100.0 - 1) * 100, 10);
  });

  it("holiday gap: prev is more than one calendar day before report_date, still correctly found", () => {
    const prices: DailyClose[] = [
      { date: "2026-07-02", close: 50.0 }, // last trading day before a July 3-4 holiday closure
      // 2026-07-03/04 absent (holiday + weekend-adjacent closure)
      { date: "2026-07-06", close: 55.0 }, // report_date
      { date: "2026-07-07", close: 58.0 },
    ];
    const result = calculateEarningsReaction2dWindow("2026-07-06", prices);
    expect(result.prevDate).toBe("2026-07-02");
    expect(result.nextDate).toBe("2026-07-07");
    expect(result.value).toBeCloseTo((58.0 / 50.0 - 1) * 100, 10);
  });

  it("missing prev price: no row exists before report_date -> unavailable, never fabricated", () => {
    const prices: DailyClose[] = [
      { date: "2026-08-26", close: 220.0 }, // report_date itself, ignored
      { date: "2026-08-27", close: 228.0 },
    ];
    const result = calculateEarningsReaction2dWindow("2026-08-26", prices);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("before report_date");
    expect(result.prevDate).toBeNull();
    expect(result.nextDate).toBe("2026-08-27"); // still surfaced for diagnostics, even though unavailable
  });

  it("missing next price: no row exists after report_date -> unavailable, never fabricated", () => {
    const prices: DailyClose[] = [
      { date: "2026-08-25", close: 213.0 },
      { date: "2026-08-26", close: 220.0 }, // report_date itself, ignored
    ];
    const result = calculateEarningsReaction2dWindow("2026-08-26", prices);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("after report_date");
    expect(result.prevDate).toBe("2026-08-25");
    expect(result.nextDate).toBeNull();
  });

  it("next day not yet in the table: identical to the missing-next case (report just happened, ingestion hasn't caught up)", () => {
    const prices: DailyClose[] = [
      { date: "2026-09-20", close: 213.0 },
      { date: "2026-09-21", close: 214.0 },
      { date: "2026-09-22", close: 215.0 }, // report_date itself, ignored; nothing after it yet
    ];
    const result = calculateEarningsReaction2dWindow("2026-09-22", prices);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("after report_date");
    expect(result.nextDate).toBeNull();
  });

  it("zero close on the prev day is rejected, not silently skipped to an earlier row", () => {
    const prices: DailyClose[] = [
      { date: "2026-08-24", close: 210.0 },
      { date: "2026-08-25", close: 0 }, // corrupt/invalid — the nearest prev row
      { date: "2026-08-27", close: 228.0 },
    ];
    const result = calculateEarningsReaction2dWindow("2026-08-26", prices);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("non-positive or invalid");
    expect(result.prevDate).toBe("2026-08-25"); // still identifies which row was rejected
  });

  it("negative close on the next day is rejected, not silently skipped to a later row", () => {
    const prices: DailyClose[] = [
      { date: "2026-08-25", close: 213.0 },
      { date: "2026-08-27", close: -5.0 }, // corrupt/invalid — the nearest next row
      { date: "2026-08-28", close: 230.0 },
    ];
    const result = calculateEarningsReaction2dWindow("2026-08-26", prices);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("non-positive or invalid");
    expect(result.nextDate).toBe("2026-08-27");
  });

  it("no price rows at all -> unavailable", () => {
    const result = calculateEarningsReaction2dWindow("2026-08-26", []);
    expect(result.value).toBeNull();
    expect(result.prevDate).toBeNull();
    expect(result.nextDate).toBeNull();
  });

  it("prices need not be pre-sorted — the function sorts defensively", () => {
    const prices: DailyClose[] = [
      { date: "2026-08-27", close: 228.0 },
      { date: "2026-08-25", close: 213.0 },
    ];
    const result = calculateEarningsReaction2dWindow("2026-08-26", prices);
    expect(result.prevDate).toBe("2026-08-25");
    expect(result.nextDate).toBe("2026-08-27");
  });

  it("a negative reaction (price dropped) is preserved as a real negative value, never floored at zero", () => {
    const prices: DailyClose[] = [
      { date: "2026-08-25", close: 220.0 },
      { date: "2026-08-27", close: 200.0 },
    ];
    const result = calculateEarningsReaction2dWindow("2026-08-26", prices);
    expect(result.value).toBeCloseTo((200.0 / 220.0 - 1) * 100, 10);
    expect(result.value!).toBeLessThan(0);
  });
});
