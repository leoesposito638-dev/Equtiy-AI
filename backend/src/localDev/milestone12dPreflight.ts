// ============================================================================
// Equity AI — Milestone 12D preflight (read-only). Compares PROFITABILITY
// category scoring BEFORE (currently stored in category_scores, computed
// under 12B/12C) vs AFTER (recomputed with the new margin_trend alias wired
// in getMetricInputs) for all 30 demo companies, using a read-only-wrapping
// repo that intercepts storeFundamentalScore so nothing is written. Also
// reports the other 3 in-scope categories (FINANCIAL_HEALTH,
// CAPITAL_ALLOCATION, COMPETITIVE_ADVANTAGE) to confirm they are UNCHANGED,
// since this milestone's only code change affects margin_trend/
// gross_margin_stability/roic_persistence metric resolution.
// ============================================================================

import { calculateFundamentalScore, type ScoringRepo } from "../scoring/scoringEngine";
import { buildSupabaseScoringRepo } from "../scoring/supabaseScoringRepo";
import { getDbClient } from "../db/client";

const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

async function main() {
  const db = getDbClient();
  const realRepo = buildSupabaseScoringRepo();
  const readOnlyRepo: ScoringRepo = {
    getActiveCategories: () => realRepo.getActiveCategories(),
    getActiveRules: (v) => realRepo.getActiveRules(v),
    getMetricInputs: (id, names) => realRepo.getMetricInputs(id, names),
    getBenchmarks: (sector, names) => realRepo.getBenchmarks(sector, names),
    getCompanySector: (id) => realRepo.getCompanySector(id),
    getPreviousFundamentalScore: (id) => realRepo.getPreviousFundamentalScore(id),
    storeFundamentalScore: async () => { /* intercepted — no write */ },
  };

  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  if (companies!.length !== 30) throw new Error(`Expected 30 companies, found ${companies!.length}`);

  const { data: cats } = await db.from("score_categories").select("id, category_key");
  const catKeyById = new Map((cats as any[]).map((c) => [c.id, c.category_key]));

  const { data: existingScores } = await db
    .from("category_scores")
    .select("company_id, category_id, score, confidence, coverage")
    .in("company_id", (companies as any[]).map((c) => c.id));
  const existingByCompanyCategory = new Map<string, any>();
  for (const r of existingScores as any[]) {
    existingByCompanyCategory.set(`${r.company_id}|${catKeyById.get(r.category_id)}`, r);
  }

  console.log(`Equity AI — Milestone 12D preflight (read-only, 30-company demo universe)\n`);
  console.log(`${"Ticker".padEnd(6)} ${"Category".padEnd(22)} ${"Before(score/conf/cov)".padEnd(26)} ${"After(score/conf/cov)".padEnd(26)} Delta`);

  const IN_SCOPE = ["PROFITABILITY", "FINANCIAL_HEALTH", "CAPITAL_ALLOCATION", "COMPETITIVE_ADVANTAGE"];
  let unexpectedChanges = 0;
  let marginTrendGains = 0;

  for (const c of companies as any[]) {
    const result = await calculateFundamentalScore(c.id, readOnlyRepo);
    for (const cs of result.categoryScores) {
      if (!IN_SCOPE.includes(cs.categoryKey)) continue;
      const before = existingByCompanyCategory.get(`${c.id}|${cs.categoryKey}`);
      const beforeStr = before ? `${before.score}/${before.confidence}/${before.coverage}` : "none";
      const afterStr = `${cs.score}/${cs.confidence}/${cs.coverage}`;
      const changed = before ? (before.score !== cs.score || before.confidence !== cs.confidence || before.coverage !== cs.coverage) : cs.coverage > 0;
      if (changed) {
        console.log(`${c.ticker.padEnd(6)} ${cs.categoryKey.padEnd(22)} ${beforeStr.padEnd(26)} ${afterStr.padEnd(26)} ${cs.categoryKey === "PROFITABILITY" ? "expected (margin_trend)" : "*** UNEXPECTED ***"}`);
        if (cs.categoryKey === "PROFITABILITY") marginTrendGains++;
        else unexpectedChanges++;
      }
    }
  }

  console.log(`\nPROFITABILITY companies with a changed score/confidence/coverage (expected — margin_trend now contributing): ${marginTrendGains}/30`);
  console.log(`Unexpected changes in FINANCIAL_HEALTH/CAPITAL_ALLOCATION/COMPETITIVE_ADVANTAGE: ${unexpectedChanges} ${unexpectedChanges === 0 ? "✅ none" : "❌"}`);
  console.log(`\nNo writes performed — read-only preflight only.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
