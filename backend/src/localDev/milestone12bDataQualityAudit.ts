// ============================================================================
// Equity AI — Milestone 12B: 30-company data-quality audit.
// Read-only. Checks: duplicate category_scores, duplicate calculated_metrics,
// impossible values, unexpected zeroes, stale periods, mixed-provider
// canonical rows, scores outside [0,100], invalid confidence, legacy
// companies accidentally included.
// ============================================================================

import { getDbClient } from "../db/client";

const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];
const NEW_METRICS = ["net_margin", "gross_margin", "operating_margin", "roe", "current_ratio", "interest_coverage", "free_cash_flow", "fcf_margin", "rd_intensity"];
const NEW_CATEGORIES = ["PROFITABILITY", "FINANCIAL_HEALTH", "CAPITAL_ALLOCATION", "COMPETITIVE_ADVANTAGE"];

async function main() {
  const db = getDbClient();
  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  if (companies!.length !== 30) throw new Error(`Expected 30 companies, found ${companies!.length}`);
  const companyIds = (companies as any[]).map((c) => c.id);
  const idToTicker = new Map((companies as any[]).map((c) => [c.id, c.ticker]));

  console.log(`${"=".repeat(90)}\n1. LEGACY COMPANY LEAK CHECK\n${"=".repeat(90)}`);
  const { data: allCatScores } = await db.from("category_scores").select("company_id, score_categories(category_key)");
  const nonDemoScored = (allCatScores as any[]).filter((r) => !companyIds.includes(r.company_id));
  console.log(`category_scores rows for companies OUTSIDE the 30-company universe: ${nonDemoScored.length} ${nonDemoScored.length === 0 ? "✅" : "❌"}`);

  console.log(`\n${"=".repeat(90)}\n2. DUPLICATE CATEGORY_SCORES CHECK\n${"=".repeat(90)}`);
  const { data: demoScores } = await db.from("category_scores").select("company_id, category_id").in("company_id", companyIds);
  const catDupMap = new Map<string, number>();
  for (const r of demoScores as any[]) {
    const key = `${r.company_id}|${r.category_id}`;
    catDupMap.set(key, (catDupMap.get(key) ?? 0) + 1);
  }
  const catDupes = [...catDupMap.entries()].filter(([, n]) => n > 1);
  console.log(`Duplicate (company, category) category_scores pairs: ${catDupes.length} ${catDupes.length === 0 ? "✅" : "❌"}`);

  console.log(`\n${"=".repeat(90)}\n3. SCORE / CONFIDENCE RANGE CHECK\n${"=".repeat(90)}`);
  const { data: allScoresFull } = await db.from("category_scores").select("*").in("company_id", companyIds);
  const badScore = (allScoresFull as any[]).filter((r) => r.score < 0 || r.score > 100 || r.score === null);
  const badConf = (allScoresFull as any[]).filter((r) => r.confidence < 0 || r.confidence > 1 || r.confidence === null);
  console.log(`Rows with score out of [0,100]: ${badScore.length} ${badScore.length === 0 ? "✅" : "❌"}`);
  console.log(`Rows with confidence out of [0,1]: ${badConf.length} ${badConf.length === 0 ? "✅" : "❌"}`);

  console.log(`\n${"=".repeat(90)}\n4. UNEXPECTED ZERO-SCORE CHECK (score=0 with confidence>0 would be suspicious)\n${"=".repeat(90)}`);
  const zeroScores = (allScoresFull as any[]).filter((r) => r.score === 0);
  console.log(`Rows with score exactly 0: ${zeroScores.length}`);
  for (const r of zeroScores) console.log(`   ${idToTicker.get(r.company_id)} category_id=${r.category_id} confidence=${r.confidence} coverage=${r.coverage}`);

  console.log(`\n${"=".repeat(90)}\n5. DUPLICATE CALCULATED_METRICS CHECK (new metrics)\n${"=".repeat(90)}`);
  const { data: cmRows } = await db.from("calculated_metrics").select("company_id, metric_name, period_end, period_type, calculation_version").in("company_id", companyIds).in("metric_name", NEW_METRICS);
  const cmDupMap = new Map<string, number>();
  for (const r of cmRows as any[]) {
    const key = `${r.company_id}|${r.metric_name}|${r.period_end}|${r.period_type}|${r.calculation_version}`;
    cmDupMap.set(key, (cmDupMap.get(key) ?? 0) + 1);
  }
  const cmDupes = [...cmDupMap.entries()].filter(([, n]) => n > 1);
  console.log(`Duplicate calculated_metrics keys: ${cmDupes.length} ${cmDupes.length === 0 ? "✅" : "❌"}`);
  console.log(`Total new-metric calculated_metrics rows: ${(cmRows as any[]).length}`);

  console.log(`\n${"=".repeat(90)}\n6. IMPOSSIBLE VALUES CHECK (current_ratio negative, margins > 1000%, etc.)\n${"=".repeat(90)}`);
  const suspicious = (cmRows as any[]).filter((r) => {
    if (r.metric_name === "current_ratio" && r.value < 0) return true;
    if (["net_margin", "gross_margin", "operating_margin"].includes(r.metric_name) && Math.abs(r.value) > 1000) return true;
    return false;
  });
  console.log(`Suspicious values: ${suspicious.length} ${suspicious.length === 0 ? "✅" : "⚠️"}`);
  for (const r of suspicious) console.log(`   ${idToTicker.get(r.company_id)} ${r.metric_name}=${r.value} (${r.period_end})`);

  console.log(`\n${"=".repeat(90)}\n7. MIXED-PROVIDER CANONICAL CHECK (financial_metrics rows for new raw facts)\n${"=".repeat(90)}`);
  const NEW_RAW_METRICS = ["gross_profit", "operating_income", "interest_expense", "research_development", "cash", "total_assets", "total_liabilities", "equity", "current_assets", "current_liabilities", "operating_cash_flow", "capex", "depreciation_amortization"];
  const { data: fmRows } = await db.from("financial_metrics").select("company_id, metric_name, period_end, source_id").in("company_id", companyIds).in("metric_name", NEW_RAW_METRICS);
  const { data: sources } = await db.from("data_sources").select("id, provider_name");
  const providerById = new Map((sources as any[]).map((s) => [s.id, s.provider_name]));
  const byCompanyMetric = new Map<string, Set<string>>();
  for (const r of fmRows as any[]) {
    const key = `${r.company_id}|${r.metric_name}`;
    const providers = byCompanyMetric.get(key) ?? new Set<string>();
    providers.add(providerById.get(r.source_id) ?? "UNKNOWN");
    byCompanyMetric.set(key, providers);
  }
  const mixed = [...byCompanyMetric.entries()].filter(([, providers]) => providers.size > 1);
  console.log(`Company/metric combinations sourced from >1 provider (would indicate mixing): ${mixed.length} ${mixed.length === 0 ? "✅" : "⚠️"}`);
  const providerBreakdown = new Map<string, number>();
  for (const r of fmRows as any[]) {
    const p = providerById.get(r.source_id) ?? "UNKNOWN";
    providerBreakdown.set(p, (providerBreakdown.get(p) ?? 0) + 1);
  }
  console.log(`Provider breakdown for new raw facts: ${[...providerBreakdown.entries()].map(([p, n]) => `${p}=${n}`).join(", ")}`);

  console.log(`\n${"=".repeat(90)}\n8. STALE PERIOD CHECK (new raw facts more than 3 years old)\n${"=".repeat(90)}`);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 3);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const { data: latestPerMetric } = await db.from("financial_metrics").select("company_id, metric_name, period_end").in("company_id", companyIds).in("metric_name", NEW_RAW_METRICS).order("period_end", { ascending: false });
  const latestByCompanyMetric = new Map<string, string>();
  for (const r of latestPerMetric as any[]) {
    const key = `${r.company_id}|${r.metric_name}`;
    if (!latestByCompanyMetric.has(key)) latestByCompanyMetric.set(key, r.period_end);
  }
  const stale = [...latestByCompanyMetric.entries()].filter(([, periodEnd]) => periodEnd < cutoffStr);
  console.log(`Company/metric combos whose MOST RECENT period is >3 years old: ${stale.length} ${stale.length === 0 ? "✅ none — no stale data silently treated as current" : ""}`);
  for (const [key, periodEnd] of stale) {
    const [companyId, metricName] = key.split("|");
    console.log(`   ⚠️ ${idToTicker.get(companyId)} ${metricName}: latest period_end=${periodEnd}`);
  }

  console.log(`\n${"=".repeat(90)}\n9. NEW CATEGORY SCORE SUMMARY\n${"=".repeat(90)}`);
  const { data: cats } = await db.from("score_categories").select("id, category_key").in("category_key", NEW_CATEGORIES);
  for (const cat of cats as any[]) {
    const rows = (allScoresFull as any[]).filter((r) => r.category_id === cat.id);
    const scored = rows.map((r) => idToTicker.get(r.company_id));
    const unavailable = DEMO_TICKERS.filter((t) => !scored.includes(t));
    if (rows.length === 0) {
      console.log(`${cat.category_key}: 0/30 scored (remains "Not yet scored" for all 30 — no implementable rules this milestone).`);
      continue;
    }
    const scores = rows.map((r) => r.score);
    const confidences = rows.map((r) => r.confidence);
    const sorted = [...scores].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[(sorted.length - 1) / 2];
    const avg = scores.reduce((s: number, v: number) => s + v, 0) / scores.length;
    console.log(`${cat.category_key}: ${rows.length}/30 scored. Range [${Math.min(...scores)}, ${Math.max(...scores)}]. Median=${median.toFixed(2)}. Average=${avg.toFixed(2)}. Confidence range [${Math.min(...confidences)}, ${Math.max(...confidences)}].`);
    console.log(`   Unavailable (0 coverage): ${unavailable.join(", ") || "none"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
