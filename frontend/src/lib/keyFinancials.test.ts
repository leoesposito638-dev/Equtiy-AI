import { describe, it, expect } from "vitest";
import { keyFinancials, formatKeyFinancialValue } from "./keyFinancials";
import type { CalculatedMetricRow, FinancialMetricRow } from "./types";

function financialRow(metric_name: string, value: number | null, period_end: string, period_type: FinancialMetricRow["period_type"] = "ANNUAL"): FinancialMetricRow {
  return { metric_name, value, unit: "USD", currency: "USD", period_end, period_type, source_id: "src" };
}

function calcRow(metric_name: string, value: number | null, period_end: string): CalculatedMetricRow {
  return { metric_name, value, period_end, period_type: "ANNUAL", calculation_version: "v1.0" };
}

describe("keyFinancials", () => {
  it("omits metrics with no stored row rather than showing a placeholder tile (real DE shape has no long_term_debt_current)", () => {
    const result = keyFinancials([financialRow("revenue", 500, "2026-01-25")], []);
    expect(result.map((r) => r.key)).toEqual(["revenue"]);
  });

  it("returns an empty list, never fabricated tiles, when nothing is stored", () => {
    expect(keyFinancials([], [])).toEqual([]);
  });

  it("picks the latest period per metric across multiple stored years (real NVDA shape)", () => {
    const financials = [
      financialRow("revenue", 60922000000, "2024-01-28"),
      financialRow("revenue", 130497000000, "2025-01-26"),
      financialRow("revenue", 215938000000, "2026-01-25"),
    ];
    const result = keyFinancials(financials, []);
    const revenue = result.find((r) => r.key === "revenue")!;
    expect(revenue.value).toBe(215938000000);
    expect(revenue.periodEnd).toBe("2026-01-25");
  });

  it("reads margins/ROE/growth from calculated_metrics and revenue/EPS/debt from financial_metrics", () => {
    const financials = [financialRow("eps", 4.93, "2026-01-25"), financialRow("long_term_debt_noncurrent", 7469000000, "2026-01-25", "INSTANT")];
    const metrics = [calcRow("net_margin", 55.6, "2026-01-25"), calcRow("roe", 76.3, "2026-01-25")];
    const result = keyFinancials(financials, metrics);
    expect(result.find((r) => r.key === "eps")!.format).toBe("pershare");
    expect(result.find((r) => r.key === "long_term_debt_noncurrent")!.format).toBe("currency");
    expect(result.find((r) => r.key === "net_margin")!.format).toBe("percent");
    expect(result.find((r) => r.key === "roe")!.value).toBe(76.3);
  });

  it("never coerces a missing metric to 0 or includes it", () => {
    const result = keyFinancials([financialRow("revenue", null, "2026-01-25")], [calcRow("roe", null, "2026-01-25")]);
    expect(result).toEqual([]);
  });
});

describe("formatKeyFinancialValue", () => {
  it("formats large currency values in $B", () => {
    expect(formatKeyFinancialValue({ key: "revenue", label: "Revenue", value: 215938000000, periodEnd: "2026-01-25", format: "currency" })).toBe("$215.94B");
  });

  it("formats percent values rounded to one decimal", () => {
    expect(formatKeyFinancialValue({ key: "roe", label: "ROE", value: 65.99326599326596, periodEnd: "2026-01-25", format: "percent" })).toBe("66.0%");
  });

  it("formats per-share values with two decimals", () => {
    expect(formatKeyFinancialValue({ key: "eps", label: "EPS", value: 4.93, periodEnd: "2026-01-25", format: "pershare" })).toBe("$4.93");
  });
});
