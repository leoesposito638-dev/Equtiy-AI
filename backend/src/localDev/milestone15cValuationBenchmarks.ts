// ============================================================================
// Equity AI — Milestone 15C Part 1: populate metric_benchmarks for the 6
// valuation metrics, using the EXACT existing benchmark pipeline
// (fetchAndComputeBenchmarkSnapshot / insertBenchmarkSnapshotRows,
// SECTOR_MIN_SAMPLE_SIZE=10, MARKET_WIDE_MIN_SAMPLE_SIZE=30) — no new
// thresholds, no new logic. Also reports the per-sector company count for
// each metric's real observations, regardless of whether that grouping
// clears the SECTOR threshold, per the ticket's explicit "flag, don't fix"
// instruction about cross-sector valuation comparison.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone15cValuationBenchmarks.ts
// ============================================================================

import { fetchAndComputeBenchmarkSnapshot, insertBenchmarkSnapshotRows } from "../scoring/supabaseBenchmarkRepo";
import { SECTOR_MIN_SAMPLE_SIZE, MARKET_WIDE_MIN_SAMPLE_SIZE } from "../scoring/benchmarkCalculation";
import { getDbClient } from "../db/client";
import { DEMO_TICKERS } from "../config/demoUniverse";

const AS_OF_DATE = new Date().toISOString().slice(0, 10);
const BENCHMARK_VERSION = "v1.0";

const METRICS: Array<{ name: string; periodType: "ANNUAL" | "TTM"; calculationVersion: string; direction: "LOWER_IS_BETTER" | "HIGHER_IS_BETTER" }> = [
  { name: "pe", periodType: "TTM", calculationVersion: "v1.0-fmp", direction: "LOWER_IS_BETTER" },
  { name: "forward_pe", periodType: "ANNUAL", calculationVersion: "v1.0-fmp-forward", direction: "LOWER_IS_BETTER" },
  { name: "ev_ebitda", periodType: "TTM", calculationVersion: "v1.0-fmp", direction: "LOWER_IS_BETTER" },
  { name: "ev_sales", periodType: "TTM", calculationVersion: "v1.0-fmp", direction: "LOWER_IS_BETTER" },
  { name: "price_to_fcf", periodType: "TTM", calculationVersion: "v1.0-fmp", direction: "LOWER_IS_BETTER" },
  { name: "fcf_yield", periodType: "TTM", calculationVersion: "v1.0-fmp", direction: "HIGHER_IS_BETTER" },
];

async function main() {
  const db = getDbClient();
  console.log(`Equity AI — Milestone 15C Part 1: valuation benchmark population\n`);
  console.log(`as_of=${AS_OF_DATE}, benchmark_version=${BENCHMARK_VERSION}`);
  console.log(`SECTOR_MIN_SAMPLE_SIZE=${SECTOR_MIN_SAMPLE_SIZE}, MARKET_WIDE_MIN_SAMPLE_SIZE=${MARKET_WIDE_MIN_SAMPLE_SIZE}\n`);

  const { data: companies } = await db.from("companies").select("id, ticker, sector").in("ticker", DEMO_TICKERS);
  const sectorByCompanyId = new Map((companies as any[]).map((c) => [c.id, c.sector as string | null]));

  for (const metric of METRICS) {
    console.log(`${"=".repeat(90)}\n${metric.name} (period_type=${metric.periodType}, direction=${metric.direction})\n${"=".repeat(90)}`);

    // Real per-sector breakdown of raw observations, regardless of threshold.
    const { data: rawRows } = await db
      .from("calculated_metrics")
      .select("company_id, value")
      .eq("metric_name", metric.name)
      .eq("period_type", metric.periodType)
      .eq("calculation_version", metric.calculationVersion);
    const bySector = new Map<string, number>();
    for (const r of rawRows as any[]) {
      if (r.value === null) continue;
      const sector = sectorByCompanyId.get(r.company_id) ?? "(unknown)";
      bySector.set(sector, (bySector.get(sector) ?? 0) + 1);
    }
    console.log(`Raw observations: ${(rawRows as any[]).filter((r) => r.value !== null).length}`);
    console.log(`Per-sector breakdown: ${[...bySector.entries()].map(([s, n]) => `${s}=${n}`).join(", ") || "(none)"}`);

    const snapshot = await fetchAndComputeBenchmarkSnapshot(metric.name, metric.periodType, metric.calculationVersion, AS_OF_DATE);
    console.log(`totalObservationsConsidered (fiscal-aligned, one-per-company): ${snapshot.totalObservationsConsidered}`);
    console.log(`Sector benchmarks qualifying (>= ${SECTOR_MIN_SAMPLE_SIZE}): ${snapshot.sectorBenchmarks.length}`);
    for (const s of snapshot.sectorBenchmarks) console.log(`   ${s.sector}: n=${s.sampleSize} p25=${s.p25.toFixed(2)} median=${s.median.toFixed(2)} p75=${s.p75.toFixed(2)} p90=${s.p90.toFixed(2)}`);
    console.log(`Market-wide benchmark qualifying (>= ${MARKET_WIDE_MIN_SAMPLE_SIZE}): ${snapshot.marketWideBenchmark ? "YES" : "NO"}`);
    if (snapshot.marketWideBenchmark) {
      const b = snapshot.marketWideBenchmark;
      console.log(`   n=${b.sampleSize} p25=${b.p25.toFixed(2)} median=${b.median.toFixed(2)} p75=${b.p75.toFixed(2)} p90=${b.p90.toFixed(2)}`);
    }

    const rowsToWrite: Array<Parameters<typeof insertBenchmarkSnapshotRows>[0][number]> = [];
    for (const s of snapshot.sectorBenchmarks) {
      rowsToWrite.push({ metricName: metric.name, benchmarkType: "SECTOR", sector: s.sector, periodEnd: AS_OF_DATE, benchmarkVersion: BENCHMARK_VERSION, sampleSize: s.sampleSize, p25: s.p25, median: s.median, p75: s.p75, p90: s.p90 });
    }
    if (snapshot.marketWideBenchmark) {
      const b = snapshot.marketWideBenchmark;
      rowsToWrite.push({ metricName: metric.name, benchmarkType: "MARKET_WIDE", sector: null, periodEnd: AS_OF_DATE, benchmarkVersion: BENCHMARK_VERSION, sampleSize: b.sampleSize, p25: b.p25, median: b.median, p75: b.p75, p90: b.p90 });
    }
    if (rowsToWrite.length > 0) {
      await insertBenchmarkSnapshotRows(rowsToWrite);
      console.log(`-> Wrote ${rowsToWrite.length} row(s) to metric_benchmarks.`);
    } else {
      console.log(`-> No row written — neither threshold met with real data. Never fabricated.`);
    }
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
