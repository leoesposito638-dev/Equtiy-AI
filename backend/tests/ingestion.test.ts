// ============================================================================
// Tests: ingestion validators — currency, periods, duplicates
// ============================================================================

import { describe, it, expect } from "vitest";
import { validateRawLineItem } from "../src/ingestion/validators";
import { normalizeLineItem } from "../src/ingestion/normalizers";
import type { RawLineItem } from "../src/providers/interfaces";

function baseItem(overrides: Partial<RawLineItem> = {}): RawLineItem {
  return {
    metricName: "revenue",
    rawValue: 1_000_000,
    unit: "USD",
    currency: "USD",
    periodEnd: "2026-06-30",
    periodType: "QUARTER",
    ...overrides,
  };
}

describe("currency handling", () => {
  it("rejects an item with no currency rather than assuming USD", () => {
    const result = validateRawLineItem(baseItem({ currency: undefined as unknown as string }), new Set());
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe("MISSING_CURRENCY");
  });

  it("normalizeLineItem refuses to convert without an explicit FX rate", () => {
    const item = baseItem({ currency: "EUR" });
    const { metric, error } = normalizeLineItem(item, "company-1", "source-1", "USD");
    expect(metric).toBeNull();
    expect(error).toMatch(/no matching FX rate/);
  });

  it("normalizeLineItem converts correctly when a matching FX rate is supplied", () => {
    const item = baseItem({ currency: "EUR", rawValue: 100 });
    const { metric } = normalizeLineItem(item, "company-1", "source-1", "USD", {
      from: "EUR",
      to: "USD",
      rate: 1.08,
      asOf: "2026-06-30",
    });
    expect(metric?.value).toBeCloseTo(108);
    expect(metric?.currency).toBe("USD");
    expect(metric?.calculationType).toBe("DERIVED"); // converted values are marked derived, not direct
  });
});

describe("period handling", () => {
  it("rejects a TTM-labeled item whose date span is not ~12 months", () => {
    const item = baseItem({ periodType: "TTM", periodStart: "2026-04-01", periodEnd: "2026-06-30" }); // ~3 months, mislabeled
    const result = validateRawLineItem(item, new Set());
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "PERIOD_TYPE_MISMATCH")).toBe(true);
  });

  it("accepts a correctly-spanned TTM item", () => {
    const item = baseItem({ periodType: "TTM", periodStart: "2025-07-01", periodEnd: "2026-06-30" });
    const result = validateRawLineItem(item, new Set());
    expect(result.valid).toBe(true);
  });
});

describe("duplicate observations", () => {
  it("rejects a metric/period/period_type combination already ingested from this source", () => {
    const key = "revenue|2026-06-30|QUARTER";
    const result = validateRawLineItem(baseItem(), new Set([key]));
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe("DUPLICATE_OBSERVATION");
  });
});

describe("impossible values", () => {
  it("flags a structurally-impossible negative value (e.g. revenue < 0)", () => {
    const result = validateRawLineItem(baseItem({ rawValue: -500 }), new Set());
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "IMPOSSIBLE_VALUE")).toBe(true);
  });

  it("allows negative values for metrics that are legitimately allowed to be negative", () => {
    const result = validateRawLineItem(baseItem({ metricName: "net_income", rawValue: -500 }), new Set());
    expect(result.valid).toBe(true);
  });
});
