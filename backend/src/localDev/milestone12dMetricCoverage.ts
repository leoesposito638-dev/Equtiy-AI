// ============================================================================
// Equity AI — Milestone 12D: final metric-coverage report for Table A.
// Read-only. Reports, for every metric referenced by the 4 in-scope
// categories' score_rules, how many of the 30 demo companies have a real
// stored value (latest ANNUAL calculated_metrics row), and — for
// margin_trend specifically — how many have >=3 stored periods (its
// minimum_data_points).
// ============================================================================

import { getDbClient } from "../db/client";

const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

const METRICS = [
  "gross_margin", "operating_margin", "net_margin", "roe",
  "current_ratio", "interest_coverage", "fcf_margin",
  "rd_intensity",
];

async function main() {
  const db = getDbClient();
  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  const companyIds = (companies as any[]).map((c) => c.id);
  const idToTicker = new Map((companies as any[]).map((c) => [c.id, c.ticker]));

  for (const metric of METRICS) {
    const { data: rows } = await db
      .from("calculated_metrics")
      .select("company_id, period_end")
      .in("company_id", companyIds)
      .eq("metric_name", metric)
      .eq("period_type", "ANNUAL")
      .order("period_end", { ascending: false });
    const seen = new Set<string>();
    const latestByCompany = new Map<string, string>();
    for (const r of rows as any[]) {
      if (!latestByCompany.has(r.company_id)) latestByCompany.set(r.company_id, r.period_end);
      seen.add(r.company_id);
    }
    const missing = DEMO_TICKERS.filter((t) => {
      const c = (companies as any[]).find((c) => c.ticker === t);
      return !seen.has(c.id);
    });
    console.log(`${metric.padEnd(20)} covered=${seen.size}/30 missing=[${missing.join(",") || "none"}]`);
  }

  // margin_trend: companies with >=3 net_margin periods.
  const { data: nmRows } = await db
    .from("calculated_metrics")
    .select("company_id")
    .in("company_id", companyIds)
    .eq("metric_name", "net_margin")
    .eq("period_type", "ANNUAL");
  const countByCompany = new Map<string, number>();
  for (const r of nmRows as any[]) countByCompany.set(r.company_id, (countByCompany.get(r.company_id) ?? 0) + 1);
  const eligible = [...countByCompany.entries()].filter(([, n]) => n >= 3).map(([id]) => idToTicker.get(id));
  const missingTrend = DEMO_TICKERS.filter((t) => !eligible.includes(t));
  console.log(`${"margin_trend".padEnd(20)} covered=${eligible.length}/30 missing=[${missingTrend.join(",") || "none"}]`);
}

main().catch((e) => { console.error(e); process.exit(1); });
