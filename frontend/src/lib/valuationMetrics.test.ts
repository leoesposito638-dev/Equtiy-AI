import { describe, it, expect } from "vitest";
import { latestValuationMetrics, formatValuationValue, VALUATION_METRIC_NAMES } from "./valuationMetrics";
import type { CalculatedMetricRow } from "./types";

function row(metric_name: string, value: number | null, period_end: string): CalculatedMetricRow {
  return { metric_name, value, period_end, period_type: "TTM", calculation_version: "v1.0" };
}

describe("latestValuationMetrics", () => {
  it("returns one entry per valuation metric, in a fixed order", () => {
    const result = latestValuationMetrics([]);
    expect(result.map((m) => m.metricName)).toEqual([...VALUATION_METRIC_NAMES]);
  });

  it("shows every metric as unavailable when no rows exist (real 30-company demo state, Milestone 11D-A)", () => {
    const result = latestValuationMetrics([]);
    for (const m of result) {
      expect(m.value).toBeNull();
      expect(m.periodEnd).toBeNull();
    }
  });

  it("picks the most recent period when a metric has multiple stored rows", () => {
    const rows = [row("pe", 40, "2024-06-30"), row("pe", 48.2, "2026-06-30")];
    const result = latestValuationMetrics(rows);
    expect(result.find((m) => m.metricName === "pe")!.value).toBe(48.2);
    expect(result.find((m) => m.metricName === "pe")!.periodEnd).toBe("2026-06-30");
  });

  it("never coerces a missing metric to 0", () => {
    const result = latestValuationMetrics([row("pe", 48.2, "2026-06-30")]);
    expect(result.find((m) => m.metricName === "ev_ebitda")!.value).toBeNull();
  });
});

describe("formatValuationValue (Milestone 16B — 1c)", () => {
  it("formats multiples to 1 decimal with an x suffix", () => {
    expect(formatValuationValue({ metricName: "pe", value: 27.4691823899371 })).toBe("27.5x");
    expect(formatValuationValue({ metricName: "forward_pe", value: 23.593656638606 })).toBe("23.6x");
    expect(formatValuationValue({ metricName: "ev_ebitda", value: 22.706667950545 })).toBe("22.7x");
    expect(formatValuationValue({ metricName: "ev_sales", value: 17.512679449053 })).toBe("17.5x");
    expect(formatValuationValue({ metricName: "price_to_fcf", value: 41.646709446798 })).toBe("41.6x");
  });

  it("formats fcf_yield as a percentage, scaling the stored raw fraction by 100 (live NVDA value: 0.0240... -> 2.4%)", () => {
    expect(formatValuationValue({ metricName: "fcf_yield", value: 0.02401150086725255 })).toBe("2.4%");
  });

  it("handles a negative fcf_yield (a company burning cash) without breaking the percent sign", () => {
    expect(formatValuationValue({ metricName: "fcf_yield", value: -0.17213833191403566 })).toBe("-17.2%");
  });

  it("returns an empty string for a null value rather than formatting garbage", () => {
    expect(formatValuationValue({ metricName: "pe", value: null })).toBe("");
  });
});
