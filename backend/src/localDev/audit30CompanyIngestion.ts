// ============================================================================
// Equity AI — Milestone 10A: post-ingestion read-only audit of the
// 30-company demo universe. No writes.
// ============================================================================
import { getDbClient } from "../db/client";

const TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

function daysBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

async function countAll(table: string): Promise<number> {
  const db = getDbClient();
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function main() {
  const db = getDbClient();

  const { data: companies, error: companiesErr } = await db
    .from("companies")
    .select("id, ticker, name, sector, industry")
    .in("ticker", TICKERS);
  if (companiesErr) throw new Error(companiesErr.message);
  console.log(`1. Company identity: ${companies!.length}/30 found.`);
  const missing = TICKERS.filter((t) => !companies!.some((c: any) => c.ticker === t));
  if (missing.length) console.log(`   MISSING: ${missing.join(", ")}`);

  const companyIds = companies!.map((c: any) => c.id);
  const idToTicker = new Map(companies!.map((c: any) => [c.id, c.ticker]));

  const { data: rawRows, error: rawErr } = await db
    .from("raw_financial_data")
    .select("id, company_id, metric_name, period_start, period_end, period_type, data_source_id, data_sources(provider_name)")
    .in("company_id", companyIds);
  if (rawErr) throw new Error(rawErr.message);

  console.log(`\n2-3-4-5. Revenue/net_income/eps period checks:`);
  let anomalies = 0;
  for (const ticker of TICKERS) {
    const company = companies!.find((c: any) => c.ticker === ticker) as any;
    const rows = (rawRows ?? []).filter((r: any) => r.company_id === company.id);
    for (const metric of ["revenue", "net_income", "eps"]) {
      const items = rows.filter((r: any) => r.metric_name === metric);
      const periods = new Set(items.map((r: any) => r.period_end));
      const spans = items.map((r: any) => daysBetween(r.period_start, r.period_end));
      const badSpans = spans.filter((d) => d !== null && (d < 340 || d > 390));
      if (periods.size < 4) { console.log(`   ⚠️  ${ticker} ${metric}: only ${periods.size} distinct periods`); anomalies++; }
      if (badSpans.length > 0) { console.log(`   ❌ ${ticker} ${metric}: ${badSpans.length} non-annual-span fact(s) present: ${badSpans.join(",")}`); anomalies++; }
    }
  }
  console.log(`   ${anomalies === 0 ? "✅ No anomalies found across all 30 companies." : `${anomalies} anomalies found (see above).`}`);

  // 6. duplicate raw observations
  const seen = new Map<string, number>();
  for (const r of (rawRows ?? []) as any[]) {
    const key = `${r.company_id}|${r.metric_name}|${r.period_end}|${r.period_type}|${r.data_source_id}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, c]) => c > 1);
  console.log(`\n6. Duplicate raw observations (company_id+metric_name+period_end+period_type+data_source_id): ${dupes.length} ${dupes.length === 0 ? "✅" : "❌"}`);

  // 7. valid data_sources links
  const orphaned = (rawRows ?? []).filter((r: any) => !r.data_sources);
  console.log(`7. Raw rows with missing/invalid data_sources link: ${orphaned.length} ${orphaned.length === 0 ? "✅" : "❌"}`);

  // 8. canonical financial_metrics present
  const { data: fmRows, error: fmErr } = await db
    .from("financial_metrics")
    .select("company_id, metric_name, period_end")
    .in("company_id", companyIds);
  if (fmErr) throw new Error(fmErr.message);
  console.log(`\n8. Canonical financial_metrics rows across all 30: ${fmRows!.length}`);
  for (const ticker of TICKERS) {
    const company = companies!.find((c: any) => c.ticker === ticker) as any;
    const count = fmRows!.filter((r: any) => r.company_id === company.id).length;
    if (count < 12) console.log(`   ⚠️  ${ticker}: only ${count} canonical rows (expected >= 12)`);
  }

  // 9. calculated_metrics
  const { data: cmRows, error: cmErr } = await db
    .from("calculated_metrics")
    .select("company_id, metric_name")
    .in("company_id", companyIds);
  if (cmErr) throw new Error(cmErr.message);
  console.log(`\n9. calculated_metrics rows across all 30: ${cmRows!.length}`);

  console.log(`\n${"=".repeat(70)}\nFINAL AGGREGATE COUNTS\n${"=".repeat(70)}`);
  console.log(`companies (all)          = ${await countAll("companies")}`);
  console.log(`data_sources (all)       = ${await countAll("data_sources")}`);
  console.log(`raw_financial_data (all) = ${await countAll("raw_financial_data")}`);
  console.log(`financial_metrics (all)  = ${await countAll("financial_metrics")}`);
  console.log(`calculated_metrics (all) = ${await countAll("calculated_metrics")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
