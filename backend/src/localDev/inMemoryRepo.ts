// ============================================================================
// Equity AI — In-Memory Repository (local dev / wiring proof only)
//
// Implements the exact ScoringRepo interface from src/scoring/scoringEngine.ts
// against plain JS objects instead of Postgres/Supabase. This lets the real,
// unmodified scoring engine run with zero database and zero npm installs.
//
// Ingested facts go through the REAL validators/normalizers
// (src/ingestion/validators.ts, src/ingestion/normalizers.ts) and every
// derived number goes through the REAL calculation functions
// (src/calculations/metrics.ts) — nothing here is a hardcoded score. This
// file is NOT a substitute for src/db/client.ts in production; see
// localDev/server.ts and the backend README for that distinction.
// ============================================================================

import { validateRawLineItem } from "../ingestion/validators";
import { normalizeLineItem } from "../ingestion/normalizers";
import type { RawLineItem } from "../providers/interfaces";
import * as calc from "../calculations/metrics";
import { CALCULATION_VERSION } from "../calculations/metrics";
import type { ScoreCategory, ScoreRule, MetricBenchmark, FundamentalScore } from "../types/domain";
import type { ScoringRepo } from "../scoring/scoringEngine";
import type { MetricInput } from "../scoring/categoryScorers/types";
import { SEED_BENCHMARKS, SEED_COMPANIES, SEED_FINANCIALS, type SeedPeriod } from "./seedData";

// ---------------------------------------------------------------------------
// Score categories + rules — ported directly from
// schema/004_seed_scoring_config.sql (same keys, same weights, same version).
// ---------------------------------------------------------------------------
const CATEGORY_DEFS: Array<{ key: ScoreCategory["categoryKey"]; weight: number }> = [
  { key: "GROWTH", weight: 0.16 },
  { key: "PROFITABILITY", weight: 0.16 },
  { key: "FINANCIAL_HEALTH", weight: 0.14 },
  { key: "VALUATION", weight: 0.14 },
  { key: "CAPITAL_ALLOCATION", weight: 0.10 },
  { key: "COMPETITIVE_ADVANTAGE", weight: 0.12 },
  { key: "MANAGEMENT", weight: 0.08 },
  { key: "EARNINGS_MOMENTUM", weight: 0.10 },
];

const CATEGORIES: ScoreCategory[] = CATEGORY_DEFS.map((c) => ({
  id: c.key, categoryKey: c.key, name: c.key, defaultWeight: c.weight, isActive: true,
}));

function rule(categoryId: string, metricName: string, weight: number, direction: ScoreRule["direction"], ruleType: ScoreRule["ruleType"], minPoints = 1): ScoreRule {
  return { id: `${categoryId}-${metricName}`, categoryId, metricName, ruleType, weight, direction, minimumDataPoints: minPoints, sectorSpecific: true, version: "v1.0", active: true };
}

