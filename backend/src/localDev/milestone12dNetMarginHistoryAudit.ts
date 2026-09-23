// ============================================================================
// Equity AI — Milestone 12D Phase 1/2 audit: how many stored ANNUAL
// net_margin periods does each of the 30 demo companies actually have?
// margin_trend requires >=3 non-null periods (score_rules.minimum_data_points).
// Read-only.
// ============================================================================

import { getDbClient } from "../db/client";

const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

async function main() {
  const db = getDbClient();
  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  if (companies!.length !== 30) throw new Error(`Expected 30 companies, found ${companies!.length}`);

  const { data: rows } = await db
    .from("calculated_metrics")
    .select("company_id, period_end, value")
    .in("company_id", (companies as any[]).map((c) => c.id))
    .eq("metric_name", "net_margin")
    .eq("period_type", "ANNUAL");

  const byCompany = new Map<string, number>();
  for (const r of rows as any[]) {
    if (r.value === null) continue;
    byCompany.set(r.company_id, (byCompany.get(r.company_id) ?? 0) + 1);
  }

  const idToTicker = new Map((companies as any[]).map((c) => [c.id, c.ticker]));
  let atLeast3 = 0;
  for (const c of companies as any[]) {
    const n = byCompany.get(c.id) ?? 0;
    if (n >= 3) atLeast3++;
    console.log(`${c.ticker.padEnd(6)} net_margin ANNUAL periods stored: ${n} ${n >= 3 ? "✅ >=3 (margin_trend eligible)" : ""}`);
  }
  console.log(`\n${atLeast3}/30 companies have >=3 net_margin periods (margin_trend minimum_data_points=3).`);

  const { data: grossRows } = await db
    .from("calculated_metrics")
    .select("company_id, period_end, value")
    .in("company_id", (companies as any[]).map((c) => c.id))
    .eq("metric_name", "gross_margin")
    .eq("period_type", "ANNUAL");
  const grossByCompany = new Map<string, number>();
  for (const r of grossRows as any[]) {
    if (r.value === null) continue;
    grossByCompany.set(r.company_id, (grossByCompany.get(r.company_id) ?? 0) + 1);
  }
  const maxGross = Math.max(0, ...[...grossByCompany.values()]);
  console.log(`\ngross_margin: max stored ANNUAL periods for any company = ${maxGross} (gross_margin_stability requires >=5 -> ${maxGross >= 5 ? "achievable" : "STRUCTURALLY UNACHIEVABLE at current lookback depth"})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
