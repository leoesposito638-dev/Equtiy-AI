// ============================================================================
// Equity AI — Milestone 10B: benchmark PREFLIGHT + WRITE, scoped to exactly
// the 30-company US demo universe.
//
// The existing fetchAndComputeBenchmarkSnapshot() (Milestone 5,
// supabaseBenchmarkRepo.ts) queries calculated_metrics with NO company
// filter — fine for a general-purpose function, but this milestone requires
// scoping to exactly the 30 demo companies (4 legacy non-demo companies —
// AAPL, META, MSFT, CSCO — still carry old FMP-derived growth metrics from
// Milestone 6B and would otherwise leak into the pool, confirmed live: 34
// companies / Technology=12 instead of the correct 30 / Technology=8).
//
// Rather than modify the protected, already-approved benchmarkCalculation.ts
// or supabaseBenchmarkRepo.ts, this script does its OWN company-scoped
// fetch, then feeds the result into the exact same, unmodified, exported
// pure functions (selectLatestPerCompanyAsOf, computeBenchmarkTiers) and the
// exact same, unmodified insertBenchmarkSnapshotRows() writer.
//
// Two modes:
//   npx ts-node --transpile-only src/localDev/milestone10bBenchmarkPopulate.ts --preflight
//   npx ts-node --transpile-only src/localDev/milestone10bBenchmarkPopulate.ts --write
// ============================================================================

import { getDbClient } from "../db/client";
import {
  selectLatestPerCompanyAsOf,
  computeBenchmarkTiers,
  SECTOR_MIN_SAMPLE_SIZE,
  MARKET_WIDE_MIN_SAMPLE_SIZE,
  type CompanyMetricObservationWithSector,
} from "../scoring/benchmarkCalculation";
import { insertBenchmarkSnapshotRows, type BenchmarkSnapshotRow } from "../scoring/supabaseBenchmarkRepo";
import type { PeriodType } from "../types/domain";

const GROWTH_METRICS = ["revenue_growth_yoy", "revenue_cagr_3y", "eps_growth_yoy", "eps_cagr", "growth_acceleration"];
const CALCULATION_VERSION = "v1.0";
const BENCHMARK_VERSION = "v1.0";
const AS_OF_DATE = new Date().toISOString().slice(0, 10);

const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

async function fetchScopedObservations(
  metricName: string,
  periodType: PeriodType,
  calculationVersion: string,
  companyIds: string[],
  sectorByCompany: Map<string, string | undefined>
): Promise<CompanyMetricObservationWithSector[]> {
  const db = getDbClient();
  const { data, error } = await db
    .from("calculated_metrics")
    .select("company_id, period_end, value")
    .eq("metric_name", metricName)
    .eq("period_type", periodType)
    .eq("calculation_version", calculationVersion)
    .in("company_id", companyIds); // <-- the scoping the existing general-purpose function lacks
  if (error) throw new Error(`calculated_metrics query failed for ${metricName}: ${error.message}`);
  return (data ?? [])
    .filter((r: any) => r.value !== null)
    .map((r: any) => ({ companyId: r.company_id, periodEnd: r.period_end, value: r.value as number, sector: sectorByCompany.get(r.company_id) }));
}

