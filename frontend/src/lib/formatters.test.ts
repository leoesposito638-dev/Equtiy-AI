import { describe, it, expect } from "vitest";
import { formatMultiple, formatPercent } from "./formatters";

describe("formatMultiple", () => {
  it("rounds a valuation multiple to 1 decimal and appends x (Milestone 16B, NVDA P/E)", () => {
    expect(formatMultiple(27.4691823899371)).toBe("27.5x");
  });

  it("does not round away a meaningfully different value", () => {
    expect(formatMultiple(9.295148705570702)).toBe("9.3x");
    expect(formatMultiple(213.1791582132261)).toBe("213.2x");
  });
});

describe("formatPercent", () => {
  it("keeps its existing 1-decimal default", () => {
    expect(formatPercent(2.401150086725255)).toBe("2.4%");
  });
});
