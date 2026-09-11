// ============================================================================
// Equity AI — Milestone 13C Phase H: real write. Runs the unmodified
// calculateFundamentalScore() through the real, Milestone-12C-corrected
// storeFundamentalScore() for all 30 demo companies under v1.1 rules.
// ============================================================================

import { calculateFundamentalScore } from "../scoring/scoringEngine";
import { buildSupabaseScoringRepo } from "../scoring/supabaseScoringRepo";
import { getDbClient } from "../db/client";

const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

async function main() {
  const db = getDbClient();
  const repo = buildSupabaseScoringRepo();
  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  if (companies!.length !== 30) throw new Error(`Expected 30, found ${companies!.length}`);

  console.log(`Equity AI — Milestone 13C: real write (30-company demo universe, v1.1)\n`);
  const results: Array<{ ticker: string; score: number; confidence: number; dataCoverage: number; contributing: string[] }> = [];

  for (const c of companies as any[]) {
    const result = await calculateFundamentalScore(c.id, repo);
    const contributing = result.categoryScores.filter((cs) => cs.coverage > 0).map((cs) => cs.categoryKey);
    results.push({ ticker: c.ticker, score: result.score, confidence: result.confidence, dataCoverage: result.dataCoverage, contributing });
    console.log(`${c.ticker.padEnd(6)} score=${result.score.toString().padStart(6)} confidence=${result.confidence} coverage=${result.dataCoverage} categories=${contributing.length}/8 (${contributing.join(",")})`);
  }

  const scores = results.map((r) => r.score);
  const confidences = results.map((r) => r.confidence);
  console.log(`\nScore range [${Math.min(...scores)}, ${Math.max(...scores)}]. Confidence range [${Math.min(...confidences)}, ${Math.max(...confidences)}].`);
  console.log(`\nDone.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
