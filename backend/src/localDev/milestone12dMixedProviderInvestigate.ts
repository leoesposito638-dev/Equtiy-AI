import { getDbClient } from "../db/client";
const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];
async function main() {
  const db = getDbClient();
  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  const companyIds = (companies as any[]).map((c) => c.id);
  const idToTicker = new Map((companies as any[]).map((c) => [c.id, c.ticker]));
  const { data: fmRows } = await db.from("financial_metrics").select("company_id, metric_name, source_id, period_end").in("company_id", companyIds);
  const { data: sources } = await db.from("data_sources").select("id, provider_name");
  const providerById = new Map((sources as any[]).map((s) => [s.id, s.provider_name]));
  const byCompanyMetric = new Map<string, Set<string>>();
  for (const r of fmRows as any[]) {
    const key = `${r.company_id}|${r.metric_name}`;
    const providers = byCompanyMetric.get(key) ?? new Set<string>();
    providers.add(providerById.get(r.source_id) ?? "UNKNOWN");
    byCompanyMetric.set(key, providers);
  }
  for (const [key, providers] of byCompanyMetric.entries()) {
    if (providers.size > 1) {
      const [companyId, metricName] = key.split("|");
      console.log(`MIXED: ${idToTicker.get(companyId)} ${metricName} providers=${[...providers].join(",")}`);
      const rows = (fmRows as any[]).filter((r) => r.company_id === companyId && r.metric_name === metricName);
      for (const r of rows) console.log(`   period_end=${r.period_end} provider=${providerById.get(r.source_id)}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
