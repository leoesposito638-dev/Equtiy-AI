import { getDbClient } from "../db/client";
const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];
async function main() {
  const db = getDbClient();
  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  const idToTicker = new Map((companies as any[]).map((c) => [c.id, c.ticker]));
  const { data: fund } = await db.from("fundamental_scores").select("company_id, score, confidence, data_coverage, calculation_version").in("company_id", (companies as any[]).map((c) => c.id));
  const { data: cats } = await db.from("category_scores").select("company_id, coverage, score_categories(category_key)").in("company_id", (companies as any[]).map((c) => c.id)).gt("coverage", 0);
  const contribByCompany = new Map<string, string[]>();
  for (const r of cats as any[]) {
    const t = idToTicker.get(r.company_id);
    const list = contribByCompany.get(t) ?? [];
    list.push(r.score_categories.category_key);
    contribByCompany.set(t, list);
  }
  for (const r of fund as any[]) {
    const t = idToTicker.get(r.company_id);
    console.log(JSON.stringify({ ticker: t, score: r.score, confidence: r.confidence, dataCoverage: r.data_coverage, version: r.calculation_version, contributing: contribByCompany.get(t) ?? [] }));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
