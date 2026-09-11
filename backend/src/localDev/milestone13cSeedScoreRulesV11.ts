// ============================================================================
// Equity AI — Milestone 13C: apply schema/007_scoring_config_v1_1.sql against
// the live database via the Supabase client (this project's DB writes in
// this environment go through the JS client, not psql). Mirrors that SQL
// file's content exactly — see it for the full rationale. Idempotent: if
// v1.1 rows already exist for a category, this script skips re-inserting
// them rather than duplicating.
// ============================================================================

import { getDbClient } from "../db/client";

interface RuleSpec {
  metric_name: string;
  rule_type: string;
  weight: number;
  direction: string;
  minimum_data_points: number;
  sector_specific: boolean;
}

const V1_1_RULES: Record<string, RuleSpec[]> = {
  GROWTH: [
    { metric_name: "revenue_growth_yoy", rule_type: "PERCENTILE", weight: 0.30, direction: "HIGHER_IS_BETTER", minimum_data_points: 2, sector_specific: true },
    { metric_name: "revenue_cagr_3y", rule_type: "PERCENTILE", weight: 0.20, direction: "HIGHER_IS_BETTER", minimum_data_points: 4, sector_specific: true },
    { metric_name: "eps_growth_yoy", rule_type: "PERCENTILE", weight: 0.20, direction: "HIGHER_IS_BETTER", minimum_data_points: 2, sector_specific: true },
    { metric_name: "eps_cagr", rule_type: "PERCENTILE", weight: 0.15, direction: "HIGHER_IS_BETTER", minimum_data_points: 4, sector_specific: true },
    { metric_name: "growth_acceleration", rule_type: "TREND", weight: 0.15, direction: "HIGHER_IS_BETTER", minimum_data_points: 3, sector_specific: true },
  ],
  PROFITABILITY: [
    { metric_name: "gross_margin", rule_type: "PERCENTILE", weight: 0.20, direction: "HIGHER_IS_BETTER", minimum_data_points: 2, sector_specific: true },
    { metric_name: "operating_margin", rule_type: "PERCENTILE", weight: 0.25, direction: "HIGHER_IS_BETTER", minimum_data_points: 2, sector_specific: true },
    { metric_name: "net_margin", rule_type: "PERCENTILE", weight: 0.15, direction: "HIGHER_IS_BETTER", minimum_data_points: 2, sector_specific: true },
    { metric_name: "roic", rule_type: "PERCENTILE", weight: 0.20, direction: "HIGHER_IS_BETTER", minimum_data_points: 2, sector_specific: true },
    { metric_name: "roe", rule_type: "PERCENTILE", weight: 0.10, direction: "HIGHER_IS_BETTER", minimum_data_points: 2, sector_specific: true },
    { metric_name: "margin_trend", rule_type: "TREND", weight: 0.10, direction: "HIGHER_IS_BETTER", minimum_data_points: 3, sector_specific: true },
  ],
  FINANCIAL_HEALTH: [
    { metric_name: "net_debt_to_ebitda", rule_type: "PERCENTILE", weight: 0.25, direction: "LOWER_IS_BETTER", minimum_data_points: 2, sector_specific: true },
    { metric_name: "debt_to_equity", rule_type: "PERCENTILE", weight: 0.15, direction: "LOWER_IS_BETTER", minimum_data_points: 2, sector_specific: true },
    { metric_name: "current_ratio", rule_type: "PERCENTILE", weight: 0.15, direction: "OPTIMAL_RANGE", minimum_data_points: 2, sector_specific: true },
    { metric_name: "interest_coverage", rule_type: "PERCENTILE", weight: 0.20, direction: "HIGHER_IS_BETTER", minimum_data_points: 2, sector_specific: true },
    { metric_name: "fcf_margin", rule_type: "PERCENTILE", weight: 0.15, direction: "HIGHER_IS_BETTER", minimum_data_points: 2, sector_specific: true },
    { metric_name: "debt_trend", rule_type: "TREND", weight: 0.10, direction: "LOWER_IS_BETTER", minimum_data_points: 3, sector_specific: true },
  ],
  VALUATION: [
    { metric_name: "pe", rule_type: "PERCENTILE", weight: 0.20, direction: "LOWER_IS_BETTER", minimum_data_points: 1, sector_specific: true },
    { metric_name: "forward_pe", rule_type: "PERCENTILE", weight: 0.15, direction: "LOWER_IS_BETTER", minimum_data_points: 1, sector_specific: true },
    { metric_name: "ev_ebitda", rule_type: "PERCENTILE", weight: 0.20, direction: "LOWER_IS_BETTER", minimum_data_points: 1, sector_specific: true },
    { metric_name: "ev_sales", rule_type: "PERCENTILE", weight: 0.15, direction: "LOWER_IS_BETTER", minimum_data_points: 1, sector_specific: true },
    { metric_name: "price_to_fcf", rule_type: "PERCENTILE", weight: 0.15, direction: "LOWER_IS_BETTER", minimum_data_points: 1, sector_specific: true },
    { metric_name: "fcf_yield", rule_type: "PERCENTILE", weight: 0.15, direction: "HIGHER_IS_BETTER", minimum_data_points: 1, sector_specific: true },
  ],
  CAPITAL_ALLOCATION: [
    { metric_name: "roic", rule_type: "PERCENTILE", weight: 0.35, direction: "HIGHER_IS_BETTER", minimum_data_points: 2, sector_specific: true },
    { metric_name: "share_count_trend", rule_type: "TREND", weight: 0.25, direction: "LOWER_IS_BETTER", minimum_data_points: 3, sector_specific: true },
    { metric_name: "net_debt_trend", rule_type: "TREND", weight: 0.20, direction: "LOWER_IS_BETTER", minimum_data_points: 3, sector_specific: true },
    { metric_name: "fcf_reinvestment_rate", rule_type: "RATIO", weight: 0.20, direction: "OPTIMAL_RANGE", minimum_data_points: 2, sector_specific: true },
  ],
  COMPETITIVE_ADVANTAGE: [
    // The only substantive change in this version: minimum_data_points 5 -> 4.
    { metric_name: "gross_margin_stability", rule_type: "TREND", weight: 0.35, direction: "HIGHER_IS_BETTER", minimum_data_points: 4, sector_specific: true },
    { metric_name: "roic_persistence", rule_type: "TREND", weight: 0.35, direction: "HIGHER_IS_BETTER", minimum_data_points: 4, sector_specific: true },
    { metric_name: "rd_intensity", rule_type: "RATIO", weight: 0.30, direction: "OPTIMAL_RANGE", minimum_data_points: 2, sector_specific: true },
  ],
  MANAGEMENT: [
    { metric_name: "guidance_credibility", rule_type: "COMPOSITE", weight: 0.50, direction: "HIGHER_IS_BETTER", minimum_data_points: 4, sector_specific: false },
    { metric_name: "share_dilution_trend", rule_type: "TREND", weight: 0.30, direction: "LOWER_IS_BETTER", minimum_data_points: 3, sector_specific: false },
    { metric_name: "insider_ownership", rule_type: "PERCENTILE", weight: 0.20, direction: "HIGHER_IS_BETTER", minimum_data_points: 1, sector_specific: false },
  ],
  EARNINGS_MOMENTUM: [
    { metric_name: "eps_surprise_percent", rule_type: "LINEAR", weight: 0.30, direction: "HIGHER_IS_BETTER", minimum_data_points: 1, sector_specific: false },
    { metric_name: "revenue_surprise_percent", rule_type: "LINEAR", weight: 0.25, direction: "HIGHER_IS_BETTER", minimum_data_points: 1, sector_specific: false },
    { metric_name: "estimate_revision_trend", rule_type: "TREND", weight: 0.25, direction: "HIGHER_IS_BETTER", minimum_data_points: 2, sector_specific: false },
    { metric_name: "guidance_direction_score", rule_type: "COMPOSITE", weight: 0.20, direction: "HIGHER_IS_BETTER", minimum_data_points: 1, sector_specific: false },
  ],
};

