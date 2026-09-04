// ============================================================================
// Demo fixtures — used ONLY when DEMO_MODE is true (no VITE_API_BASE_URL
// configured). Shaped exactly like real API responses so the same
// components render identically once a live backend is wired in.
// ============================================================================

import type {
  AlertRow, AnalysisResponse, CalculatedMetricRow, ChangeEventRow, Company,
  FinancialMetricRow, ScoresResponse,
} from "./types";

export const FIXTURE_COMPANIES: Company[] = [
  { id: "NVDA", name: "NVIDIA", ticker: "NVDA", exchange: "NASDAQ", sector: "Technology", industry: "Semiconductors" },
  { id: "MSFT", name: "Microsoft", ticker: "MSFT", exchange: "NASDAQ", sector: "Technology", industry: "Software" },
  { id: "SPOT", name: "Spotify", ticker: "SPOT", exchange: "NYSE", sector: "Communication Services", industry: "Internet Content & Info" },
  { id: "AAPL", name: "Apple", ticker: "AAPL", exchange: "NASDAQ", sector: "Technology", industry: "Consumer Electronics" },
  { id: "GOOGL", name: "Alphabet", ticker: "GOOGL", exchange: "NASDAQ", sector: "Technology", industry: "Internet Content & Info" },
];

export const FIXTURE_FOLLOWED = new Set(["NVDA", "MSFT", "SPOT"]);

const CATEGORY_NAMES: Record<string, string> = {
  GROWTH: "Growth", PROFITABILITY: "Profitability", FINANCIAL_HEALTH: "Financial Health",
  VALUATION: "Valuation", CAPITAL_ALLOCATION: "Capital Allocation",
  COMPETITIVE_ADVANTAGE: "Competitive Advantage", MANAGEMENT: "Management", EARNINGS_MOMENTUM: "Earnings Momentum",
};

function categories(scores: Record<string, [number, number, number]>): ScoresResponse["categories"] {
  return Object.entries(scores).map(([key, [score, confidence, coverage]]) => ({
    score, confidence, coverage,
    calculation_version: "v1.0",
    calculated_at: "2026-08-24T09:12:00Z",
    score_categories: { category_key: key as any, name: CATEGORY_NAMES[key] ?? key },
  }));
}

export const FIXTURE_SCORES: Record<string, ScoresResponse> = {
  NVDA: {
    fundamental: { score: 91, confidence: 0.94, data_coverage: 0.98, calculation_version: "v1.0", previous_score: 89, score_change: 2, calculated_at: "2026-08-24T09:12:00Z" },
    categories: categories({ GROWTH: [96, 0.96, 1], PROFITABILITY: [97, 0.95, 1], FINANCIAL_HEALTH: [92, 0.93, 0.95], VALUATION: [68, 0.91, 1], CAPITAL_ALLOCATION: [88, 0.82, 0.85], COMPETITIVE_ADVANTAGE: [94, 0.79, 0.75], MANAGEMENT: [85, 0.71, 0.65], EARNINGS_MOMENTUM: [95, 0.9, 0.9] }),
  },
  MSFT: {
    fundamental: { score: 88, confidence: 0.97, data_coverage: 0.99, calculation_version: "v1.0", previous_score: 88, score_change: 0, calculated_at: "2026-08-24T09:12:00Z" },
    categories: categories({ GROWTH: [78, 0.95, 1], PROFITABILITY: [91, 0.96, 1], FINANCIAL_HEALTH: [96, 0.97, 1], VALUATION: [72, 0.92, 1], CAPITAL_ALLOCATION: [90, 0.85, 0.9], COMPETITIVE_ADVANTAGE: [92, 0.8, 0.8], MANAGEMENT: [89, 0.75, 0.7], EARNINGS_MOMENTUM: [80, 0.88, 0.9] }),
  },
  SPOT: {
    fundamental: { score: 82, confidence: 0.81, data_coverage: 0.87, calculation_version: "v1.0", previous_score: 78, score_change: 4, calculated_at: "2026-08-24T09:12:00Z" },
    categories: categories({ GROWTH: [74, 0.85, 0.9], PROFITABILITY: [68, 0.79, 0.8], FINANCIAL_HEALTH: [79, 0.83, 0.85], VALUATION: [85, 0.9, 1], CAPITAL_ALLOCATION: [71, 0.6, 0.55], COMPETITIVE_ADVANTAGE: [76, 0.55, 0.5], MANAGEMENT: [73, 0.5, 0.45], EARNINGS_MOMENTUM: [88, 0.86, 0.85] }),
  },
  AAPL: {
    fundamental: { score: 85, confidence: 0.95, data_coverage: 0.97, calculation_version: "v1.0", previous_score: 86, score_change: -1, calculated_at: "2026-08-24T09:12:00Z" },
    categories: categories({ GROWTH: [58, 0.92, 1], PROFITABILITY: [95, 0.96, 1], FINANCIAL_HEALTH: [94, 0.95, 1], VALUATION: [66, 0.9, 1], CAPITAL_ALLOCATION: [93, 0.84, 0.85], COMPETITIVE_ADVANTAGE: [96, 0.78, 0.75], MANAGEMENT: [82, 0.7, 0.65], EARNINGS_MOMENTUM: [70, 0.85, 0.85] }),
  },
  GOOGL: {
    fundamental: { score: 89, confidence: 0.96, data_coverage: 0.98, calculation_version: "v1.0", previous_score: 86, score_change: 3, calculated_at: "2026-08-24T09:12:00Z" },
    categories: categories({ GROWTH: [79, 0.94, 1], PROFITABILITY: [90, 0.95, 1], FINANCIAL_HEALTH: [95, 0.96, 1], VALUATION: [78, 0.91, 1], CAPITAL_ALLOCATION: [86, 0.83, 0.85], COMPETITIVE_ADVANTAGE: [91, 0.77, 0.75], MANAGEMENT: [84, 0.72, 0.65], EARNINGS_MOMENTUM: [86, 0.89, 0.9] }),
  },
};

