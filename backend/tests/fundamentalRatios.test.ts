// ============================================================================
// Tests: Milestone 12B ratio metrics (fundamentalRatios.ts) — period
// alignment across duration and instant facts, and per-metric independence.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  computeNetMargin, computeGrossMargin, computeOperatingMargin, computeRoe,
  computeCurrentRatio, computeInterestCoverage, computeFreeCashFlow, computeFcfMargin, computeRdIntensity,
  computeInvestedCapital, computeEffectiveTaxRate, computeRoic,
  type PeriodValue,
} from "../src/calculations/fundamentalRatios";

function p(id: string, periodEnd: string, value: number | null): PeriodValue {
  return { id, periodEnd, value };
}

describe("computeNetMargin", () => {
  it("computes net_margin for every period where both net_income and revenue exist", () => {
    const netIncome = [p("ni-1", "2026-01-25", 120), p("ni-2", "2025-01-26", 73), p("ni-3", "2024-01-28", 30)];
    const revenue = [p("rev-1", "2026-01-25", 200), p("rev-2", "2025-01-26", 130), p("rev-3", "2024-01-28", 60)];
    const results = computeNetMargin(netIncome, revenue);
    expect(results).toHaveLength(3);
    expect(results.find((r) => r.periodEnd === "2026-01-25")!.value).toBeCloseTo(60, 4);
  });

  it("produces no result for a period missing either input — never a guess", () => {
    const netIncome = [p("ni-1", "2026-01-25", 120), p("ni-2", "2025-01-26", null)];
    const revenue = [p("rev-1", "2026-01-25", 200)]; // 2025 revenue missing entirely
    const results = computeNetMargin(netIncome, revenue);
    expect(results).toHaveLength(1);
    expect(results[0]!.periodEnd).toBe("2026-01-25");
  });

  it("returns empty when there is no overlap at all", () => {
    expect(computeNetMargin([], [])).toEqual([]);
  });
});

describe("computeGrossMargin / computeOperatingMargin", () => {
  it("a company missing gross_profit entirely (e.g. a bank) yields no gross_margin, independent of other metrics", () => {
    expect(computeGrossMargin([], [p("rev-1", "2025-12-31", 100)])).toEqual([]);
  });

  it("computes operating_margin correctly", () => {
    const results = computeOperatingMargin([p("oi-1", "2025-12-31", 25)], [p("rev-1", "2025-12-31", 100)]);
    expect(results[0]!.value).toBeCloseTo(25, 4);
  });
});

describe("computeRoe — aligns an ANNUAL duration fact (net_income) with an INSTANT fact (equity) by period_end", () => {
  it("matches net_income's period_end against equity's period_end (same fiscal year end, different fact shapes)", () => {
    const netIncome = [p("ni-1", "2026-01-25", 79)];
    const equity = [p("eq-1", "2026-01-25", 79)]; // instant fact, same date
    const results = computeRoe(netIncome, equity);
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBeCloseTo(100, 4);
  });

  it("real, legitimate negative equity produces a real negative ROE, never rejected or zeroed", () => {
    const results = computeRoe([p("ni-1", "2025-12-31", 10)], [p("eq-1", "2025-12-31", -50)]);
    expect(results[0]!.value).toBeCloseTo(-20, 4);
  });
});

describe("computeCurrentRatio — both inputs instant", () => {
  it("computes current_ratio from current_assets/current_liabilities", () => {
    const results = computeCurrentRatio([p("ca-1", "2025-12-31", 80)], [p("cl-1", "2025-12-31", 40)]);
    expect(results[0]!.value).toBeCloseTo(2, 4);
  });

  it("a company with no current/non-current classification (e.g. a bank) yields nothing", () => {
    expect(computeCurrentRatio([], [])).toEqual([]);
  });
});

describe("computeInterestCoverage", () => {
  it("computes operating_income / interest_expense", () => {
    const results = computeInterestCoverage([p("oi-1", "2025-12-31", 100)], [p("ie-1", "2025-12-31", 20)]);
    expect(results[0]!.value).toBeCloseTo(5, 4);
  });
});

describe("computeFreeCashFlow + computeFcfMargin — a two-step derived chain", () => {
  it("computes free_cash_flow = operating_cash_flow - capex, then fcf_margin = fcf / revenue", () => {
    const fcf = computeFreeCashFlow([p("ocf-1", "2025-12-31", 100)], [p("capex-1", "2025-12-31", 30)]);
    expect(fcf[0]!.value).toBeCloseTo(70, 4);

    const asPeriodValues: PeriodValue[] = fcf.map((r) => ({ id: r.sourceObservationIds.join(","), periodEnd: r.periodEnd, value: r.value }));
    const margin = computeFcfMargin(asPeriodValues, [p("rev-1", "2025-12-31", 200)]);
    expect(margin[0]!.value).toBeCloseTo(35, 4);
  });

  it("a company with no capex concept at all (e.g. a bank) yields no free_cash_flow, and therefore no fcf_margin", () => {
    const fcf = computeFreeCashFlow([p("ocf-1", "2025-12-31", 100)], []);
    expect(fcf).toEqual([]);
    const margin = computeFcfMargin([], [p("rev-1", "2025-12-31", 200)]);
    expect(margin).toEqual([]);
  });
});

