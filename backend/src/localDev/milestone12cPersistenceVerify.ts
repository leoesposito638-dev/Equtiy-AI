// ============================================================================
// Equity AI — Milestone 12C Phase 8: real DB persistence verification.
//
// 1. Runs calculateFundamentalScore() for NVDA (via the real, now-fixed
//    supabaseScoringRepo.storeFundamentalScore) TWICE in a row and confirms
//    category_scores/fundamental_scores row counts do NOT grow on the
//    second run (the exact defect this milestone fixes).
// 2. Re-runs it for the full 30-company demo universe and confirms the
//    total row counts stay at the pre-run baseline (104 category_scores,
//    30 fundamental_scores) rather than growing.
// ============================================================================

import { calculateFundamentalScore } from "../scoring/scoringEngine";
import { buildSupabaseScoringRepo } from "../scoring/supabaseScoringRepo";
import { getDbClient } from "../db/client";

const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

async function counts(db: ReturnType<typeof getDbClient>) {
  const { count: cat } = await db.from("category_scores").select("*", { count: "exact", head: true });
  const { count: fund } = await db.from("fundamental_scores").select("*", { count: "exact", head: true });
  return { cat: cat ?? 0, fund: fund ?? 0 };
}

async function main() {
  const db = getDbClient();
  const repo = buildSupabaseScoringRepo();

  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  if (companies!.length !== 30) throw new Error(`Expected 30 companies, found ${companies!.length}`);
  const nvda = (companies as any[]).find((c) => c.ticker === "NVDA");
  if (!nvda) throw new Error("NVDA not found");

  console.log(`${"=".repeat(90)}\nSTEP 1: NVDA run-twice idempotency check\n${"=".repeat(90)}`);
  const before = await counts(db);
  console.log(`Before: category_scores=${before.cat}, fundamental_scores=${before.fund}`);

  const run1 = await calculateFundamentalScore(nvda.id, repo);
  const afterRun1 = await counts(db);
  console.log(`After NVDA run 1: category_scores=${afterRun1.cat}, fundamental_scores=${afterRun1.fund} (score=${run1.score}, confidence=${run1.confidence})`);

  const run2 = await calculateFundamentalScore(nvda.id, repo);
  const afterRun2 = await counts(db);
  console.log(`After NVDA run 2: category_scores=${afterRun2.cat}, fundamental_scores=${afterRun2.fund} (score=${run2.score}, confidence=${run2.confidence})`);

  const nvdaIdempotent = afterRun1.cat === afterRun2.cat && afterRun1.fund === afterRun2.fund;
  console.log(`NVDA run 1 -> run 2 row-count growth: category_scores +${afterRun2.cat - afterRun1.cat}, fundamental_scores +${afterRun2.fund - afterRun1.fund} ${nvdaIdempotent ? "✅ idempotent" : "❌ GREW"}`);
  const nvdaScoreStable = run1.score === run2.score && run1.confidence === run2.confidence;
  console.log(`NVDA score/confidence identical across both runs: ${nvdaScoreStable ? "✅" : "❌"} (run1=${run1.score}/${run1.confidence}, run2=${run2.score}/${run2.confidence})`);

  console.log(`\n${"=".repeat(90)}\nSTEP 2: Full 30-company re-run idempotency check\n${"=".repeat(90)}`);
  const beforeFull = await counts(db);
  console.log(`Before full run: category_scores=${beforeFull.cat}, fundamental_scores=${beforeFull.fund}`);

  for (const c of companies! as any[]) {
    await calculateFundamentalScore(c.id, repo);
  }

  const afterFull = await counts(db);
  console.log(`After full 30-company run: category_scores=${afterFull.cat}, fundamental_scores=${afterFull.fund}`);
  const fullIdempotent = beforeFull.cat === afterFull.cat && beforeFull.fund === afterFull.fund;
  console.log(`Row-count growth across 30-company re-run: category_scores +${afterFull.cat - beforeFull.cat}, fundamental_scores +${afterFull.fund - beforeFull.fund} ${fullIdempotent ? "✅ idempotent" : "❌ GREW"}`);

  console.log(`\n${"=".repeat(90)}\nSTEP 3: Duplicate / zero-coverage re-check after re-run\n${"=".repeat(90)}`);
  const { data: catRows } = await db.from("category_scores").select("company_id, category_id, score, confidence, coverage");
  const dupMap = new Map<string, number>();
  for (const r of catRows as any[]) {
    const key = `${r.company_id}|${r.category_id}`;
    dupMap.set(key, (dupMap.get(key) ?? 0) + 1);
  }
  const dupes = [...dupMap.entries()].filter(([, n]) => n > 1);
  console.log(`Duplicate (company_id, category_id) pairs: ${dupes.length} ${dupes.length === 0 ? "✅" : "❌"}`);
  const zeroCat = (catRows as any[]).filter((r) => r.score === 0 && r.confidence === 0);
  console.log(`Fabricated-placeholder rows (score=0 AND confidence=0): ${zeroCat.length} ${zeroCat.length === 0 ? "✅" : "❌"}`);

  const { data: fundRows } = await db.from("fundamental_scores").select("company_id");
  const fundDupMap = new Map<string, number>();
  for (const r of fundRows as any[]) fundDupMap.set(r.company_id, (fundDupMap.get(r.company_id) ?? 0) + 1);
  const fundDupes = [...fundDupMap.entries()].filter(([, n]) => n > 1);
  console.log(`Duplicate fundamental_scores company_id rows: ${fundDupes.length} ${fundDupes.length === 0 ? "✅" : "❌"}`);

  console.log(`\nDone.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
