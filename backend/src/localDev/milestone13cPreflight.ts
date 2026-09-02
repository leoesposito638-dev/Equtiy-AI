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
    storeFundamentalScore: async () => { /* intercepted */ },
  };

  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  if (companies!.length !== 30) throw new Error(`Expected 30, found ${companies!.length}`);

  for (const c of companies as any[]) {
    const result = await calculateFundamentalScore(c.id, readOnlyRepo);
    const contributing = result.categoryScores.filter((cs) => cs.coverage > 0);
    console.log(`${c.ticker.padEnd(6)} score=${result.score} conf=${result.confidence} coverage=${result.dataCoverage} calcVersion=${result.calculationVersion} categories=${contributing.length}/8 (${contributing.map((cs) => `${cs.categoryKey}:${cs.score}/${cs.confidence}`).join(", ")})`);
  }
  console.log("\nNo writes performed.");
}
main().catch((e) => { console.error(e); process.exit(1); });
