// ============================================================================
// Equity AI — Milestone 12B Phase 5/6/7: compute and store the new
// PROFITABILITY / FINANCIAL_HEALTH / COMPETITIVE_ADVANTAGE ratio metrics for
// all 30 demo companies, from the real financial_metrics just ingested by
// milestone12bIngestBalanceCashFlow.ts. Real production function
// (calculateAndStoreFundamentalRatios), unmodified — this script is only the
// per-company driver + reporting.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone12bCalculateFundamentalRatios.ts
// ============================================================================

import { calculateAndStoreFundamentalRatios } from "../calculations/supabaseFundamentalRatiosRepo";
import { getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";

function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }

const TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

async function main() {
  console.log(`Equity AI — Milestone 12B: calculate fundamental ratio metrics (30-company demo universe)\n`);

  const missingEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);

  const coverage = new Map<string, { stored: number; companies: Set<string> }>();

  for (const ticker of TICKERS) {
    const company = await getCompanyIdByTicker(ticker);
    if (!company) {
      console.log(`${ticker}: ❌ no companies row — SKIPPED.`);
      continue;
    }
    const outcomes = await calculateAndStoreFundamentalRatios(company.id);
    const stored = outcomes.filter((o) => o.stored);
    const byMetric = new Map<string, number>();
    for (const o of stored) byMetric.set(o.metricName, (byMetric.get(o.metricName) ?? 0) + 1);

    console.log(`${ticker}: ${stored.length} rows stored (${outcomes.length - stored.length} already existed) — ${[...byMetric.entries()].map(([m, n]) => `${m}=${n}`).join(", ") || "none"}`);

    for (const o of outcomes) {
      const c = coverage.get(o.metricName) ?? { stored: 0, companies: new Set<string>() };
      c.companies.add(ticker);
      coverage.set(o.metricName, c);
    }
  }

  console.log(`\n${"=".repeat(78)}\n30-COMPANY COVERAGE PER METRIC (companies with >=1 real stored value)\n${"=".repeat(78)}`);
  for (const [metric, c] of [...coverage.entries()].sort()) {
    console.log(`${metric.padEnd(22)} ${c.companies.size}/30 — missing: ${TICKERS.filter((t) => !c.companies.has(t)).join(", ") || "none"}`);
  }

  console.log(`\nDone.\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
