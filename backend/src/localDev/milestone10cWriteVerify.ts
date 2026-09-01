// ============================================================================
// Equity AI — Milestone 10C: read-only post-write verification of the 30
// category_scores rows written for the GROWTH category. No writes.
// ============================================================================

import { getDbClient } from "../db/client";

const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

async function main() {
  const db = getDbClient();

  const { data: rows, error } = await db.from("category_scores").select("*");
  if (error) throw new Error(error.message);
  console.log(`Total category_scores rows: ${rows!.length} (expected 30)`);

  const { data: categories, error: catErr } = await db.from("score_categories").select("id, category_key").eq("category_key", "GROWTH");
  if (catErr) throw new Error(catErr.message);
  const growthCategoryId = (categories![0] as any).id;
  const nonGrowth = rows!.filter((r: any) => r.category_id !== growthCategoryId);
  console.log(`Rows with category_id != GROWTH: ${nonGrowth.length} ${nonGrowth.length === 0 ? "✅" : "❌"}`);

  const { data: companies, error: cErr } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  if (cErr) throw new Error(cErr.message);
  if (companies!.length !== 30) throw new Error(`Expected 30 demo companies, found ${companies!.length}`);
  const demoCompanyIds = new Set(companies!.map((c: any) => c.id));

  const companyIdCounts = new Map<string, number>();
  for (const r of rows! as any[]) {
    companyIdCounts.set(r.company_id, (companyIdCounts.get(r.company_id) ?? 0) + 1);
  }
  const dupes = [...companyIdCounts.entries()].filter(([, n]) => n > 1);
  console.log(`Companies with more than 1 category_scores row: ${dupes.length} ${dupes.length === 0 ? "✅" : "❌ " + JSON.stringify(dupes)}`);

  const scoredCompanyIds = new Set(rows!.map((r: any) => r.company_id));
  const missing = [...demoCompanyIds].filter((id) => !scoredCompanyIds.has(id));
  const extra = [...scoredCompanyIds].filter((id) => !demoCompanyIds.has(id));
  console.log(`Demo companies missing a score: ${missing.length} ${missing.length === 0 ? "✅" : "❌ " + JSON.stringify(missing)}`);
  console.log(`Scored companies outside the 30-company demo universe: ${extra.length} ${extra.length === 0 ? "✅" : "❌ " + JSON.stringify(extra)}`);

  const badScore = rows!.filter((r: any) => r.score < 0 || r.score > 100 || r.score === null);
  const badConfidence = rows!.filter((r: any) => r.confidence < 0 || r.confidence > 1 || r.confidence === null);
  const badCoverage = rows!.filter((r: any) => r.coverage < 0 || r.coverage > 1 || r.coverage === null);
  console.log(`Rows with score out of [0,100] or null: ${badScore.length} ${badScore.length === 0 ? "✅" : "❌"}`);
  console.log(`Rows with confidence out of [0,1] or null: ${badConfidence.length} ${badConfidence.length === 0 ? "✅" : "❌"}`);
  console.log(`Rows with coverage out of [0,1] or null: ${badCoverage.length} ${badCoverage.length === 0 ? "✅" : "❌"}`);

  const versions = new Set(rows!.map((r: any) => r.calculation_version));
  console.log(`Distinct calculation_version values: ${[...versions].join(", ")}`);

  console.log(`\nAll checks read-only. No writes performed by this script.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
