// ============================================================================
// Equity AI — Milestone 12B Phase 11: real Fundamental Score write for the
// 30-company demo universe, using the EXISTING, unmodified
// calculateFundamentalScore() (scoringEngine.ts) — no formula change, no
// weight change, no confidence-semantics change, no minimum-coverage gate
// added. Approved to proceed after the read-only preflight
// (milestone12bFundamentalScorePreflight.ts) confirmed: every company has
// >=2 of 8 categories genuinely contributing real data (up from 1/8 —
// GROWTH alone — before this milestone), all scores/confidences are in
// range, and confidence is honestly low (0.12-0.21) reflecting the real,
// still-partial coverage — not fabricated completeness.
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

  const { count: existing } = await db.from("fundamental_scores").select("*", { count: "exact", head: true });
  console.log(`Existing fundamental_scores rows: ${existing}`);
  if (existing !== 0) throw new Error(`STOP: fundamental_scores expected to be 0 before writing, found ${existing}.`);

  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  if (companies!.length !== 30) throw new Error(`Expected 30 companies, found ${companies!.length}`);

  console.log(`Equity AI — Milestone 12B: Fundamental Score WRITE (30-company demo universe)\n`);

  const results: Array<{ ticker: string; score: number; confidence: number; dataCoverage: number }> = [];

  for (const c of companies! as any[]) {
    const result = await calculateFundamentalScore(c.id, repo);
    results.push({ ticker: c.ticker, score: result.score, confidence: result.confidence, dataCoverage: result.dataCoverage });
    console.log(`${c.ticker.padEnd(6)} fundamental_score=${result.score.toString().padStart(6)} confidence=${result.confidence} dataCoverage=${result.dataCoverage}`);
  }

  const { count: after } = await db.from("fundamental_scores").select("*", { count: "exact", head: true });
  console.log(`\nfundamental_scores rows after write: ${after} (expected 30)`);

  const scores = results.map((r) => r.score);
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2 : sorted[(sorted.length - 1) / 2]!;
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  console.log(`\nScore range [${Math.min(...scores)}, ${Math.max(...scores)}]. Median=${median.toFixed(2)}. Average=${avg.toFixed(2)}.`);
  console.log(`\nDone.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