function financials(rows: Array<[string, number | null, string, string, string, string]>): FinancialMetricRow[] {
  return rows.map(([metric_name, value, unit, currency, period_end, period_type]) => ({
    metric_name, value, unit, currency, period_end, period_type: period_type as any, source_id: `src-${metric_name}`,
  }));
}

export const FIXTURE_FINANCIALS: Record<string, FinancialMetricRow[]> = {
  NVDA: financials([["revenue_growth_yoy", 42.1, "%", "USD", "2026-06-30", "QUARTER"], ["operating_margin", 54.1, "%", "USD", "2026-06-30", "TTM"], ["fcf_margin", 28.4, "%", "USD", "2026-06-30", "TTM"]]),
  MSFT: financials([["revenue_growth_yoy", 16.3, "%", "USD", "2026-06-30", "QUARTER"], ["operating_margin", 44.6, "%", "USD", "2026-06-30", "TTM"], ["fcf_margin", 31.2, "%", "USD", "2026-06-30", "TTM"]]),
  SPOT: financials([["revenue_growth_yoy", 18.7, "%", "USD", "2026-06-30", "QUARTER"], ["operating_margin", 11.2, "%", "USD", "2026-06-30", "TTM"], ["fcf_margin", 14.8, "%", "USD", "2026-06-30", "TTM"]]),
  AAPL: financials([["revenue_growth_yoy", 5.4, "%", "USD", "2026-06-30", "QUARTER"], ["operating_margin", 31.5, "%", "USD", "2026-06-30", "TTM"], ["fcf_margin", 27.9, "%", "USD", "2026-06-30", "TTM"]]),
  GOOGL: financials([["revenue_growth_yoy", 14.1, "%", "USD", "2026-06-30", "QUARTER"], ["operating_margin", 32.4, "%", "USD", "2026-06-30", "TTM"], ["fcf_margin", 24.6, "%", "USD", "2026-06-30", "TTM"]]),
};

export const FIXTURE_VALUATION: Record<string, CalculatedMetricRow[]> = {
  NVDA: [{ metric_name: "pe", value: 48.2, period_end: "2026-06-30", period_type: "TTM", calculation_version: "v1.0" }],
  MSFT: [{ metric_name: "pe", value: 34.6, period_end: "2026-06-30", period_type: "TTM", calculation_version: "v1.0" }],
  SPOT: [{ metric_name: "pe", value: 41.0, period_end: "2026-06-30", period_type: "TTM", calculation_version: "v1.0" }],
  AAPL: [{ metric_name: "pe", value: 29.8, period_end: "2026-06-30", period_type: "TTM", calculation_version: "v1.0" }],
  GOOGL: [{ metric_name: "pe", value: 26.1, period_end: "2026-06-30", period_type: "TTM", calculation_version: "v1.0" }],
};