async function main() {
  const mode = process.argv.includes("--write") ? "write" : "preflight";
  console.log(`Equity AI — Milestone 10B benchmark ${mode.toUpperCase()} (scoped to the 30-company demo universe)\n`);
  console.log(`Thresholds: SECTOR >= ${SECTOR_MIN_SAMPLE_SIZE}, MARKET_WIDE >= ${MARKET_WIDE_MIN_SAMPLE_SIZE}, per metric.`);
  console.log(`as_of = ${AS_OF_DATE}, calculation_version = ${CALCULATION_VERSION}, benchmark_version = ${BENCHMARK_VERSION}\n`);

  const db = getDbClient();
  const { count: currentCount } = await db.from("metric_benchmarks").select("*", { count: "exact", head: true });
  console.log(`Current metric_benchmarks row count: ${currentCount}\n`);

  const { data: demoCompanies, error } = await db.from("companies").select("id, ticker, sector").in("ticker", DEMO_TICKERS);
  if (error) throw new Error(error.message);
  if (demoCompanies!.length !== 30) throw new Error(`Expected exactly 30 demo companies, found ${demoCompanies!.length}. STOPPING.`);
  const companyIds = demoCompanies!.map((c: any) => c.id);
  const idToTicker = new Map(demoCompanies!.map((c: any) => [c.id, c.ticker]));
  const sectorByCompany = new Map(demoCompanies!.map((c: any) => [c.id, c.sector ?? undefined]));

  const bySectorCount = new Map<string, number>();
  for (const c of demoCompanies! as any[]) bySectorCount.set(c.sector, (bySectorCount.get(c.sector) ?? 0) + 1);
  console.log(`30-company universe sector distribution: ${[...bySectorCount.entries()].map(([s, n]) => `${s}=${n}`).join(", ")}\n`);

  const rowsToWrite: BenchmarkSnapshotRow[] = [];

  for (const metricName of GROWTH_METRICS) {
    console.log(`${"=".repeat(90)}\n${metricName}\n${"=".repeat(90)}`);
    const rawObservations = await fetchScopedObservations(metricName, "ANNUAL", CALCULATION_VERSION, companyIds, sectorByCompany);
    const latestPerCompany = selectLatestPerCompanyAsOf(rawObservations, AS_OF_DATE);
    const computation = computeBenchmarkTiers(latestPerCompany);

    console.log(`   Valid company count (within the 30-company universe): ${latestPerCompany.length}`);
    const missing = DEMO_TICKERS.filter((t) => {
      const c = demoCompanies!.find((c: any) => c.ticker === t) as any;
      return !latestPerCompany.some((o) => o.companyId === c.id);
    });
    console.log(`   Missing (no value): ${missing.join(", ") || "none"}`);
    console.log(`   Sector counts: ${[...bySectorCount.keys()].map((s) => `${s}=${latestPerCompany.filter((o) => o.sector === s).length}`).join(", ")}`);
    console.log(`   SECTOR threshold reached: ${computation.sectorBenchmarks.length > 0 ? `YES (${computation.sectorBenchmarks.map((s) => s.sector).join(", ")})` : "NO"}`);
    console.log(`   MARKET_WIDE threshold reached: ${computation.marketWideBenchmark ? "YES" : "NO"}`);
    console.log(`   Contributing companies: ${latestPerCompany.map((o) => `${idToTicker.get(o.companyId)}=${o.value.toFixed(4)}`).join(", ")}`);

    if (computation.marketWideBenchmark) {
      const b = computation.marketWideBenchmark;
      console.log(`   -> MARKET_WIDE: n=${b.sampleSize} p25=${b.p25.toFixed(4)} median=${b.median.toFixed(4)} p75=${b.p75.toFixed(4)} p90=${b.p90.toFixed(4)}`);
      rowsToWrite.push({ metricName, benchmarkType: "MARKET_WIDE", sector: null, periodEnd: AS_OF_DATE, benchmarkVersion: BENCHMARK_VERSION, sampleSize: b.sampleSize, p25: b.p25, median: b.median, p75: b.p75, p90: b.p90 });
    }
    for (const s of computation.sectorBenchmarks) {
      console.log(`   -> SECTOR(${s.sector}): n=${s.sampleSize} p25=${s.p25.toFixed(4)} median=${s.median.toFixed(4)} p75=${s.p75.toFixed(4)} p90=${s.p90.toFixed(4)}`);
      rowsToWrite.push({ metricName, benchmarkType: "SECTOR", sector: s.sector, periodEnd: AS_OF_DATE, benchmarkVersion: BENCHMARK_VERSION, sampleSize: s.sampleSize, p25: s.p25, median: s.median, p75: s.p75, p90: s.p90 });
    }
    if (!computation.marketWideBenchmark && computation.sectorBenchmarks.length === 0) {
      console.log(`   -> No benchmark row for this metric (UNAVAILABLE, correctly not fabricated).`);
    }
    console.log();
  }

  console.log(`${"=".repeat(90)}\nTOTAL ROWS ${mode === "write" ? "TO WRITE" : "THAT WOULD BE WRITTEN"}: ${rowsToWrite.length}\n${"=".repeat(90)}`);
  for (const r of rowsToWrite) console.log(`   ${r.metricName.padEnd(22)} ${r.benchmarkType.padEnd(12)} sector=${r.sector ?? "∅"} n=${r.sampleSize}`);

  if (mode === "write") {
    console.log(`\nWriting ${rowsToWrite.length} rows to metric_benchmarks...`);
    await insertBenchmarkSnapshotRows(rowsToWrite);
    console.log(`Done writing.`);
  } else {
    console.log(`\nPREFLIGHT ONLY — no rows written. Re-run with --write to actually populate metric_benchmarks.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
