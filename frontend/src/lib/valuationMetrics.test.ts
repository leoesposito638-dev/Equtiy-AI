import { describe, it, expect } from "vitest";
import { latestValuationMetrics, VALUATION_METRIC_NAMES } from "./valuationMetrics";
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
