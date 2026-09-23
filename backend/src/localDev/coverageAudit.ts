// ============================================================================
// Equity AI — Fundamental Score coverage audit (Milestone 15A, made
// re-runnable in Milestone 15B Part 3).
//
// For every active score_rules row (SCORING_VERSION), resolves the exact
// (source metric_name, period_type) pair supabaseScoringRepo.ts's real
// getMetricInputs() query would use — reusing its own exported
// METRIC_SOURCE_ALIAS/METRIC_PERIOD_TYPE maps rather than a hand-copied
// duplicate, so this script can never silently drift from the engine's
// actual behavior — then reports, per category and per company in the
// 30-company demo universe, how many of that category's rules have real,
// non-null data.
//
// Also runs the period_type mismatch check inline: for every rule's source
// metric, compares the period_type the engine queries against every
// period_type actually stored live, flagging any mismatch (Milestone 15B
// Part 1 found and fixed the only 5 that existed — this keeps checking for
// new ones as ingestion evolves).
//
// Read-only. Never writes anything.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/coverageAudit.ts
// ============================================================================

import { getDbClient } from "../db/client";
import { fetchAllPaginated } from "../db/paginate";
import { SCORING_VERSION } from "../scoring/scoringEngine";
import { METRIC_SOURCE_ALIAS, METRIC_PERIOD_TYPE } from "../scoring/supabaseScoringRepo";
import { DEMO_TICKERS } from "../config/demoUniverse";

const NEVER_IMPLEMENTED = new Set([
  "fcf_reinvestment_rate", "share_count_trend", "share_dilution_trend",
  "estimate_revision_trend", "guidance_direction_score", "guidance_credibility", "insider_ownership",
]);

async function main() {
  const db = getDbClient();
  const { data: categories } = await db.from("score_categories").select("*").eq("is_active", true).order("category_key");
  const { data: rules } = await db.from("score_rules").select("*").eq("version", SCORING_VERSION).eq("active", true);
  const { data: allCompanies } = await db.from("companies").select("id, ticker").order("ticker");
  const demoCompanies = (allCompanies as any[]).filter((c) => DEMO_TICKERS.includes(c.ticker));

  console.log(`Equity AI — Fundamental Score coverage audit (SCORING_VERSION=${SCORING_VERSION})\n`);
  console.log(`Active categories: ${categories!.length}, active rules: ${rules!.length}, demo companies: ${demoCompanies.length}\n`);

  // ---- Part 1-style period_type mismatch check ----
  const pairs = new Set<string>();
  for (const r of rules as any[]) {
    const source = METRIC_SOURCE_ALIAS[r.metric_name] ?? r.metric_name;
    const periodType = METRIC_PERIOD_TYPE[r.metric_name] ?? "ANNUAL";
    pairs.add(`${source}|${periodType}`);
  }
  const sourceMetrics = new Set([...pairs].map((p) => p.split("|")[0]));

  console.log(`${"=".repeat(100)}\nPERIOD_TYPE MISMATCH CHECK\n${"=".repeat(100)}`);
  let mismatchCount = 0;
  for (const metricName of [...sourceMetrics].sort()) {
    const queried = METRIC_PERIOD_TYPE[metricName] ?? "ANNUAL";
    const { data: rows } = await db.from("calculated_metrics").select("period_type").eq("metric_name", metricName);
    const storedTypes = [...new Set((rows as any[]).map((r) => r.period_type))].sort();
    const mismatch = storedTypes.length > 0 && !storedTypes.includes(queried);
    if (mismatch) {
      mismatchCount++;
      console.log(`*** MISMATCH *** ${metricName}: engine queries ${queried}, actually stored [${storedTypes.join(",")}]`);
    }
  }
  console.log(`Total mismatches: ${mismatchCount} (0 expected as of Milestone 15B Part 1's fix, unless a new metric's storage changed since).\n`);

  // ---- Coverage matrix ----
  const coverageByPair = new Map<string, Set<string>>();
  for (const pairKey of pairs) {
    const [metricName, periodType] = pairKey.split("|");
    const rows = await fetchAllPaginated<{ company_id: string; value: number | null }>((from, to) =>
      db.from("calculated_metrics").select("company_id, value").in("company_id", demoCompanies.map((c) => c.id)).eq("metric_name", metricName).eq("period_type", periodType).range(from, to)
    );
    coverageByPair.set(pairKey, new Set(rows.filter((r) => r.value !== null).map((r) => r.company_id)));
  }

  console.log(`${"=".repeat(100)}\nCOVERAGE MATRIX — 30-company demo universe, by category/rule\n${"=".repeat(100)}`);
  const summaryRows: Array<{ category: string; totalCells: number; presentCells: number }> = [];

  for (const cat of categories as any[]) {
    const catRules = (rules as any[]).filter((r) => r.category_id === cat.id);
    console.log(`\n--- ${cat.category_key} ---`);
    let presentCells = 0;
    let totalCells = 0;
    for (const rule of catRules) {
      const source = METRIC_SOURCE_ALIAS[rule.metric_name] ?? rule.metric_name;
      const periodType = METRIC_PERIOD_TYPE[rule.metric_name] ?? "ANNUAL";
      const presentSet = coverageByPair.get(`${source}|${periodType}`) ?? new Set();
      const presentDemo = demoCompanies.filter((c) => presentSet.has(c.id));
      totalCells += demoCompanies.length;
      presentCells += presentDemo.length;
      const neverImpl = NEVER_IMPLEMENTED.has(source);
      console.log(
        `  ${rule.metric_name.padEnd(28)} (source=${source}, period=${periodType})  present=${presentDemo.length}/${demoCompanies.length}${neverImpl ? "  [NEVER IMPLEMENTED]" : ""}`
      );
    }
    summaryRows.push({ category: cat.category_key, totalCells, presentCells });
  }

  console.log(`\n${"=".repeat(100)}\nCATEGORY SUMMARY\n${"=".repeat(100)}`);
  for (const s of summaryRows) {
    console.log(`${s.category.padEnd(24)} ${s.presentCells}/${s.totalCells} cells present (${((s.presentCells / s.totalCells) * 100).toFixed(1)}%)`);
  }
  const totalPresent = summaryRows.reduce((s, r) => s + r.presentCells, 0);
  const totalAll = summaryRows.reduce((s, r) => s + r.totalCells, 0);
  console.log(`\nOverall: ${totalPresent}/${totalAll} cells present (${((totalPresent / totalAll) * 100).toFixed(1)}%)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
