// ============================================================================
// Equity AI — Domain Types
// Mirrors the SQL schema. `DataStatus` is threaded through anything that can
// be legitimately absent — the whole system is built to say "unavailable"
// instead of guessing.
// ============================================================================

export type DataStatus = "available" | "unavailable" | "partial";

export type PeriodType = "QUARTER" | "ANNUAL" | "TTM" | "INSTANT";

export type ProviderType =
  | "SEC"
  | "COMPANY_FILING"
  | "FINANCIAL_API"
  | "COMPANY_PRESS_RELEASE"
  | "EARNINGS_TRANSCRIPT"
  | "NEWS"
  | "MARKET_DATA";

export interface DataSource {
  id: string;
  providerName: string;
  providerType: ProviderType;
  sourceUrl?: string;
  sourceDocumentId?: string;
  sourceDocumentType?: string;
  publishedAt?: string;
  retrievedAt: string;
  reportingPeriodStart?: string;
  reportingPeriodEnd?: string;
  filingDate?: string;
  currency?: string;
  dataQualityScore?: number; // 0..1
}

export interface Company {
  id: string;
  name: string;
  legalName?: string;
  ticker: string;
  exchange?: string;
  country?: string;
  currency?: string;
  sector?: string;
  industry?: string;
  subIndustry?: string;
  isActive: boolean;
}

/** A single FACT — always carries where it came from. Never AI-authored. */
export interface FinancialMetric {
  id: string;
  companyId: string;
  metricName: string;
  metricCategory?: "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW";
  value: number | null;
  unit: string;
  currency: string;
  periodStart?: string;
  periodEnd: string;
  periodType: PeriodType;
  sourceId: string;
  calculationType: "DIRECT" | "DERIVED";
  confidenceScore?: number;
}

/** A deterministic value Equity AI computed from FinancialMetric rows. */
export interface CalculatedMetric {
  id: string;
  companyId: string;
  metricName: string;
  value: number | null;
  periodEnd: string;
  periodType: PeriodType;
  calculationVersion: string;
  inputDataHash: string;
}

/** Milestone 5: the two approved V1 tiers. No INDUSTRY/SUB_INDUSTRY tier. */
export type BenchmarkType = "SECTOR" | "MARKET_WIDE";

/** Milestone 5: the four approved scoring-provenance states. SECTOR/MARKET_WIDE/
 *  UNAVAILABLE are decided at the benchmark-lookup layer (see
 *  scoring/benchmarkResolver.ts); TREND_ONLY is scoreCategory.ts's own,
 *  pre-existing internal fallback and is not produced by that resolver. */
export type BenchmarkProvenance = "SECTOR" | "MARKET_WIDE" | "TREND_ONLY" | "UNAVAILABLE";

export interface MetricBenchmark {
  metricName: string;
  sector?: string;
  industry?: string;
  periodEnd: string;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  sampleSize: number;
  /** Milestone 5 additions — optional so existing construction sites
   *  (e.g. tests/scoring.test.ts's makeBenchmark helper) remain valid. */
  benchmarkType?: BenchmarkType;
  benchmarkVersion?: string;
  calculatedAt?: string;
}

export interface ScoreCategory {
  id: string;
  categoryKey:
    | "GROWTH"
    | "PROFITABILITY"
    | "FINANCIAL_HEALTH"
    | "VALUATION"
    | "CAPITAL_ALLOCATION"
    | "COMPETITIVE_ADVANTAGE"
    | "MANAGEMENT"
    | "EARNINGS_MOMENTUM";
  name: string;
  defaultWeight: number;
  isActive: boolean;
}

export type RuleType = "PERCENTILE" | "LINEAR" | "LOG" | "RATIO" | "TREND" | "COMPOSITE";
export type Direction = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER" | "OPTIMAL_RANGE";

export interface ScoreRule {
  id: string;
  categoryId: string;
  metricName: string;
  ruleType: RuleType;
  weight: number;
  direction: Direction;
  minimumDataPoints: number;
  sectorSpecific: boolean;
  version: string;
  active: boolean;
}

export interface CategoryScore {
  companyId: string;
  categoryId: string;
  categoryKey: ScoreCategory["categoryKey"];
  score: number;      // 0..100
  confidence: number; // 0..1
  coverage: number;   // 0..1 — fraction of score_rules that had enough data
  calculationVersion: string;
  calculatedAt: string;
  /** Milestone 5: metric_name -> BenchmarkProvenance for each rule that
   *  contributed to this category score. Optional and NOT populated by
   *  scoreCategory.ts yet — see the Milestone 5 report for the specific,
   *  proposed (not implemented) integration point. Mirrors
   *  category_scores.rule_provenance (schema/006_benchmark_provenance.sql). */
  ruleProvenance?: Record<string, BenchmarkProvenance>;
}

export interface FundamentalScore {
  companyId: string;
  score: number;
  confidence: number;
  dataCoverage: number;
  calculationVersion: string;
  previousScore: number | null;
  scoreChange: number | null;
  calculatedAt: string;
  categoryScores: CategoryScore[];
}

/** Kept deliberately separate from FundamentalScore — see brief §31. */
export interface OpportunityScore {
  companyId: string;
  score: number;
  confidence: number;
  calculatedAt: string;
}

export interface ChangeEvent {
  id: string;
  companyId: string;
  eventType: string;
  metricName?: string;
  oldValue?: number;
  newValue?: number;
  absoluteChange?: number;
  percentageChange?: number;
  importanceScore: number; // 0..100
  direction: "UP" | "DOWN" | "FLAT";
  detectedAt: string;
}

export type AlertSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Alert {
  id: string;
  userId: string;
  companyId: string;
  changeEventId: string;
  alertType: string;
  severity: AlertSeverity;
  title: string;
  summary: string;
  scoreBefore?: number;
  scoreAfter?: number;
  isRead: boolean;
  createdAt: string;
}

/** AI-authored, structured, and validated before it ever touches the DB. */
export interface InvestmentThesis {
  companyId: string;
  analysisSnapshotId: string;
  headline: string;
  thesis: string;
  bullCase: string;
  baseCase: string;
  bearCase: string;
  catalysts: string[];
  risks: string[];
  thesisChangeConditions: string[];
  confidence: number;
  modelVersion: string;
  generatedAt: string;
}