async function main() {
  const db = getDbClient();

  const { data: categories, error: catError } = await db.from("score_categories").select("id, category_key");
  if (catError) throw new Error(`score_categories query failed: ${catError.message}`);
  const catIdByKey = new Map((categories as any[]).map((c) => [c.category_key, c.id]));

  const { data: existingV11 } = await db.from("score_rules").select("id").eq("version", "v1.1").limit(1);
  if (existingV11 && existingV11.length > 0) {
    console.log("v1.1 score_rules rows already exist — skipping insert (idempotent no-op).");
  } else {
    let totalInserted = 0;
    for (const [categoryKey, rules] of Object.entries(V1_1_RULES)) {
      const categoryId = catIdByKey.get(categoryKey);
      if (!categoryId) throw new Error(`score_categories row not found for ${categoryKey}`);
      const rows = rules.map((r) => ({ ...r, category_id: categoryId, version: "v1.1", active: true }));
      const { error } = await db.from("score_rules").insert(rows);
      if (error) throw new Error(`score_rules insert failed for ${categoryKey}: ${error.message}`);
      totalInserted += rows.length;
      console.log(`${categoryKey}: inserted ${rows.length} v1.1 rule(s).`);
    }
    console.log(`\nTotal v1.1 rules inserted: ${totalInserted}`);
  }

  const { error: updateError } = await db.from("score_rules").update({ active: false }).eq("version", "v1.0").eq("active", true);
  if (updateError) throw new Error(`v1.0 deactivation failed: ${updateError.message}`);

  const { count: v11Count } = await db.from("score_rules").select("*", { count: "exact", head: true }).eq("version", "v1.1");
  const { count: v10ActiveCount } = await db.from("score_rules").select("*", { count: "exact", head: true }).eq("version", "v1.0").eq("active", true);
  console.log(`\nFinal state: v1.1 rows=${v11Count}, v1.0 rows still active=${v10ActiveCount} (expected 0).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