// minimum_data_points below are pinned to match schema/004_seed_scoring_config.sql
// exactly (the live scoring configuration is the source of truth — this
// in-memory config must never silently contradict it; see Milestone 4A).
const RULES: ScoreRule[] = [
  rule("GROWTH", "revenue_growth_yoy", 0.30, "HIGHER_IS_BETTER", "PERCENTILE", 2),
  rule("GROWTH", "revenue_cagr_3y", 0.20, "HIGHER_IS_BETTER", "PERCENTILE", 4),
  rule("GROWTH", "eps_growth_yoy", 0.20, "HIGHER_IS_BETTER", "PERCENTILE", 2),
  rule("GROWTH", "eps_cagr", 0.15, "HIGHER_IS_BETTER", "PERCENTILE", 4),
  rule("GROWTH", "growth_acceleration", 0.15, "HIGHER_IS_BETTER", "TREND", 3),

  rule("PROFITABILITY", "gross_margin", 0.20, "HIGHER_IS_BETTER", "PERCENTILE"),
  rule("PROFITABILITY", "operating_margin", 0.25, "HIGHER_IS_BETTER", "PERCENTILE"),
  rule("PROFITABILITY", "net_margin", 0.15, "HIGHER_IS_BETTER", "PERCENTILE"),
  rule("PROFITABILITY", "roic", 0.20, "HIGHER_IS_BETTER", "PERCENTILE"),
  rule("PROFITABILITY", "roe", 0.10, "HIGHER_IS_BETTER", "PERCENTILE"),
  rule("PROFITABILITY", "margin_trend", 0.10, "HIGHER_IS_BETTER", "TREND", 3),

  rule("FINANCIAL_HEALTH", "net_debt_to_ebitda", 0.25, "LOWER_IS_BETTER", "PERCENTILE"),
  rule("FINANCIAL_HEALTH", "debt_to_equity", 0.15, "LOWER_IS_BETTER", "PERCENTILE"),
  rule("FINANCIAL_HEALTH", "current_ratio", 0.15, "OPTIMAL_RANGE", "PERCENTILE"),
  rule("FINANCIAL_HEALTH", "interest_coverage", 0.20, "HIGHER_IS_BETTER", "PERCENTILE"),
  rule("FINANCIAL_HEALTH", "fcf_margin", 0.15, "HIGHER_IS_BETTER", "PERCENTILE"),
  rule("FINANCIAL_HEALTH", "debt_trend", 0.10, "LOWER_IS_BETTER", "TREND", 3),

  rule("VALUATION", "pe", 0.20, "LOWER_IS_BETTER", "PERCENTILE"),
  rule("VALUATION", "forward_pe", 0.15, "LOWER_IS_BETTER", "PERCENTILE"),
  rule("VALUATION", "ev_ebitda", 0.20, "LOWER_IS_BETTER", "PERCENTILE"),
  rule("VALUATION", "ev_sales", 0.15, "LOWER_IS_BETTER", "PERCENTILE"),
  rule("VALUATION", "price_to_fcf", 0.15, "LOWER_IS_BETTER", "PERCENTILE"),
  rule("VALUATION", "fcf_yield", 0.15, "HIGHER_IS_BETTER", "PERCENTILE"),

  rule("CAPITAL_ALLOCATION", "roic", 0.35, "HIGHER_IS_BETTER", "PERCENTILE"),
  rule("CAPITAL_ALLOCATION", "share_count_trend", 0.25, "LOWER_IS_BETTER", "TREND", 3),
  rule("CAPITAL_ALLOCATION", "net_debt_trend", 0.20, "LOWER_IS_BETTER", "TREND", 3),
  rule("CAPITAL_ALLOCATION", "fcf_reinvestment_rate", 0.20, "OPTIMAL_RANGE", "RATIO"),

  rule("COMPETITIVE_ADVANTAGE", "gross_margin_stability", 0.35, "HIGHER_IS_BETTER", "TREND", 5),
  rule("COMPETITIVE_ADVANTAGE", "roic_persistence", 0.35, "HIGHER_IS_BETTER", "TREND", 5),
  rule("COMPETITIVE_ADVANTAGE", "rd_intensity", 0.30, "OPTIMAL_RANGE", "RATIO"),

  rule("MANAGEMENT", "guidance_credibility", 0.50, "HIGHER_IS_BETTER", "COMPOSITE", 4),
  rule("MANAGEMENT", "share_dilution_trend", 0.30, "LOWER_IS_BETTER", "TREND", 3),
  rule("MANAGEMENT", "insider_ownership", 0.20, "HIGHER_IS_BETTER", "PERCENTILE"),

  rule("EARNINGS_MOMENTUM", "eps_surprise_percent", 0.30, "HIGHER_IS_BETTER", "LINEAR"),
  rule("EARNINGS_MOMENTUM", "revenue_surprise_percent", 0.25, "HIGHER_IS_BETTER", "LINEAR"),
  rule("EARNINGS_MOMENTUM", "estimate_revision_trend", 0.25, "HIGHER_IS_BETTER", "TREND", 2),
  rule("EARNINGS_MOMENTUM", "guidance_direction_score", 0.20, "HIGHER_IS_BETTER", "COMPOSITE"),
];

// ---------------------------------------------------------------------------
// Ingestion: real validate -> normalize, per company per period.
// ---------------------------------------------------------------------------
function periodToRawLineItems(p: SeedPeriod): RawLineItem[] {
  const mk = (metricName: string, value: number, unit = "USD_MM"): RawLineItem => ({
    metricName, rawValue: value, unit, currency: "USD", periodEnd: p.periodEnd, periodType: "ANNUAL",
  });
  return [
    mk("revenue", p.revenue), mk("gross_profit", p.grossProfit), mk("operating_income", p.operatingIncome),
    mk("net_income", p.netIncome), mk("eps", p.eps, "USD"), mk("cash", p.cash), mk("total_debt", p.totalDebt),
    mk("equity", p.equity), mk("operating_cash_flow", p.operatingCashFlow), mk("capex", p.capex),
  ];
}

interface CanonicalFacts { [metricName: string]: number | null }

