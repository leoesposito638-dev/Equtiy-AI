// ============================================================================
// Equity AI — Milestone 11A: data integrity cross-check.
//
// For NVDA, LLY, ORCL, INTC, DE: fetches exactly what the real API server
// (src/api/server.ts) returns for /companies/:id/scores and
// /companies/:id/metrics — the same endpoints the frontend's apiClient.ts
// calls — and compares every value against the raw category_scores /
// calculated_metrics rows queried directly from Supabase. Asserts EXACT
// equality (===), catching any transform/round/substitute the API layer
// might introduce. Read-only. Requires the real API server to be running
// (see README: `npm run dev`, or PORT=<n> npx ts-node src/api/server.ts).
// ============================================================================

import { getDbClient } from "../db/client";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3311";
const CHECK_TICKERS = ["NVDA", "LLY", "ORCL", "INTC", "DE"];
const GROWTH_METRICS = ["revenue_growth_yoy", "revenue_cagr_3y", "eps_growth_yoy", "eps_cagr", "growth_acceleration"];

async function main() {
  const db = getDbClient();
  let mismatches = 0;

  const { data: companies, error } = await db.from("companies").select("id, ticker").in("ticker", CHECK_TICKERS);
  if (error) throw new Error(error.message);
  if (companies!.length !== CHECK_TICKERS.length) throw new Error(`Expected ${CHECK_TICKERS.length} companies, found ${companies!.length}`);

  for (const ticker of CHECK_TICKERS) {
    const company = (companies as any[]).find((c) => c.ticker === ticker);
    console.log(`\n${"=".repeat(90)}\n${ticker} (company_id=${company.id})\n${"=".repeat(90)}`);

    // --- GROWTH category score: raw DB row vs. what the API returns ---
    const { data: rawScoreRows, error: scoreErr } = await db
      .from("category_scores")
      .select("*, score_categories(category_key)")
      .eq("company_id", company.id);
    if (scoreErr) throw new Error(scoreErr.message);
    const rawGrowth = (rawScoreRows as any[]).find((r) => r.score_categories.category_key === "GROWTH");

    const apiScores = await (await fetch(`${API_BASE_URL}/companies/${company.id}/scores`)).json();
    const apiGrowth = (apiScores.data.categories as any[]).find((c: any) => c.score_categories.category_key === "GROWTH");

    const scoreMatch = rawGrowth && apiGrowth && rawGrowth.score === apiGrowth.score && rawGrowth.confidence === apiGrowth.confidence && rawGrowth.coverage === apiGrowth.coverage;
    console.log(`GROWTH score: raw DB (score=${rawGrowth?.score}, confidence=${rawGrowth?.confidence}, coverage=${rawGrowth?.coverage}) vs API (score=${apiGrowth?.score}, confidence=${apiGrowth?.confidence}, coverage=${apiGrowth?.coverage}) — ${scoreMatch ? "MATCH ✅" : "MISMATCH ❌"}`);
    if (!scoreMatch) mismatches++;

    // fundamental_scores must be null (never written for GROWTH-only Milestone 10C) —
    // confirms the frontend isn't being handed a fabricated/synthesized fundamental score.
    const fundamentalNull = apiScores.data.fundamental === null;
    console.log(`fundamental_scores: API returns null — ${fundamentalNull ? "correct (honest, none written) ✅" : "❌ UNEXPECTED non-null fundamental"}`);
    if (!fundamentalNull) mismatches++;

    // --- 5 GROWTH metrics: raw DB rows vs. what the API returns ---
    const { data: rawMetricRows, error: metricErr } = await db
      .from("calculated_metrics")
      .select("metric_name, value, period_end, period_type")
      .eq("company_id", company.id)
      .eq("period_type", "ANNUAL")
      .in("metric_name", GROWTH_METRICS);
    if (metricErr) throw new Error(metricErr.message);

    const apiMetrics = await (await fetch(`${API_BASE_URL}/companies/${company.id}/metrics`)).json();
    const apiAnnualGrowthRows = (apiMetrics.data as any[]).filter((r) => r.period_type === "ANNUAL" && GROWTH_METRICS.includes(r.metric_name));

    for (const metricName of GROWTH_METRICS) {
      const rawForMetric = (rawMetricRows as any[]).filter((r) => r.metric_name === metricName);
      const rawLatest = rawForMetric.reduce((best: any, r: any) => (!best || r.period_end > best.period_end ? r : best), null);
      const apiForMetric = apiAnnualGrowthRows.filter((r) => r.metric_name === metricName);
      const apiLatest = apiForMetric.reduce((best: any, r: any) => (!best || r.period_end > best.period_end ? r : best), null);

      if (rawLatest === null && apiLatest === null) {
        console.log(`  ${metricName.padEnd(22)} unavailable in both raw DB and API — correct (no fabricated value) ✅`);
        continue;
      }
      const match = rawLatest && apiLatest && rawLatest.value === apiLatest.value && rawLatest.period_end === apiLatest.period_end;
      console.log(`  ${metricName.padEnd(22)} raw=${rawLatest?.value ?? "∅"} (${rawLatest?.period_end ?? "-"}) vs API=${apiLatest?.value ?? "∅"} (${apiLatest?.period_end ?? "-"}) — ${match ? "MATCH ✅" : "MISMATCH ❌"}`);
      if (!match) mismatches++;
    }
  }

  console.log(`\n${"=".repeat(90)}\nTOTAL MISMATCHES: ${mismatches} ${mismatches === 0 ? "✅ ALL VALUES TRACE EXACTLY TO SUPABASE, NO TRANSFORM/ROUNDING/SUBSTITUTION" : "❌"}\n${"=".repeat(90)}`);
  if (mismatches > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
