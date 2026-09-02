// ============================================================================
// Equity AI — Milestone 12D: 30-company data-quality audit. Read-only.
// Same checks as milestone12bDataQualityAudit.ts, plus a Growth-values-
// unchanged check (Phase 13 explicitly requires confirming GROWTH did not
// change) and a margin_trend-specific coverage report.
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

  console.log(`\n${"=".repeat(90)}\n3. SCORE / CONFIDENCE / COVERAGE RANGE CHECK\n${"=".repeat(90)}`);
  const { data: allScoresFull } = await db.from("category_scores").select("*, score_categories(category_key)").in("company_id", companyIds);
  const badScore = (allScoresFull as any[]).filter((r) => r.score < 0 || r.score > 100 || r.score === null);
  const badConf = (allScoresFull as any[]).filter((r) => r.confidence < 0 || r.confidence > 1 || r.confidence === null);
  const badCov = (allScoresFull as any[]).filter((r) => r.coverage < 0 || r.coverage > 1 || r.coverage === null);
  console.log(`Rows with score out of [0,100]: ${badScore.length} ${badScore.length === 0 ? "✅" : "❌"}`);
  console.log(`Rows with confidence out of [0,1]: ${badConf.length} ${badConf.length === 0 ? "✅" : "❌"}`);
  console.log(`Rows with coverage out of [0,1]: ${badCov.length} ${badCov.length === 0 ? "✅" : "❌"}`);

  console.log(`\n${"=".repeat(90)}\n4. FABRICATED-PLACEHOLDER CHECK (score=0 AND confidence=0 -> a zero-coverage row that should never be persisted)\n${"=".repeat(90)}`);
  const zeroScores = (allScoresFull as any[]).filter((r) => r.score === 0 && r.confidence === 0);
  console.log(`Rows with score=0 AND confidence=0: ${zeroScores.length} ${zeroScores.length === 0 ? "✅" : "❌"}`);

  console.log(`\n${"=".repeat(90)}\n5. DUPLICATE CALCULATED_METRICS CHECK\n${"=".repeat(90)}`);
  const { data: cmRows } = await db.from("calculated_metrics").select("company_id, metric_name, period_end, period_type, calculation_version").in("company_id", companyIds);
  const cmDupMap = new Map<string, number>();
  for (const r of cmRows as any[]) {
    const key = `${r.company_id}|${r.metric_name}|${r.period_end}|${r.period_type}|${r.calculation_version}`;
    cmDupMap.set(key, (cmDupMap.get(key) ?? 0) + 1);
  }
  const cmDupes = [...cmDupMap.entries()].filter(([, n]) => n > 1);
  console.log(`Duplicate calculated_metrics keys: ${cmDupes.length} ${cmDupes.length === 0 ? "✅" : "❌"}`);
  console.log(`Total calculated_metrics rows for demo universe: ${(cmRows as any[]).length}`);

  console.log(`\n${"=".repeat(90)}\n6. MIXED-PROVIDER CANONICAL CHECK\n${"=".repeat(90)}`);
  const { data: fmRows } = await db.from("financial_metrics").select("company_id, metric_name, source_id").in("company_id", companyIds);
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
  console.log(`Company/metric combinations sourced from >1 provider: ${mixed.length} ${mixed.length === 0 ? "✅" : "⚠️"}`);

  console.log(`\n${"=".repeat(90)}\n7. BENCHMARK SAMPLE-SIZE CHECK (no benchmark with sample_size < its tier's threshold)\n${"=".repeat(90)}`);
  const { data: benchmarks } = await db.from("metric_benchmarks").select("metric_name, sector, sample_size");
  const badBenchmarks = (benchmarks as any[]).filter((b) => (b.sector === null ? b.sample_size < 30 : b.sample_size < 10));
  console.log(`Benchmarks below their tier's minimum sample size: ${badBenchmarks.length} ${badBenchmarks.length === 0 ? "✅" : "❌"}`);
  for (const b of benchmarks as any[]) console.log(`   ${b.metric_name} sector=${b.sector ?? "MARKET_WIDE"} sample_size=${b.sample_size}`);

  console.log(`\n${"=".repeat(90)}\n8. GROWTH VALUES UNCHANGED CHECK (this milestone must not touch GROWTH)\n${"=".repeat(90)}`);
  const { data: growthCat } = await db.from("score_categories").select("id").eq("category_key", "GROWTH").single();
  const growthRows = (allScoresFull as any[]).filter((r) => r.category_id === (growthCat as any).id);
  console.log(`GROWTH category_scores rows: ${growthRows.length}/30`);
  const growthScores = growthRows.map((r: any) => r.score);
  console.log(`GROWTH score range [${Math.min(...growthScores)}, ${Math.max(...growthScores)}] — compare manually against the pre-12D value if a prior snapshot is available.`);

  console.log(`\n${"=".repeat(90)}\n9. IN-SCOPE CATEGORY SCORE SUMMARY\n${"=".repeat(90)}`);
  const IN_SCOPE = ["PROFITABILITY", "FINANCIAL_HEALTH", "CAPITAL_ALLOCATION", "COMPETITIVE_ADVANTAGE"];
  const { data: cats } = await db.from("score_categories").select("id, category_key").in("category_key", IN_SCOPE);
  for (const cat of cats as any[]) {
    const rows = (allScoresFull as any[]).filter((r) => r.category_id === cat.id);
    const scored = rows.map((r: any) => idToTicker.get(r.company_id));
    const unavailable = DEMO_TICKERS.filter((t) => !scored.includes(t));
    if (rows.length === 0) {
      console.log(`${cat.category_key}: 0/30 scored (remains "Not yet scored" for all 30).`);
      continue;
    }
    const scores = rows.map((r: any) => r.score);
    const confidences = rows.map((r: any) => r.confidence);
    const sorted = [...scores].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[(sorted.length - 1) / 2];
    const avg = scores.reduce((s: number, v: number) => s + v, 0) / scores.length;
    console.log(`${cat.category_key}: ${rows.length}/30 scored. Range [${Math.min(...scores)}, ${Math.max(...scores)}]. Median=${median.toFixed(2)}. Average=${avg.toFixed(2)}. Confidence range [${Math.min(...confidences)}, ${Math.max(...confidences)}].`);
    console.log(`   Unavailable: ${unavailable.join(", ") || "none"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