function ingestPeriod(p: SeedPeriod, existingKeys: Set<string>): { facts: CanonicalFacts; rejected: Array<{ metric: string; reason: string }> } {
  const facts: CanonicalFacts = {};
  const rejected: Array<{ metric: string; reason: string }> = [];

  for (const item of periodToRawLineItems(p)) {
    const validation = validateRawLineItem(item, existingKeys);
    if (!validation.valid) {
      rejected.push({ metric: item.metricName, reason: validation.issues.map((i) => i.message).join("; ") });
      continue;
    }
    const { metric, error } = normalizeLineItem(item, "local", "local-source", "USD");
    if (!metric) {
      rejected.push({ metric: item.metricName, reason: error ?? "normalization failed" });
      continue;
    }
    facts[metric.metricName] = metric.value;
    existingKeys.add(`${item.metricName}|${item.periodEnd}|${item.periodType}`);
  }
  return { facts, rejected };
}

// ---------------------------------------------------------------------------
// Calculated metrics: real functions from src/calculations/metrics.ts
// ---------------------------------------------------------------------------
function computeCalculatedMetrics(prior: CanonicalFacts, current: CanonicalFacts, market: { price: number; shares: number }) {
  const revenueGrowthYoy = calc.pctChange(current.revenue ?? null, prior.revenue ?? null);
  const grossMargin = calc.marginOf(current.gross_profit ?? null, current.revenue ?? null);
  const grossMarginPrior = calc.marginOf(prior.gross_profit ?? null, prior.revenue ?? null);
  const operatingMargin = calc.marginOf(current.operating_income ?? null, current.revenue ?? null);
  const operatingMarginPrior = calc.marginOf(prior.operating_income ?? null, prior.revenue ?? null);
  const netMargin = calc.marginOf(current.net_income ?? null, current.revenue ?? null);
  const roe = calc.roe(current.net_income ?? null, current.equity ?? null);
  const debtToEquity = calc.debtToEquity(current.total_debt ?? null, current.equity ?? null);
  const fcf = calc.freeCashFlow(current.operating_cash_flow ?? null, current.capex ?? null);
  const fcfMargin = calc.marginOf(fcf, current.revenue ?? null);
  const ebitdaApprox = current.operating_income != null ? current.operating_income * 1.15 : null; // illustrative D&A add-back
  const netDebt = current.total_debt != null && current.cash != null ? current.total_debt - current.cash : null;
  const netDebtToEbitda = calc.netDebtToEbitda(netDebt, ebitdaApprox);
  const marketCap = market.price * market.shares;
  const pe = calc.priceToEarnings(market.price, current.eps ?? null);
  const enterpriseValue = netDebt != null ? marketCap + netDebt : null;
  const evEbitda = calc.evToEbitda(enterpriseValue, ebitdaApprox);
  const evSales = calc.evToSales(enterpriseValue, current.revenue ?? null);
  const priceToFcf = calc.priceToFcf(marketCap, fcf);
  const fcfYield = calc.fcfYield(fcf, marketCap);

  return {
    revenue_growth_yoy: revenueGrowthYoy,
    gross_margin: grossMargin, gross_margin_history: [grossMarginPrior, grossMargin],
    operating_margin: operatingMargin, operating_margin_history: [operatingMarginPrior, operatingMargin],
    net_margin: netMargin,
    roe,
    debt_to_equity: debtToEquity,
    fcf_margin: fcfMargin,
    net_debt_to_ebitda: netDebtToEbitda,
    pe, ev_ebitda: evEbitda, ev_sales: evSales, price_to_fcf: priceToFcf, fcf_yield: fcfYield,
    margin_trend: [operatingMarginPrior, operatingMargin], // fed as TREND history, see below
  };
}

// ---------------------------------------------------------------------------
// The ScoringRepo implementation itself
// ---------------------------------------------------------------------------
export interface CompanySnapshot {
  metricInputs: Map<string, MetricInput>;
  baselineMetricInputs: Map<string, MetricInput>;
  raw: ReturnType<typeof computeCalculatedMetrics>;
  ingestionRejected: Array<{ metric: string; reason: string }>;
}

/** Builds a metric-input map from a single computeCalculatedMetrics() result. */
function toMetricInputs(raw: ReturnType<typeof computeCalculatedMetrics>): Map<string, MetricInput> {
  const map = new Map<string, MetricInput>();
  const single = (name: string, value: number | null) => map.set(name, { metricName: name, latestValue: value, history: [value] });
  single("revenue_growth_yoy", raw.revenue_growth_yoy);
  map.set("gross_margin", { metricName: "gross_margin", latestValue: raw.gross_margin, history: raw.gross_margin_history });
  map.set("operating_margin", { metricName: "operating_margin", latestValue: raw.operating_margin, history: raw.operating_margin_history });
  single("net_margin", raw.net_margin);
  single("roe", raw.roe);
  single("debt_to_equity", raw.debt_to_equity);
  single("fcf_margin", raw.fcf_margin);
  single("net_debt_to_ebitda", raw.net_debt_to_ebitda);
  single("pe", raw.pe);
  single("ev_ebitda", raw.ev_ebitda);
  single("ev_sales", raw.ev_sales);
  single("price_to_fcf", raw.price_to_fcf);
  single("fcf_yield", raw.fcf_yield);
  map.set("margin_trend", { metricName: "margin_trend", latestValue: raw.operating_margin, history: raw.margin_trend });
  return map;
}

