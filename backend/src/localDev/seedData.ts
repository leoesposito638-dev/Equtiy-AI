// ============================================================================
// Equity AI — Local Dev Seed Data
//
// IMPORTANT: every figure below is an ILLUSTRATIVE, hand-picked round number
// for exercising the ingestion -> calculation -> scoring pipeline end to
// end on a laptop with zero setup. None of it is sourced from any real
// filing, API, or market data feed — it exists only so `localDev/server.ts`
// has something to normalize, calculate, and score for real. Production
// data must come from a real FinancialDataProvider adapter (see
// src/providers/registry.ts), never from this file.
// ============================================================================

export interface SeedCompany {
  id: string;
  name: string;
  ticker: string;
  sector: string;
}

export const SEED_COMPANIES: SeedCompany[] = [
  { id: "NVDA", name: "NVIDIA", ticker: "NVDA", sector: "Technology" },
  { id: "MSFT", name: "Microsoft", ticker: "MSFT", sector: "Technology" },
];

/** period_end -> raw values, in USD millions except eps/price (USD) and shares (millions). */
export interface SeedPeriod {
  periodEnd: string;
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
  cash: number;
  totalDebt: number;
  equity: number;
  operatingCashFlow: number;
  capex: number;
  sharesOutstanding: number;
  price: number;
}

export const SEED_FINANCIALS: Record<string, { prior: SeedPeriod; current: SeedPeriod }> = {
  NVDA: {
    prior: {
      periodEnd: "2025-06-30", revenue: 26_044, grossProfit: 19_600, operatingIncome: 16_909,
      netIncome: 14_881, eps: 0.60, cash: 8_700, totalDebt: 8_460, equity: 65_100,
      operatingCashFlow: 15_100, capex: 500, sharesOutstanding: 24_600, price: 120.0,
    },
    current: {
      periodEnd: "2026-06-30", revenue: 37_020, grossProfit: 27_900, operatingIncome: 24_040,
      netIncome: 21_300, eps: 0.86, cash: 10_200, totalDebt: 9_500, equity: 82_400,
      operatingCashFlow: 22_800, capex: 700, sharesOutstanding: 24_500, price: 175.0,
    },
  },
  MSFT: {
    prior: {
      periodEnd: "2025-06-30", revenue: 64_727, grossProfit: 44_500, operatingIncome: 30_500,
      netIncome: 24_700, eps: 3.30, cash: 18_300, totalDebt: 42_700, equity: 220_000,
      operatingCashFlow: 31_900, capex: 14_200, sharesOutstanding: 7_430, price: 445.0,
    },
    current: {
      periodEnd: "2026-06-30", revenue: 75_280, grossProfit: 52_100, operatingIncome: 35_600,
      netIncome: 28_500, eps: 3.86, cash: 20_100, totalDebt: 44_000, equity: 244_000,
      operatingCashFlow: 36_500, capex: 16_800, sharesOutstanding: 7_400, price: 512.0,
    },
  },
};

/**
 * Illustrative sector benchmark distributions (p25/median/p75/p90) — stand-in
 * for what schema/002_scoring_tables.sql's `metric_benchmarks` table would
 * hold once computed from a real peer universe. Kept obviously simple/round.
 */
export const SEED_BENCHMARKS: Record<string, { p25: number; median: number; p75: number; p90: number }> = {
  revenue_growth_yoy: { p25: 4, median: 9, p75: 18, p90: 30 },
  gross_margin: { p25: 45, median: 58, p75: 68, p90: 78 },
  operating_margin: { p25: 12, median: 22, p75: 32, p90: 45 },
  net_margin: { p25: 8, median: 15, p75: 24, p90: 35 },
  fcf_margin: { p25: 8, median: 16, p75: 24, p90: 32 },
  roe: { p25: 10, median: 18, p75: 28, p90: 40 },
  debt_to_equity: { p25: 0.15, median: 0.35, p75: 0.6, p90: 0.9 },
  pe: { p25: 18, median: 26, p75: 35, p90: 48 },
  ev_ebitda: { p25: 12, median: 18, p75: 26, p90: 35 },
  ev_sales: { p25: 3, median: 6, p75: 10, p90: 16 },
  fcf_yield: { p25: 1.5, median: 2.8, p75: 4.5, p90: 6.5 },
};
