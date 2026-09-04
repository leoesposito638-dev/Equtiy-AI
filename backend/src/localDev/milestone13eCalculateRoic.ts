// ============================================================================
// Equity AI — Milestone 13E: compute and store invested_capital,
// effective_tax_rate, roic for all 30 demo companies via the real, extended
// calculateAndStoreFundamentalRatios() (unmodified signature — same
// companyTicker param already used for the Net Debt cash gate in 13C, which
// invested_capital deliberately does NOT use — see the doc comment).
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone13eCalculateRoic.ts
// ============================================================================

import { calculateAndStoreFundamentalRatios } from "../calculations/supabaseFundamentalRatiosRepo";
import { getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";

function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }

const TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

const NEW_METRICS = ["invested_capital", "effective_tax_rate", "roic"];

async function main() {
  console.log(`Equity AI — Milestone 13E: calculate ROIC-related metrics (30-company demo universe)\n`);

  const missingEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);

  const coverage = new Map<string, Set<string>>();

  for (const ticker of TICKERS) {
    const company = await getCompanyIdByTicker(ticker);
    if (!company) {
      console.log(`${ticker}: ❌ no companies row — SKIPPED.`);
      continue;
    }
    const outcomes = await calculateAndStoreFundamentalRatios(company.id, ticker);
    const newMetricOutcomes = outcomes.filter((o) => NEW_METRICS.includes(o.metricName));
    const stored = newMetricOutcomes.filter((o) => o.stored);
    const byMetric = new Map<string, number>();
    for (const o of newMetricOutcomes) byMetric.set(o.metricName, (byMetric.get(o.metricName) ?? 0) + 1);

    console.log(`${ticker.padEnd(6)} ROIC-metric rows: ${newMetricOutcomes.length} (${stored.length} new) — ${[...byMetric.entries()].map(([m, n]) => `${m}=${n}`).join(", ") || "none"}`);

    for (const o of newMetricOutcomes) {
      const c = coverage.get(o.metricName) ?? new Set<string>();
      c.add(ticker);
      coverage.set(o.metricName, c);
    }
  }

  console.log(`\n${"=".repeat(78)}\n30-COMPANY COVERAGE PER NEW METRIC (companies with >=1 real stored value)\n${"=".repeat(78)}`);
  for (const metric of NEW_METRICS) {
    const c = coverage.get(metric) ?? new Set<string>();
    console.log(`${metric.padEnd(20)} ${c.size}/30 — missing: ${TICKERS.filter((t) => !c.has(t)).join(", ") || "none"}`);
  }

  console.log(`\nDone.\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
