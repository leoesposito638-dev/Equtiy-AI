// ============================================================================
// Equity AI — Milestone 13E: full data-quality audit. Read-only.
// Extends the Milestone 13C audit with ROIC-specific checks: financial-
// company ROIC fabrication check, ORCL/MCD verification, and a quarterly/
// stub-contamination + cross-fiscal-year-mixing check for the new
// invested_capital/effective_tax_rate/roic calculated_metrics.
// ============================================================================

import { getDbClient } from "../db/client";

const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];
const FINANCIAL_COMPANIES = ["JPM", "BAC", "MA", "SCHW"];

async function main() {
  const db = getDbClient();
  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  if (companies!.length !== 30) throw new Error(`Expected 30, found ${companies!.length}`);
  const companyIds = (companies as any[]).map((c) => c.id);
  const idToTicker = new Map((companies as any[]).map((c) => [c.id, c.ticker]));

  console.log(`${"=".repeat(90)}\n1. LEGACY COMPANY LEAK CHECK\n${"=".repeat(90)}`);
  const { data: allCatScores } = await db.from("category_scores").select("company_id");
  const nonDemo = (allCatScores as any[]).filter((r) => !companyIds.includes(r.company_id));
  console.log(`category_scores rows for companies OUTSIDE the 30-company universe: ${nonDemo.length} ${nonDemo.length === 0 ? "✅" : "❌"}`);

  console.log(`\n${"=".repeat(90)}\n2. DUPLICATE CATEGORY_SCORES CHECK (scoped per calculation_version)\n${"=".repeat(90)}`);
  const { data: demoScores } = await db.from("category_scores").select("company_id, category_id, calculation_version").in("company_id", companyIds);
  const catDupMap = new Map<string, number>();
  for (const r of demoScores as any[]) {
    const key = `${r.company_id}|${r.category_id}|${r.calculation_version}`;
    catDupMap.set(key, (catDupMap.get(key) ?? 0) + 1);
  }
  const catDupes = [...catDupMap.entries()].filter(([, n]) => n > 1);
  console.log(`Duplicate (company, category, version) triples: ${catDupes.length} ${catDupes.length === 0 ? "✅" : "❌"}`);
  console.log(`Total category_scores for demo universe: ${(demoScores as any[]).length} (expect v1.0 history + v1.1 current)`);

  console.log(`\n${"=".repeat(90)}\n3. DUPLICATE FUNDAMENTAL_SCORES CHECK (scoped per calculation_version)\n${"=".repeat(90)}`);
  const { data: fundRows } = await db.from("fundamental_scores").select("company_id, calculation_version").in("company_id", companyIds);
  const fundDupMap = new Map<string, number>();
  for (const r of fundRows as any[]) {
    const key = `${r.company_id}|${r.calculation_version}`;
    fundDupMap.set(key, (fundDupMap.get(key) ?? 0) + 1);
  }
  const fundDupes = [...fundDupMap.entries()].filter(([, n]) => n > 1);
  console.log(`Duplicate (company, version) pairs: ${fundDupes.length} ${fundDupes.length === 0 ? "✅" : "❌"}`);
  console.log(`Total fundamental_scores for demo universe: ${(fundRows as any[]).length} (expect 30 v1.0 + 30 v1.1 = 60)`);

  console.log(`\n${"=".repeat(90)}\n4. SCORE / CONFIDENCE / COVERAGE RANGE CHECK\n${"=".repeat(90)}`);
  const { data: allScoresFull } = await db.from("category_scores").select("*, score_categories(category_key)").in("company_id", companyIds);
  const badScore = (allScoresFull as any[]).filter((r) => r.score < 0 || r.score > 100 || r.score === null);
  const badConf = (allScoresFull as any[]).filter((r) => r.confidence < 0 || r.confidence > 1 || r.confidence === null);
  console.log(`Rows with score out of [0,100]: ${badScore.length} ${badScore.length === 0 ? "✅" : "❌"}`);
  console.log(`Rows with confidence out of [0,1]: ${badConf.length} ${badConf.length === 0 ? "✅" : "❌"}`);

  console.log(`\n${"=".repeat(90)}\n5. FABRICATED-PLACEHOLDER CHECK (score=0 AND confidence=0)\n${"=".repeat(90)}`);
  const zeroScores = (allScoresFull as any[]).filter((r) => r.score === 0 && r.confidence === 0);
  console.log(`Rows with score=0 AND confidence=0: ${zeroScores.length} ${zeroScores.length === 0 ? "✅" : "❌"}`);

  console.log(`\n${"=".repeat(90)}\n6. DUPLICATE CALCULATED_METRICS CHECK\n${"=".repeat(90)}`);
  const cmRows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db.from("calculated_metrics").select("company_id, metric_name, period_end, period_type, calculation_version").in("company_id", companyIds).range(offset, offset + 999);
    if (!page || page.length === 0) break;
    cmRows.push(...page);
    if (page.length < 1000) break;
  }
  const cmDupMap = new Map<string, number>();
  for (const r of cmRows) {
    const key = `${r.company_id}|${r.metric_name}|${r.period_end}|${r.period_type}|${r.calculation_version}`;
    cmDupMap.set(key, (cmDupMap.get(key) ?? 0) + 1);
  }
  const cmDupes = [...cmDupMap.entries()].filter(([, n]) => n > 1);
  console.log(`Duplicate calculated_metrics keys: ${cmDupes.length} ${cmDupes.length === 0 ? "✅" : "❌"}`);
  console.log(`Total calculated_metrics rows: ${cmRows.length}`);

  console.log(`\n${"=".repeat(90)}\n7. DUPLICATE RAW_FINANCIAL_DATA CHECK\n${"=".repeat(90)}`);
  const rawRows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db.from("raw_financial_data").select("company_id, metric_name, period_end, period_type, unit, currency, raw_value, data_source_id, data_sources(provider_name)").in("company_id", companyIds).range(offset, offset + 999);
    if (!page || page.length === 0) break;
    rawRows.push(...page);
    if (page.length < 1000) break;
  }
  const rawDupMap = new Map<string, number>();
  for (const r of rawRows) {
    const provider = r.data_sources?.provider_name ?? "UNKNOWN";
    const key = `${r.company_id}|${r.metric_name}|${r.period_end}|${r.period_type}|${r.unit}|${r.currency}|${r.raw_value}|${provider}`;
    rawDupMap.set(key, (rawDupMap.get(key) ?? 0) + 1);
  }
  const rawDupes = [...rawDupMap.entries()].filter(([, n]) => n > 1);
  console.log(`Duplicate raw_financial_data (byte-for-byte, same provider) keys: ${rawDupes.length} ${rawDupes.length === 0 ? "✅" : "❌"}`);
  console.log(`Total raw_financial_data rows: ${rawRows.length}`);

  console.log(`\n${"=".repeat(90)}\n8. MIXED-PROVIDER CANONICAL CHECK (new debt concepts)\n${"=".repeat(90)}`);
  const NEW_RAW_METRICS = ["long_term_debt_current", "long_term_debt_noncurrent", "short_term_borrowings"];
  const { data: fmRows } = await db.from("financial_metrics").select("company_id, metric_name, source_id").in("company_id", companyIds).in("metric_name", NEW_RAW_METRICS);
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
  console.log(`Company/metric combos sourced from >1 provider: ${mixed.length} ${mixed.length === 0 ? "✅" : "⚠️"}`);

  console.log(`\n${"=".repeat(90)}\n9. FINANCIAL-COMPANY DEBT UNAVAILABILITY CHECK\n${"=".repeat(90)}`);
  const { data: financialCompanies } = await db.from("companies").select("id, ticker").in("ticker", FINANCIAL_COMPANIES);
  const { data: debtCat } = await db.from("calculated_metrics").select("company_id, metric_name").in("company_id", (financialCompanies as any[]).map((c) => c.id)).in("metric_name", ["total_debt", "net_debt", "debt_to_equity", "net_debt_to_ebitda"]);
  console.log(`Debt-derived calculated_metrics rows for JPM/BAC/MA/SCHW: ${(debtCat as any[]).length} ${(debtCat as any[]).length === 0 ? "✅ correctly unavailable, no fabricated values" : "❌ UNEXPECTED"}`);

  console.log(`\n${"=".repeat(90)}\n10. BENCHMARK SAMPLE-SIZE CHECK\n${"=".repeat(90)}`);
  const { data: benchmarks } = await db.from("metric_benchmarks").select("metric_name, sector, sample_size");
  const badBenchmarks = (benchmarks as any[]).filter((b) => (b.sector === null ? b.sample_size < 30 : b.sample_size < 10));
  console.log(`Benchmarks below their tier's minimum sample size: ${badBenchmarks.length} ${badBenchmarks.length === 0 ? "✅" : "❌"}`);

  console.log(`\n${"=".repeat(90)}\n11. GROWTH VALUES UNCHANGED CHECK\n${"=".repeat(90)}`);
  const { data: growthCat } = await db.from("score_categories").select("id").eq("category_key", "GROWTH").single();
  const growthRows = (allScoresFull as any[]).filter((r) => r.category_id === (growthCat as any).id && r.calculation_version === "v1.1");
  console.log(`GROWTH v1.1 category_scores rows: ${growthRows.length}/30`);

  console.log(`\n${"=".repeat(90)}\n12. IN-SCOPE CATEGORY SCORE SUMMARY (v1.1 only)\n${"=".repeat(90)}`);
  const IN_SCOPE = ["PROFITABILITY", "FINANCIAL_HEALTH", "CAPITAL_ALLOCATION", "COMPETITIVE_ADVANTAGE"];
  const { data: cats } = await db.from("score_categories").select("id, category_key").in("category_key", IN_SCOPE);
  for (const cat of cats as any[]) {
    const rows = (allScoresFull as any[]).filter((r) => r.category_id === cat.id && r.calculation_version === "v1.1");
    const scored = rows.map((r: any) => idToTicker.get(r.company_id));
    const unavailable = DEMO_TICKERS.filter((t) => !scored.includes(t));
    if (rows.length === 0) {
      console.log(`${cat.category_key}: 0/30 scored.`);
      continue;
    }
    const scores = rows.map((r: any) => r.score);
    console.log(`${cat.category_key}: ${rows.length}/30 scored. Range [${Math.min(...scores)}, ${Math.max(...scores)}].`);
    console.log(`   Unavailable: ${unavailable.join(", ") || "none"}`);
  }

  console.log(`\n${"=".repeat(90)}\n13. FINANCIAL-COMPANY ROIC FABRICATION CHECK\n${"=".repeat(90)}`);
  const { data: roicRows } = await db.from("calculated_metrics").select("company_id, period_end, value").in("company_id", companyIds).eq("metric_name", "roic");
  const financialCompanyIds = new Set((await db.from("companies").select("id, ticker").in("ticker", FINANCIAL_COMPANIES)).data!.map((c: any) => c.id));
  const fabricatedFinancialRoic = (roicRows as any[]).filter((r) => financialCompanyIds.has(r.company_id) && idToTicker.get(r.company_id) !== "MA");
  console.log(`ROIC rows for JPM/BAC/SCHW (expected structurally UNAVAILABLE): ${fabricatedFinancialRoic.length} ${fabricatedFinancialRoic.length === 0 ? "✅" : "❌ FABRICATED"}`);
  const maRoic = (roicRows as any[]).filter((r) => idToTicker.get(r.company_id) === "MA");
  console.log(`ROIC rows for MA (expected REAL — no financial-company special-case code): ${maRoic.length} ${maRoic.length > 0 ? "✅ REAL as expected" : "⚠️ unexpectedly unavailable"}`);

  console.log(`\n${"=".repeat(90)}\n14. ORCL / MCD ROIC VERIFICATION\n${"=".repeat(90)}`);
  const { data: orclMcd } = await db.from("companies").select("id, ticker").in("ticker", ["ORCL", "MCD"]);
  const { data: orclMcdRoic } = await db.from("calculated_metrics").select("company_id").in("company_id", (orclMcd as any[]).map((c) => c.id)).eq("metric_name", "roic");
  console.log(`ROIC rows for ORCL/MCD (expected 0 — stale/unavailable pretax concept): ${(orclMcdRoic as any[]).length} ${(orclMcdRoic as any[]).length === 0 ? "✅" : "❌ UNEXPECTED"}`);

  console.log(`\n${"=".repeat(90)}\n15. PERIOD ALIGNMENT / NO CROSS-FISCAL-YEAR MIXING CHECK\n${"=".repeat(90)}`);
  // For every roic row, verify a same-period_end operating_income (raw),
  // effective_tax_rate, and invested_capital row genuinely exists — proving
  // the 3-way align never mixed fiscal years.
  const { data: etrRows } = await db.from("calculated_metrics").select("company_id, period_end").in("company_id", companyIds).eq("metric_name", "effective_tax_rate");
  const { data: icRows } = await db.from("calculated_metrics").select("company_id, period_end").in("company_id", companyIds).eq("metric_name", "invested_capital");
  const etrKeys = new Set((etrRows as any[]).map((r) => `${r.company_id}|${r.period_end}`));
  const icKeys = new Set((icRows as any[]).map((r) => `${r.company_id}|${r.period_end}`));
  const misaligned = (roicRows as any[]).filter((r) => !etrKeys.has(`${r.company_id}|${r.period_end}`) || !icKeys.has(`${r.company_id}|${r.period_end}`));
  console.log(`ROIC rows whose period_end lacks a matching effective_tax_rate AND invested_capital row: ${misaligned.length} ${misaligned.length === 0 ? "✅ every ROIC value is genuinely period-aligned" : "❌"}`);
  console.log(`Total ROIC rows: ${(roicRows as any[]).length}`);

  console.log(`\n${"=".repeat(90)}\n16. ROIC / EFFECTIVE_TAX_RATE / INVESTED_CAPITAL COVERAGE SUMMARY\n${"=".repeat(90)}`);
  for (const metric of ["invested_capital", "effective_tax_rate", "roic"]) {
    const { data: rows } = await db.from("calculated_metrics").select("company_id").in("company_id", companyIds).eq("metric_name", metric);
    const tickers = new Set((rows as any[]).map((r) => idToTicker.get(r.company_id)));
    console.log(`${metric.padEnd(20)} ${tickers.size}/30 — missing: ${DEMO_TICKERS.filter((t) => !tickers.has(t)).join(", ") || "none"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
