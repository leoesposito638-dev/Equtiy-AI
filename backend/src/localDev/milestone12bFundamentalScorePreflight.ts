// ============================================================================
// Equity AI — Milestone 12B Phase 11: read-only preflight for
// calculateFundamentalScore() across the 30-company demo universe, using the
// EXISTING, unmodified orchestrator (scoringEngine.ts) — no formula change,
// no weight change, no confidence-semantics change, no minimum-coverage gate
// added. This script only calls it and reports what happens; it does NOT
// write (calculateFundamentalScore() itself calls repo.storeFundamentalScore,
// so this preflight uses a read-only-wrapping repo that intercepts that one
// write call and reports it instead of executing it).
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

  // Read-only wrapper: every method delegates to the real repo except
  // storeFundamentalScore, which is intercepted (never actually writes).
  const readOnlyRepo: ScoringRepo = {
    getActiveCategories: () => realRepo.getActiveCategories(),
    getActiveRules: (v) => realRepo.getActiveRules(v),
    getMetricInputs: (id, names) => realRepo.getMetricInputs(id, names),
    getBenchmarks: (sector, names) => realRepo.getBenchmarks(sector, names),
    getCompanySector: (id) => realRepo.getCompanySector(id),
    getPreviousFundamentalScore: (id) => realRepo.getPreviousFundamentalScore(id),
    storeFundamentalScore: async () => { /* intercepted — no write */ },
  };

  const { data: companies } = await db.from("companies").select("id, ticker, name").in("ticker", DEMO_TICKERS);
  if (companies!.length !== 30) throw new Error(`Expected 30 companies, found ${companies!.length}`);

  console.log(`Equity AI — Milestone 12B: Fundamental Score PREFLIGHT (read-only, 30-company demo universe)\n`);

  const results: Array<{ ticker: string; score: number; confidence: number; dataCoverage: number; categoryCount: number }> = [];

  for (const c of companies! as any[]) {
    const result = await calculateFundamentalScore(c.id, readOnlyRepo);
    const contributingCategories = result.categoryScores.filter((cs) => cs.confidence > 0);
    results.push({ ticker: c.ticker, score: result.score, confidence: result.confidence, dataCoverage: result.dataCoverage, categoryCount: contributingCategories.length });
    console.log(`${c.ticker.padEnd(6)} fundamental_score=${result.score.toString().padStart(6)} confidence=${result.confidence.toString().padStart(6)} dataCoverage=${result.dataCoverage.toString().padStart(6)} contributingCategories=${contributingCategories.length}/8 (${contributingCategories.map((cs) => cs.categoryKey).join(",")})`);
  }

  console.log(`\n${"=".repeat(100)}\nSUMMARY\n${"=".repeat(100)}`);
  const scores = results.map((r) => r.score);
  const confidences = results.map((r) => r.confidence);
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2 : sorted[(sorted.length - 1) / 2]!;
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const avgConfidence = confidences.reduce((s, v) => s + v, 0) / confidences.length;
  console.log(`Score range: [${Math.min(...scores)}, ${Math.max(...scores)}]. Median=${median.toFixed(2)}. Average=${avg.toFixed(2)}.`);
  console.log(`Confidence range: [${Math.min(...confidences)}, ${Math.max(...confidences)}]. Average confidence=${avgConfidence.toFixed(4)}.`);
  const catCounts = new Map<number, number>();
  for (const r of results) catCounts.set(r.categoryCount, (catCounts.get(r.categoryCount) ?? 0) + 1);
  console.log(`Distribution of contributing-category counts: ${[...catCounts.entries()].sort().map(([n, c]) => `${n} categories: ${c} companies`).join(", ")}`);

  console.log(`\nNo writes performed — read-only preflight only.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
