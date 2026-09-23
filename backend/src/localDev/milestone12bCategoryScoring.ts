// ============================================================================
// Equity AI — Milestone 12B Phase 9: real category scoring for PROFITABILITY,
// FINANCIAL_HEALTH, CAPITAL_ALLOCATION, COMPETITIVE_ADVANTAGE across the
// 30-company demo universe, using the EXISTING, unmodified generic
// scoreCategory() — same real call pattern as milestone10cGrowthScore.ts.
// GROWTH is untouched by this script (no read, no write).
//
// VALUATION, EARNINGS_MOMENTUM, MANAGEMENT are deliberately NOT scored here —
// their required real data does not exist (Milestone 12A/12B findings).
//
// Idempotency: only proceeds with --write if NONE of the 4 categories above
// already has any category_scores rows (checked per-category, not
// table-wide, since GROWTH already correctly has 30).
//
// Two modes:
//   npx ts-node --transpile-only src/localDev/milestone12bCategoryScoring.ts --preflight
//   npx ts-node --transpile-only src/localDev/milestone12bCategoryScoring.ts --write
// ============================================================================

import { buildSupabaseScoringRepo } from "../scoring/supabaseScoringRepo";
import { scoreCategory } from "../scoring/categoryScorers/scoreCategory";
import { SCORING_VERSION } from "../scoring/scoringEngine";
import { getDbClient } from "../db/client";

const NEW_CATEGORIES = ["PROFITABILITY", "FINANCIAL_HEALTH", "CAPITAL_ALLOCATION", "COMPETITIVE_ADVANTAGE"] as const;

const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

