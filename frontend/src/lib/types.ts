// ============================================================================
// Frontend types — mirror the response shapes documented and implemented in
// ../backend (src/types/domain.ts and src/api/routes/*.ts). Kept as a
// separate copy deliberately: the frontend and backend are different
// deployable projects and shouldn't share a build-time import, but these
// types must stay in sync with the backend's actual table/route shapes.
// ============================================================================

export interface Company {
  id: string;
  name: string;
  ticker: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  country?: string;
}

export type PeriodType = "QUARTER" | "ANNUAL" | "TTM" | "INSTANT";

/** GET /companies/:id/financials — one row of financial_metrics */
export interface FinancialMetricRow {
  metric_name: string;
  value: number | null;
  unit: string;
  currency: string;
  period_end: string;
  period_type: PeriodType;
  source_id: string;
}

/** GET /companies/:id/metrics — one row of calculated_metrics */
export interface CalculatedMetricRow {
  metric_name: string;
  value: number | null;
  period_end: string;
  period_type: PeriodType;
  calculation_version: string;
}

export type ScoreCategoryKey =
  | "GROWTH"
  | "PROFITABILITY"
  | "FINANCIAL_HEALTH"
  | "VALUATION"
  | "CAPITAL_ALLOCATION"
  | "COMPETITIVE_ADVANTAGE"
  | "MANAGEMENT"
  | "EARNINGS_MOMENTUM";

/** GET /companies/:id/scores -> data.fundamental */
export interface FundamentalScoreRow {
  score: number;
  confidence: number;
  data_coverage: number;
  calculation_version: string;
  previous_score: number | null;
  score_change: number | null;
  calculated_at: string;
}

/** GET /companies/:id/scores -> data.categories[] (joined with score_categories) */
export interface CategoryScoreRow {
  score: number;
  confidence: number;
  coverage: number;
  calculation_version: string;
  calculated_at: string;
  score_categories: { category_key: ScoreCategoryKey; name: string };
}

export interface ScoresResponse {
  fundamental: FundamentalScoreRow | null;
  categories: CategoryScoreRow[];
}

/** GET /companies/:id/analysis -> data.snapshot (analysis_snapshots row) */
export interface AnalysisSnapshotRow {
  fundamental_score: number;
  opportunity_score: number | null;
  score_change: number | null;
  analysis_version: string;
  generated_at: string;
  summary: string | null;
}

/** GET /companies/:id/analysis -> data.thesis (investment_theses row) */
export interface InvestmentThesisRow {
  headline: string;
  thesis: string;
  bull_case: string | null;
  base_case: string | null;
  bear_case: string | null;
  catalysts: string[];
  risks: string[];
  thesis_change_conditions: string[];
  generated_at: string;
  model_version: string;
}

export interface AnalysisResponse {
  snapshot: AnalysisSnapshotRow | null;
  thesis: InvestmentThesisRow | null;
}

/** GET /companies/:id/changes — change_events rows */
export interface ChangeEventRow {
  id: string;
  event_type: string;
  metric_name: string | null;
  old_value: number | null;
  new_value: number | null;
  absolute_change: number | null;
  percentage_change: number | null;
  importance_score: number;
  direction: "UP" | "DOWN" | "FLAT";
  detected_at: string;
}

export type AlertSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** GET /alerts — alerts rows joined with companies(name, ticker) */
export interface AlertRow {
  id: string;
  company_id: string;
  alert_type: string;
  severity: AlertSeverity;
  title: string;
  summary: string;
  score_before: number | null;
  score_after: number | null;
  is_read: boolean;
  created_at: string;
  companies: { name: string; ticker: string };
}

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}
