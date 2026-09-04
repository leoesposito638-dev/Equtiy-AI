import { describe, it, expect } from "vitest";
import { latestGrowthMetrics, GROWTH_METRIC_NAMES } from "./growthMetrics";
import type { CalculatedMetricRow } from "./types";

function row(metric_name: string, value: number | null, period_end: string, period_type: CalculatedMetricRow["period_type"] = "ANNUAL"): CalculatedMetricRow {
  return { metric_name, value, period_end, period_type, calculation_version: "v1.0" };
}

describe("latestGrowthMetrics", () => {
  it("returns one entry per GROWTH metric, in a fixed order", () => {
    const result = latestGrowthMetrics([]);
    expect(result.map((m) => m.metricName)).toEqual([...GROWTH_METRIC_NAMES]);
  });

  it("picks the most recent ANNUAL period when a metric has multiple stored rows (real NVDA shape)", () => {
    const rows = [
      row("revenue_growth_yoy", 125.85, "2024-01-28"),
      row("revenue_growth_yoy", 114.20, "2025-01-26"),
      row("revenue_growth_yoy", 65.47, "2026-01-25"),
    ];
    const result = latestGrowthMetrics(rows);
    const rev = result.find((m) => m.metricName === "revenue_growth_yoy")!;
    expect(rev.value).toBe(65.47);
    expect(rev.periodEnd).toBe("2026-01-25");
  });

  it("leaves a metric with no stored row as null — never coerces to 0 (real INTC eps_cagr shape)", () => {
    const rows = [row("revenue_growth_yoy", -0.467, "2025-12-27")];
    const result = latestGrowthMetrics(rows);
    const epsCagr = result.find((m) => m.metricName === "eps_cagr")!;
    expect(epsCagr.value).toBeNull();
    expect(epsCagr.periodEnd).toBeNull();
  });

  it("ignores non-ANNUAL rows for the same metric", () => {
    const rows = [row("revenue_growth_yoy", 999, "2026-06-30", "QUARTER"), row("revenue_growth_yoy", 42, "2026-01-25", "ANNUAL")];
    const result = latestGrowthMetrics(rows);
    expect(result.find((m) => m.metricName === "revenue_growth_yoy")!.value).toBe(42);
  });

  it("ignores rows with a null value rather than treating them as the latest", () => {
    const rows = [row("eps_cagr", 10, "2024-01-01"), row("eps_cagr", null, "2026-01-01")];
    const result = latestGrowthMetrics(rows);
    expect(result.find((m) => m.metricName === "eps_cagr")!.value).toBe(10);
  });

  it("marks growth_acceleration's unit as blank (it's a trend slope, not a percentage)", () => {
    const result = latestGrowthMetrics([]);
    expect(result.find((m) => m.metricName === "growth_acceleration")!.unit).toBe("");
    expect(result.find((m) => m.metricName === "revenue_growth_yoy")!.unit).toBe("%");
  });
});
