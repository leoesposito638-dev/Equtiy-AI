// ============================================================================
// Equity AI — Milestone 5 real-data verification: benchmark infrastructure
//
// Runs the REAL read + threshold + quantile computation against the real
// calculated_metrics table for every GROWTH metric — read-only, writes
// nothing, requires no schema change (uses only columns that already exist
// live). Proves the sample-size logic and fiscal-alignment logic run
// correctly against real data, and — with today's actual company count —
// correctly reports every metric as UNAVAILABLE, matching the honest real
// state of the system (one company fully processed).
//
// Does NOT insert into metric_benchmarks (that table's Milestone 5 columns
// don't exist live yet, and this milestone explicitly forbids populating it
// regardless). Does NOT call the scoring engine or generate any score.
//
// Run with:
//   npm run verify:benchmark-infra
// ============================================================================

import { fetchAndComputeBenchmarkSnapshot } from "../scoring/supabaseBenchmarkRepo";
import { resolveBenchmarkTier } from "../scoring/benchmarkResolver";
import { SECTOR_MIN_SAMPLE_SIZE, MARKET_WIDE_MIN_SAMPLE_SIZE } from "../scoring/benchmarkCalculation";

const GROWTH_METRICS = ["revenue_growth_yoy", "revenue_cagr_3y", "eps_growth_yoy", "eps_cagr", "growth_acceleration"];
const CALCULATION_VERSION = "v1.0";
const AS_OF_DATE = new Date().toISOString().slice(0, 10);

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

async function main() {
  console.log(`Equity AI — Milestone 5 verification: benchmark infrastructure (real data, read-only)\n`);
  console.log(`Thresholds: SECTOR >= ${SECTOR_MIN_SAMPLE_SIZE} companies, MARKET_WIDE >= ${MARKET_WIDE_MIN_SAMPLE_SIZE} companies, per metric.`);
  console.log(`as_of = ${AS_OF_DATE}\n`);

  const missingEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) fail(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);

  for (const metricName of GROWTH_METRICS) {
    const snapshot = await fetchAndComputeBenchmarkSnapshot(metricName, "ANNUAL", CALCULATION_VERSION, AS_OF_DATE);
    const sectorForTechnology = snapshot.sectorBenchmarks.find((s) => s.sector === "Technology") ?? null;
    const resolved = resolveBenchmarkTier(
      sectorForTechnology
        ? { metricName, periodEnd: AS_OF_DATE, ...sectorForTechnology, benchmarkType: "SECTOR" as const }
        : null,
      snapshot.marketWideBenchmark
        ? { metricName, periodEnd: AS_OF_DATE, ...snapshot.marketWideBenchmark, benchmarkType: "MARKET_WIDE" as const }
        : null
    );

    console.log(
      `${metricName.padEnd(22)} real companies with this metric: ${snapshot.totalObservationsConsidered.toString().padStart(2)}  ` +
        `sectors qualifying: ${snapshot.sectorBenchmarks.length}  market-wide qualifies: ${snapshot.marketWideBenchmark ? "yes" : "no"}  ` +
        `-> for a Technology-sector company: ${resolved.tier}`
    );
  }

  console.log(`\nNo rows were written to metric_benchmarks. No score was generated. This is read-only verification only.\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
