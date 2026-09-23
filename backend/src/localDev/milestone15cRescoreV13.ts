// ============================================================================
// Equity AI — Milestone 15C Part 3: real write. Runs the unmodified
// calculateFundamentalScore() through the real storeFundamentalScore() for
// all 30 demo companies under v1.3 rules (SCORING_VERSION, bumped this
// milestone). Reports v1.1-vs-v1.3 (per the ticket, not v1.2-vs-v1.3) —
// score/confidence/coverage per company, categories that changed — plus
// NVDA's full category-by-category breakdown. Never touches v1.0/v1.1/
// v1.2 stored rows: storeFundamentalScore() only ever reads/writes rows
// matching the result's OWN calculation_version ('v1.3' here).
// ============================================================================

import { calculateFundamentalScore } from "../scoring/scoringEngine";
import { buildSupabaseScoringRepo } from "../scoring/supabaseScoringRepo";
import { getDbClient } from "../db/client";
import { DEMO_TICKERS } from "../config/demoUniverse";

async function main() {
  const db = getDbClient();
  const repo = buildSupabaseScoringRepo();
  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  if (companies!.length !== 30) throw new Error(`Expected 30, found ${companies!.length}`);

  console.log(`Equity AI — Milestone 15C: real write (30-company demo universe, v1.3)\n`);

  type Row = { ticker: string; companyId: string; score: number; confidence: number; coverage: number; categories: Map<string, { score: number; confidence: number; coverage: number }> };
  const v13Results: Row[] = [];

  for (const c of (companies as any[]).sort((a, b) => a.ticker.localeCompare(b.ticker))) {
    const result = await calculateFundamentalScore(c.id, repo);
    const categories = new Map(result.categoryScores.map((cs) => [cs.categoryKey, { score: cs.score, confidence: cs.confidence, coverage: cs.coverage }]));
    v13Results.push({ ticker: c.ticker, companyId: c.id, score: result.score, confidence: result.confidence, coverage: result.dataCoverage, categories });
  }

  const { data: v11Fund } = await db.from("fundamental_scores").select("company_id, score, confidence, data_coverage, companies(ticker)").eq("calculation_version", "v1.1");
  const v11ByTicker = new Map((v11Fund as any[]).map((r) => [r.companies.ticker, r]));

  const { data: v11Cat } = await db.from("category_scores").select("company_id, score, confidence, coverage, score_categories(category_key), companies(ticker)").eq("calculation_version", "v1.1");
  const v11CatByTickerCategory = new Map<string, { score: number; confidence: number; coverage: number }>();
  for (const r of v11Cat as any[]) {
    v11CatByTickerCategory.set(`${r.companies.ticker}|${r.score_categories.category_key}`, { score: r.score, confidence: r.confidence, coverage: r.coverage });
  }

  console.log("Ticker | v1.1 score/conf/cov          | v1.3 score/conf/cov          | Categories changed (coverage delta)");
  console.log("-".repeat(120));
  for (const r of v13Results) {
    const v11 = v11ByTicker.get(r.ticker);
    const v11Str = v11 ? `${v11.score}/${v11.confidence}/${v11.data_coverage}` : "(none)";
    const v13Str = `${r.score}/${r.confidence}/${r.coverage}`;
    const changedCats: string[] = [];
    for (const [catKey, v13cat] of r.categories.entries()) {
      const v11cat = v11CatByTickerCategory.get(`${r.ticker}|${catKey}`);
      const v11cov = v11cat?.coverage ?? 0;
      if (Math.abs(v11cov - v13cat.coverage) > 0.001) {
        changedCats.push(`${catKey}(${v11cov.toFixed(2)}->${v13cat.coverage.toFixed(2)})`);
      }
    }
    console.log(`${r.ticker.padEnd(6)} | ${v11Str.padEnd(28)} | ${v13Str.padEnd(28)} | ${changedCats.join(", ") || "(none)"}`);
  }

  const scores = v13Results.map((r) => r.score);
  const confidences = v13Results.map((r) => r.confidence);
  const coverages = v13Results.map((r) => r.coverage);
  console.log(`\nv1.3 score range [${Math.min(...scores)}, ${Math.max(...scores)}]. Confidence range [${Math.min(...confidences).toFixed(3)}, ${Math.max(...confidences).toFixed(3)}]. Coverage range [${Math.min(...coverages).toFixed(3)}, ${Math.max(...coverages).toFixed(3)}].`);

  // NVDA full category breakdown, v1.1 vs v1.3.
  const nvda = v13Results.find((r) => r.ticker === "NVDA")!;
  console.log(`\n${"=".repeat(100)}\nNVDA — full category breakdown, v1.1 vs v1.3\n${"=".repeat(100)}`);
  console.log("Category                | v1.1 score/conf/cov         | v1.3 score/conf/cov");
  console.log("-".repeat(100));
  for (const [catKey, v13cat] of nvda.categories.entries()) {
    const v11cat = v11CatByTickerCategory.get(`NVDA|${catKey}`);
    const v11Str = v11cat ? `${v11cat.score}/${v11cat.confidence}/${v11cat.coverage}` : "(none)";
    const v13Str = `${v13cat.score}/${v13cat.confidence}/${v13cat.coverage}`;
    console.log(`${catKey.padEnd(24)} | ${v11Str.padEnd(28)} | ${v13Str}`);
  }
  const nvda11 = v11ByTicker.get("NVDA");
  console.log(`\nNVDA overall: v1.1=${nvda11.score}/${nvda11.confidence}/${nvda11.data_coverage}  v1.3=${nvda.score}/${nvda.confidence}/${nvda.coverage}`);

  const { count: v10Count } = await db.from("fundamental_scores").select("*", { count: "exact", head: true }).eq("calculation_version", "v1.0");
  const { count: v11Count } = await db.from("fundamental_scores").select("*", { count: "exact", head: true }).eq("calculation_version", "v1.1");
  const { count: v12Count } = await db.from("fundamental_scores").select("*", { count: "exact", head: true }).eq("calculation_version", "v1.2");
  const { count: v13Count } = await db.from("fundamental_scores").select("*", { count: "exact", head: true }).eq("calculation_version", "v1.3");
  console.log(`\nfundamental_scores row counts — v1.0=${v10Count} (untouched), v1.1=${v11Count} (untouched), v1.2=${v12Count} (untouched), v1.3=${v13Count} (new).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