export const FIXTURE_ANALYSIS: Record<string, AnalysisResponse> = {
  NVDA: {
    snapshot: { fundamental_score: 91, opportunity_score: 74, score_change: 2, analysis_version: "v1.0", generated_at: "2026-08-24T09:15:00Z", summary: "Growth and profitability remain the company's defining strengths." },
    thesis: {
      headline: "Exceptional growth and profitability priced for continued flawless execution",
      thesis: "NVIDIA's growth and profitability remain well ahead of the peer set, driven by sustained data center demand. Valuation is the primary constraint, requiring continued execution to justify the current multiple.",
      bull_case: "Data center demand continues to outpace supply, extending the current margin profile through the next several quarters.",
      base_case: "Growth decelerates toward a still-elevated rate as the comparison base grows, with margins holding roughly flat.",
      bear_case: "A demand air-pocket or a faster-than-expected competitive response compresses margins and re-rates the multiple sharply lower.",
      catalysts: ["Next quarterly earnings report", "New data center product cycle commentary", "Major hyperscaler capex guidance updates"],
      risks: ["Customer concentration among a small number of hyperscalers", "Export policy changes affecting addressable market", "Competitive response from custom silicon programs"],
      thesis_change_conditions: ["Two consecutive quarters of gross margin compression", "Guidance materially below consensus", "Loss of a top-5 customer relationship"],
      generated_at: "2026-08-24T09:15:00Z", model_version: "claude-sonnet-4-6 / v1.0",
    },
  },
  MSFT: {
    snapshot: { fundamental_score: 88, opportunity_score: 70, score_change: 0, analysis_version: "v1.0", generated_at: "2026-08-24T09:15:00Z", summary: "Financial health and quality remain exceptional." },
    thesis: {
      headline: "Durable, broad-based quality with growth that has moderated from prior years",
      thesis: "Microsoft's financial health and quality remain exceptional, underpinned by cloud and productivity segments. Growth has moderated but stayed durable and diversified across the business.",
      bull_case: "Cloud reacceleration alongside AI-attached productivity revenue lifts growth back toward the high teens.",
      base_case: "Growth holds in the mid-teens with continued margin discipline across segments.",
      bear_case: "Enterprise IT spending softens broadly, slowing cloud growth alongside the rest of the sector.",
      catalysts: ["Cloud segment growth disclosure next quarter", "AI-attached revenue commentary"],
      risks: ["Elevated capex intensity pressuring near-term free cash flow", "Regulatory scrutiny across major markets"],
      thesis_change_conditions: ["Cloud growth decelerating below low double digits", "A sustained step-down in operating margin"],
      generated_at: "2026-08-24T09:15:00Z", model_version: "claude-sonnet-4-6 / v1.0",
    },
  },
  SPOT: {
    snapshot: { fundamental_score: 82, opportunity_score: 79, score_change: 4, analysis_version: "v1.0", generated_at: "2026-08-24T09:15:00Z", summary: "Operating margin is improving materially." },
    thesis: {
      headline: "Profitability inflecting faster than expected off a still-early base",
      thesis: "Spotify's operating margin is improving materially as subscriber growth continues to outpace content and distribution costs. Absolute profitability still trails larger, more established peers.",
      bull_case: "Margin expansion continues at the current pace as pricing power and ad-supported monetization both improve.",
      base_case: "Margin gains continue but at a slower pace as content costs re-accelerate with catalog growth.",
      bear_case: "Subscriber growth slows in a more competitive streaming landscape, stalling the margin inflection.",
      catalysts: ["Next quarterly subscriber and margin update", "Audiobook and podcast monetization commentary"],
      risks: ["Content cost inflation", "Competitive pricing pressure from larger platforms"],
      thesis_change_conditions: ["Operating margin flat or declining for two consecutive quarters", "Subscriber growth falling below mid-single digits"],
      generated_at: "2026-08-24T09:15:00Z", model_version: "claude-sonnet-4-6 / v1.0",
    },
  },
  AAPL: {
    snapshot: { fundamental_score: 85, opportunity_score: 66, score_change: -1, analysis_version: "v1.0", generated_at: "2026-08-24T09:15:00Z", summary: "Quality is the standout dimension." },
    thesis: {
      headline: "Best-in-class quality and durability, constrained mainly by growth",
      thesis: "Apple's quality dimension stands out: durable margins, an exceptionally strong balance sheet, and high-quality earnings. Growth is the primary limiter as hardware demand normalizes.",
      bull_case: "A renewed hardware upgrade cycle alongside services growth lifts overall growth back above high single digits.",
      base_case: "Services growth continues to offset flattish hardware demand, holding overall growth in the low-to-mid single digits.",
      bear_case: "Hardware demand softens further with no offsetting services acceleration, pressuring the growth score further.",
      catalysts: ["Next hardware product cycle", "Services segment growth disclosure"],
      risks: ["Hardware demand normalization", "Regulatory pressure on services revenue"],
      thesis_change_conditions: ["Services growth decelerating below high single digits", "Two consecutive quarters of hardware revenue decline"],
      generated_at: "2026-08-24T09:15:00Z", model_version: "claude-sonnet-4-6 / v1.0",
    },
  },
  GOOGL: {
    snapshot: { fundamental_score: 89, opportunity_score: 81, score_change: 3, analysis_version: "v1.0", generated_at: "2026-08-24T09:15:00Z", summary: "Financial health and profitability are exceptional." },
    thesis: {
      headline: "Broad-based strength across search, cloud, and the balance sheet",
      thesis: "Financial health and profitability are exceptional, and growth is broad-based across search, cloud, and other bets. Valuation has re-rated higher, leaving less margin of safety than earlier in the year.",
      bull_case: "Cloud continues to reaccelerate while search holds share, lifting blended growth further.",
      base_case: "Search growth moderates while cloud continues to offset, holding blended growth roughly flat.",
      bear_case: "Search share erosion from AI-native competitors outpaces cloud's contribution to growth.",
      catalysts: ["Cloud segment margin disclosure", "Search share commentary"],
      risks: ["Competitive pressure on search from AI-native products", "Regulatory actions in major markets"],
      thesis_change_conditions: ["Search revenue growth turning negative", "Cloud segment margin compression for two consecutive quarters"],
      generated_at: "2026-08-24T09:15:00Z", model_version: "claude-sonnet-4-6 / v1.0",
    },
  },
};