export class InMemoryStore {
  private snapshots = new Map<string, CompanySnapshot>();
  private previousScores = new Map<string, { score: number; calculatedAt: string; categoryScores: FundamentalScore["categoryScores"] }>();
  public lastResult = new Map<string, FundamentalScore>();

  constructor() {
    for (const c of SEED_COMPANIES) {
      const seed = SEED_FINANCIALS[c.id];
      const existingKeys = new Set<string>();
      const { facts: priorFacts, rejected: r1 } = ingestPeriod(seed.prior, existingKeys);
      const { facts: currentFacts, rejected: r2 } = ingestPeriod(seed.current, existingKeys);

      // "Current" snapshot: full 2-period history -> YoY growth and 2-point
      // trends become computable.
      const raw = computeCalculatedMetrics(priorFacts, currentFacts, { price: seed.current.price, shares: seed.current.sharesOutstanding });
      const metricInputs = toMetricInputs(raw);
      // Deliberately NOT seeded: revenue_cagr_3y, eps_*, growth_acceleration, roic,
      // current_ratio, interest_coverage, debt_trend, forward_pe, and everything
      // under CAPITAL_ALLOCATION / COMPETITIVE_ADVANTAGE / MANAGEMENT /
      // EARNINGS_MOMENTUM — this is the point: watch those categories come back
      // with real, non-fabricated low coverage/confidence instead of a fake score.

      // "Baseline" snapshot: only the prior period is known (as if this were
      // the company's very first scoring run) — no YoY growth, no trend, by
      // construction. Used purely so /changes has a real prior score to diff
      // against; see commitAsPrevious() below.
      const baselineRaw = computeCalculatedMetrics({}, priorFacts, { price: seed.prior.price, shares: seed.prior.sharesOutstanding });
      const baselineMetricInputs = toMetricInputs(baselineRaw);

      this.snapshots.set(c.id, { metricInputs, baselineMetricInputs, raw, ingestionRejected: [...r1, ...r2] });
    }
  }

  getSnapshot(companyId: string): CompanySnapshot | undefined {
    return this.snapshots.get(companyId);
  }

  private buildRepo(companyId: string, useBaseline: boolean): ScoringRepo {
    const snapshot = this.snapshots.get(companyId);
    if (!snapshot) throw new Error(`No local seed data for company ${companyId}`);
    const inputs = useBaseline ? snapshot.baselineMetricInputs : snapshot.metricInputs;

    return {
      getActiveCategories: async () => CATEGORIES,
      getActiveRules: async () => RULES,
      getCompanySector: async () => SEED_COMPANIES.find((c) => c.id === companyId)?.sector,
      getMetricInputs: async (_companyId, metricNames) => {
        const map = new Map<string, MetricInput>();
        for (const name of metricNames) {
          const input = inputs.get(name);
          if (input) map.set(name, input);
        }
        return map;
      },
      getBenchmarks: async (_sector, metricNames) => {
        const map = new Map<string, MetricBenchmark>();
        for (const name of metricNames) {
          const b = SEED_BENCHMARKS[name];
          if (b) map.set(name, { metricName: name, periodEnd: "2026-06-30", sampleSize: 40, ...b });
        }
        return map;
      },
      // Baseline runs have no history before them; the "current" run reads
      // whatever commitAsPrevious() last stored (see below).
      getPreviousFundamentalScore: async () => (useBaseline ? null : this.previousScores.get(companyId) ?? null),
      storeFundamentalScore: async (result) => {
        this.lastResult.set(companyId, result);
      },
    };
  }

  /** ScoringRepo using only prior-period data — no YoY growth, no trend, by construction. */
  buildBaselineRepoFor(companyId: string): ScoringRepo {
    return this.buildRepo(companyId, true);
  }

  /** ScoringRepo using the full current snapshot (2-period history). */
  buildRepoFor(companyId: string): ScoringRepo {
    return this.buildRepo(companyId, false);
  }

  /** Snapshot the current lastResult as "previous" — used to seed a realistic
   * score_change before recomputing, so /changes has something genuine to show. */
  commitAsPrevious(companyId: string) {
    const result = this.lastResult.get(companyId);
    if (result) this.previousScores.set(companyId, { score: result.score, calculatedAt: result.calculatedAt, categoryScores: result.categoryScores });
  }

  calculationVersion = CALCULATION_VERSION;
}
