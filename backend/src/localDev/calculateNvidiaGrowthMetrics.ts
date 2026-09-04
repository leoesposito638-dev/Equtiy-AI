// ============================================================================
// Equity AI — Milestone 3A: GROWTH calculated metrics for NVDA, real data
//
// Reads NVDA's real financial_metrics (revenue/eps, ingested in Milestone 2)
// from Supabase, computes the 5 GROWTH metrics per
// backend/docs/growth-metrics-v1.0-spec.md, writes calculated_metrics rows
// for whichever ones are available, and prints exactly what happened for
// every metric — including the ones that stayed unavailable and why.
//
// Requires the same real credentials as testFmpNvidiaRevenue.ts
// (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) and that Milestone 2's ingestion
// has already run for NVDA. Does NOT call FMP.
//
// Run with:
//   npm run calc:growth-nvda
// ============================================================================

import { getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";
import { calculateAndStoreGrowthMetrics } from "../calculations/supabaseGrowthMetricsRepo";

const TICKER = "NVDA";

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

async function main() {
  console.log(`Equity AI — GROWTH calculated metrics: ${TICKER}\n`);

  const missingEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    fail(`Missing required environment variable(s): ${missingEnv.join(", ")}. See .env.example.`);
  }

  const company = await getCompanyIdByTicker(TICKER);
  if (!company) {
    fail(`No 'companies' row found for ticker='${TICKER}'.`);
  }
  console.log(`1. Resolved ${TICKER} -> company_id ${company!.id}\n`);

  console.log(`2. Reading financial_metrics (revenue, eps) and computing all 5 GROWTH metrics...\n`);
  const outcomes = await calculateAndStoreGrowthMetrics(company!.id);

  console.log(`3. Results:\n`);
  for (const o of outcomes) {
    if (o.result.value !== null) {
      const storedNote = o.stored ? `calculated_metrics.id=${o.stored.id}` : `NOT STORED — ${o.storeError}`;
      console.log(`   ✅ ${o.metricName.padEnd(22)} = ${o.result.value.toFixed(4)}   (${storedNote})`);
    } else {
      console.log(`   ⚪ ${o.metricName.padEnd(22)} = unavailable   (${o.result.reason})`);
    }
  }

  const available = outcomes.filter((o) => o.result.value !== null && o.stored).length;
  const unavailable = outcomes.filter((o) => o.result.value === null).length;
  console.log(`\n4. Summary: ${available}/5 available and stored, ${unavailable}/5 unavailable.\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