export const FIXTURE_CHANGES: Record<string, ChangeEventRow[]> = {
  NVDA: [{ id: "e1", event_type: "SCORE_CHANGE", metric_name: "fundamental_score", old_value: 89, new_value: 91, absolute_change: 2, percentage_change: 2.2, importance_score: 58, direction: "UP", detected_at: "2026-08-24T09:12:00Z" }],
  MSFT: [{ id: "e2", event_type: "SCORE_CHANGE", metric_name: "fundamental_score", old_value: 88, new_value: 88, absolute_change: 0, percentage_change: 0, importance_score: 8, direction: "FLAT", detected_at: "2026-08-23T09:00:00Z" }],
  SPOT: [{ id: "e3", event_type: "SCORE_CHANGE", metric_name: "fundamental_score", old_value: 78, new_value: 82, absolute_change: 4, percentage_change: 5.1, importance_score: 62, direction: "UP", detected_at: "2026-08-24T09:12:00Z" }],
  AAPL: [{ id: "e4", event_type: "SCORE_CHANGE", metric_name: "fundamental_score", old_value: 86, new_value: 85, absolute_change: -1, percentage_change: -1.2, importance_score: 31, direction: "DOWN", detected_at: "2026-08-22T09:00:00Z" }],
  GOOGL: [{ id: "e5", event_type: "SCORE_CHANGE", metric_name: "fundamental_score", old_value: 86, new_value: 89, absolute_change: 3, percentage_change: 3.5, importance_score: 55, direction: "UP", detected_at: "2026-08-24T09:12:00Z" }],
};

export const FIXTURE_ALERTS: AlertRow[] = [
  { id: "a1", company_id: "NVDA", alert_type: "SCORE_CHANGE", severity: "MEDIUM", title: "NVIDIA: fundamental score changed", summary: "Data center demand accelerated further and gross margin expanded beyond expectations.", score_before: 89, score_after: 91, is_read: false, created_at: "2026-08-24T09:12:00Z", companies: { name: "NVIDIA", ticker: "NVDA" } },
  { id: "a3", company_id: "SPOT", alert_type: "SCORE_CHANGE", severity: "HIGH", title: "Spotify: fundamental score changed", summary: "Operating margin improved materially as subscriber growth outpaced content costs for a second consecutive quarter.", score_before: 78, score_after: 82, is_read: false, created_at: "2026-08-24T09:12:00Z", companies: { name: "Spotify", ticker: "SPOT" } },
];