async function main() {
  const mode = process.argv.includes("--write") ? "write" : "preflight";
  console.log(`Equity AI — Milestone 12B Category Scoring ${mode.toUpperCase()} (30-company demo universe)\n`);

  const db = getDbClient();
  const repo = buildSupabaseScoringRepo();

  const { data: allCategories, error: catErr } = await db.from("score_categories").select("*").in("category_key", NEW_CATEGORIES);
  if (catErr) throw new Error(catErr.message);
  if (allCategories!.length !== NEW_CATEGORIES.length) throw new Error(`Expected ${NEW_CATEGORIES.length} categories, found ${allCategories!.length}.`);

  // Idempotency: per-category, not table-wide (GROWTH already has 30 rows).
  for (const cat of allCategories! as any[]) {
    const { count } = await db.from("category_scores").select("*", { count: "exact", head: true }).eq("category_id", cat.id);
    console.log(`Existing category_scores rows for ${cat.category_key}: ${count}`);
    if (mode === "write" && count !== 0) {
      throw new Error(`STOP: category_scores for ${cat.category_key} expected to be 0 before writing, found ${count}.`);
    }
  }

  const { data: allRules, error: ruleErr } = await db.from("score_rules").select("*").eq("version", SCORING_VERSION).eq("active", true);
  if (ruleErr) throw new Error(ruleErr.message);

  const { data: companies, error: cErr } = await db.from("companies").select("id, ticker, name, sector").in("ticker", DEMO_TICKERS);
  if (cErr) throw new Error(cErr.message);
  if (companies!.length !== 30) throw new Error(`Expected exactly 30 demo companies, found ${companies!.length}.`);

  const toWrite: Array<{ ticker: string; companyId: string; categoryId: string; categoryKey: string; score: number; confidence: number; coverage: number }> = [];

  for (const cat of allCategories! as any[]) {
    const categoryRules = (allRules as any[]).filter((r) => r.categoryId === cat.id || r.category_id === cat.id);
    console.log(`\n${"=".repeat(110)}\n${cat.category_key} (${categoryRules.length} active v${SCORING_VERSION} rules)\n${"=".repeat(110)}`);

    const rulesMapped = categoryRules.map((r: any) => ({
      id: r.id, categoryId: r.category_id, metricName: r.metric_name, ruleType: r.rule_type,
      weight: r.weight, direction: r.direction, minimumDataPoints: r.minimum_data_points,
      sectorSpecific: r.sector_specific, version: r.version, active: r.active,
    }));
    const metricNames = rulesMapped.map((r) => r.metricName);

    const scores: number[] = [];
    const confidences: number[] = [];
    let anyScored = 0;

    for (const c of companies! as any[]) {
      const metrics = await repo.getMetricInputs(c.id, metricNames);
      const benchmarks = await repo.getBenchmarks(c.sector, metricNames);

      const result = scoreCategory({
        companyId: c.id,
        categoryId: cat.id,
        categoryKey: cat.category_key,
        rules: rulesMapped,
        metrics,
        benchmarks,
        calculationVersion: SCORING_VERSION,
      });

      scores.push(result.score);
      confidences.push(result.confidence);
      if (result.coverage > 0) anyScored++;

      console.log(`   ${c.ticker.padEnd(6)} score=${result.score.toString().padStart(6)} confidence=${result.confidence} coverage=${result.coverage}`);

      if (result.coverage > 0) {
        toWrite.push({ ticker: c.ticker, companyId: c.id, categoryId: cat.id, categoryKey: cat.category_key, score: result.score, confidence: result.confidence, coverage: result.coverage });
      }
    }

    const sorted = [...scores].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2 : sorted[(sorted.length - 1) / 2]!;
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    console.log(`\n   ${cat.category_key}: ${anyScored}/30 companies have coverage>0. Score range [${Math.min(...scores)}, ${Math.max(...scores)}]. Median=${median.toFixed(2)}. Average=${avg.toFixed(2)}.`);
    console.log(`   Confidence range [${Math.min(...confidences)}, ${Math.max(...confidences)}].`);
  }

  // Sanity checks across everything computed.
  console.log(`\n${"=".repeat(110)}\nSANITY CHECKS\n${"=".repeat(110)}`);
  const badRange = toWrite.filter((r) => r.score < 0 || r.score > 100 || !Number.isFinite(r.score));
  const badConfidence = toWrite.filter((r) => r.confidence < 0 || r.confidence > 1 || !Number.isFinite(r.confidence));
  console.log(`Rows with score out of [0,100]: ${badRange.length} ${badRange.length === 0 ? "✅" : "❌"}`);
  console.log(`Rows with confidence out of [0,1]: ${badConfidence.length} ${badConfidence.length === 0 ? "✅" : "❌"}`);
  const dupCheck = new Map<string, number>();
  for (const r of toWrite) {
    const key = `${r.companyId}|${r.categoryId}`;
    dupCheck.set(key, (dupCheck.get(key) ?? 0) + 1);
  }
  const dupes = [...dupCheck.entries()].filter(([, n]) => n > 1);
  console.log(`Duplicate (company, category) pairs planned: ${dupes.length} ${dupes.length === 0 ? "✅" : "❌"}`);

  if (badRange.length > 0 || badConfidence.length > 0 || dupes.length > 0) {
    console.log(`\n❌ STOP CONDITION TRIGGERED — not proceeding to write.`);
    process.exit(1);
  }

  console.log(`\nTotal rows to write (coverage > 0 only): ${toWrite.length}`);

  if (mode === "write") {
    console.log(`\nWriting ${toWrite.length} category_scores rows...`);
    for (const r of toWrite) {
      const { error: insErr } = await db.from("category_scores").insert({
        company_id: r.companyId,
        category_id: r.categoryId,
        score: r.score,
        confidence: r.confidence,
        coverage: r.coverage,
        calculation_version: SCORING_VERSION,
      });
      if (insErr) throw new Error(`category_scores insert failed for ${r.ticker}/${r.categoryKey}: ${insErr.message}`);
    }
    console.log(`Done writing.`);
  } else {
    console.log(`\nPREFLIGHT ONLY — no rows written. Re-run with --write to actually populate category_scores.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