describe("computeRdIntensity", () => {
  it("computes research_development / revenue", () => {
    const results = computeRdIntensity([p("rd-1", "2025-12-31", 16)], [p("rev-1", "2025-12-31", 200)]);
    expect(results[0]!.value).toBeCloseTo(8, 4);
  });

  it("a company that does not disclose R&D (e.g. a restaurant chain) yields nothing — real, expected absence, not fabricated as 0", () => {
    expect(computeRdIntensity([], [p("rev-1", "2025-12-31", 200)])).toEqual([]);
  });
});

// Milestone 13E — invested_capital, effective_tax_rate, roic.
describe("computeInvestedCapital", () => {
  it("computes Total Assets - Current Liabilities - Cash for every fully-aligned period", () => {
    const ta = [p("ta-1", "2025-12-31", 1000), p("ta-2", "2024-12-31", 900)];
    const cl = [p("cl-1", "2025-12-31", 200), p("cl-2", "2024-12-31", 180)];
    const cash = [p("c-1", "2025-12-31", 100), p("c-2", "2024-12-31", 90)];
    const results = computeInvestedCapital(ta, cl, cash);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.periodEnd === "2025-12-31")!.value).toBe(700);
  });

  it("produces no result for a period missing any one of the three components (e.g. JPM's missing current_liabilities)", () => {
    const ta = [p("ta-1", "2025-12-31", 1000)];
    const cl: PeriodValue[] = []; // e.g. JPM — banks don't tag current_liabilities
    const cash = [p("c-1", "2025-12-31", 100)];
    expect(computeInvestedCapital(ta, cl, cash)).toEqual([]);
  });

  it("preserves a negative result — never fabricated or floored", () => {
    const ta = [p("ta-1", "2025-12-31", 100)];
    const cl = [p("cl-1", "2025-12-31", 500)];
    const cash = [p("c-1", "2025-12-31", 100)];
    const results = computeInvestedCapital(ta, cl, cash);
    expect(results[0]!.value).toBe(-500);
  });
});

describe("computeEffectiveTaxRate", () => {
  it("computes tax_expense / pretax_income as a fraction for every aligned period", () => {
    const te = [p("te-1", "2025-12-31", 210)];
    const pi = [p("pi-1", "2025-12-31", 1000)];
    const results = computeEffectiveTaxRate(te, pi);
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBeCloseTo(0.21, 4);
  });

  it("preserves a negative rate from a tax benefit — never clipped to 0", () => {
    const te = [p("te-1", "2025-12-31", -242)];
    const pi = [p("pi-1", "2025-12-31", 1000)];
    expect(computeEffectiveTaxRate(te, pi)[0]!.value).toBeCloseTo(-0.242, 4);
  });

  it("ORCL-style misalignment: a stale pretax-income period (no overlap with current tax_expense years) yields nothing for the current periods", () => {
    const te = [p("te-1", "2026-05-31", 2467), p("te-2", "2025-05-31", 1717)]; // current
    const pi = [p("pi-1", "2018-05-31", 12891), p("pi-2", "2017-05-31", 11517)]; // stale
    expect(computeEffectiveTaxRate(te, pi)).toEqual([]);
  });
});

describe("computeRoic", () => {
  it("computes ROIC only where operating_income, effective_tax_rate, and invested_capital all align on the same period_end", () => {
    const oi = [p("oi-1", "2025-12-31", 1000), p("oi-2", "2024-12-31", 900)];
    const etr = [p("etr-1", "2025-12-31", 0.2)]; // only one period of tax-rate data
    const ic = [p("ic-1", "2025-12-31", 5000), p("ic-2", "2024-12-31", 4500)];
    const results = computeRoic(oi, etr, ic);
    expect(results).toHaveLength(1); // 2024-12-31 dropped — no aligned effective_tax_rate
    expect(results[0]!.periodEnd).toBe("2025-12-31");
    expect(results[0]!.value).toBeCloseTo(16, 4); // NOPAT=800, /5000*100=16
  });

  it("MCD-style total unavailability: zero effective_tax_rate periods at all yields zero ROIC results, never a fabricated one", () => {
    const oi = [p("oi-1", "2025-12-31", 1000)];
    const etr: PeriodValue[] = [];
    const ic = [p("ic-1", "2025-12-31", 5000)];
    expect(computeRoic(oi, etr, ic)).toEqual([]);
  });

  it("preserves a negative ROIC when invested capital is negative — never fabricated or floored", () => {
    const oi = [p("oi-1", "2025-12-31", 1000)];
    const etr = [p("etr-1", "2025-12-31", 0.2)];
    const ic = [p("ic-1", "2025-12-31", -5000)];
    expect(computeRoic(oi, etr, ic)[0]!.value).toBeCloseTo(-16, 4);
  });
});
