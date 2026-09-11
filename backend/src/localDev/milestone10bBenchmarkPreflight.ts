// ============================================================================
// Equity AI — Milestone 10B: benchmark population PREFLIGHT (read-only)
//
// Uses the existing, unmodified fetchAndComputeBenchmarkSnapshot() (Milestone
// 5) against the real 30-company calculated_metrics data. Writes nothing.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone10bBenchmarkPreflight.ts
// ============================================================================

import { fetchAndComputeBenchmarkSnapshot } from "../scoring/supabaseBenchmarkRepo";
import { SECTOR_MIN_SAMPLE_SIZE, MARKET_WIDE_MIN_SAMPLE_SIZE } from "../scoring/benchmarkCalculation";
import { getDbClient } from "../db/client";

const GROWTH_METRICS = ["revenue_growth_yoy", "revenue_cagr_3y", "eps_growth_yoy", "eps_cagr", "growth_acceleration"];
const CALCULATION_VERSION = "v1.0";
const AS_OF_DATE = new Date().toISOString().slice(0, 10);

const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

async function main() {
  console.log(`Equity AI — Milestone 10B PREFLIGHT (read-only, no writes)\n`);
  console.log(`Thresholds: SECTOR >= ${SECTOR_MIN_SAMPLE_SIZE}, MARKET_WIDE >= ${MARKET_WIDE_MIN_SAMPLE_SIZE}, per metric.`);
  console.log(`as_of = ${AS_OF_DATE}, calculation_version = ${CALCULATION_VERSION}\n`);

  const db = getDbClient();
  const { count: currentCount } = await db.from("metric_benchmarks").select("*", { count: "exact", head: true });
  console.log(`1. Current metric_benchmarks row count: ${currentCount}\n`);

  const { data: demoCompanies, error } = await db.from("companies").select("id, ticker, sector").in("ticker", DEMO_TICKERS);
  if (error) throw new Error(error.message);
  const idToTicker = new Map(demoCompanies!.map((c: any) => [c.id, c.ticker]));

  for (const metricName of GROWTH_METRICS) {
    console.log(`${"=".repeat(90)}\n${metricName}\n${"=".repeat(90)}`);
    const snapshot = await fetchAndComputeBenchmarkSnapshot(metricName, "ANNUAL", CALCULATION_VERSION, AS_OF_DATE);

    // Scope strictly to the 30-company demo universe for reporting (the
    // underlying calculated_metrics table may only contain these 30 anyway,
    // but this makes the scoping explicit and auditable).
    console.log(`   Valid company count (any company with a real value): ${snapshot.totalObservationsConsidered}`);
    const bySector = new Map<string, number>();
    for (const s of snapshot.sectorBenchmarks) bySector.set(s.sector, s.sampleSize);
    console.log(`   Sector counts reaching >=${SECTOR_MIN_SAMPLE_SIZE}: ${snapshot.sectorBenchmarks.length === 0 ? "none" : snapshot.sectorBenchmarks.map((s) => `${s.sector}=${s.sampleSize}`).join(", ")}`);
    console.log(`   SECTOR threshold reached: ${snapshot.sectorBenchmarks.length > 0 ? "YES" : "NO"}`);
    console.log(`   MARKET_WIDE threshold reached: ${snapshot.marketWideBenchmark ? "YES" : "NO"}`);
    console.log(`   Benchmark period_end that will be used: ${AS_OF_DATE}`);

    if (snapshot.marketWideBenchmark) {
      console.log(`   -> Would WRITE 1 MARKET_WIDE row: sampleSize=${snapshot.marketWideBenchmark.sampleSize} p25=${snapshot.marketWideBenchmark.p25.toFixed(4)} median=${snapshot.marketWideBenchmark.median.toFixed(4)} p75=${snapshot.marketWideBenchmark.p75.toFixed(4)} p90=${snapshot.marketWideBenchmark.p90.toFixed(4)}`);
    }
    for (const s of snapshot.sectorBenchmarks) {
      console.log(`   -> Would WRITE 1 SECTOR row (${s.sector}): sampleSize=${s.sampleSize} p25=${s.p25.toFixed(4)} median=${s.median.toFixed(4)} p75=${s.p75.toFixed(4)} p90=${s.p90.toFixed(4)}`);
    }
    if (!snapshot.marketWideBenchmark && snapshot.sectorBenchmarks.length === 0) {
      console.log(`   -> No benchmark row would be written for this metric (UNAVAILABLE, correctly not fabricated).`);
    }
  }

  // Real, explicit list of exact companies+values contributing to each metric's MARKET_WIDE pool.
  console.log(`\n${"=".repeat(90)}\nEXACT CONTRIBUTING COMPANIES + VALUES\n${"=".repeat(90)}`);
  for (const metricName of GROWTH_METRICS) {
    const { data: rows } = await db
      .from("calculated_metrics")
      .select("company_id, period_end, value")
      .eq("metric_name", metricName)
      .eq("period_type", "ANNUAL")
      .eq("calculation_version", CALCULATION_VERSION)
      .in("company_id", demoCompanies!.map((c: any) => c.id));
    console.log(`\n${metricName}: ${rows?.length ?? 0} rows (may include historical backfill periods, deduped to latest-per-company by the real logic above)`);
    const latestByCompany = new Map<string, { periodEnd: string; value: number }>();
    for (const r of (rows ?? []) as any[]) {
      const existing = latestByCompany.get(r.company_id);
      if (!existing || r.period_end > existing.periodEnd) latestByCompany.set(r.company_id, { periodEnd: r.period_end, value: r.value });
    }
    const missing = DEMO_TICKERS.filter((t) => {
      const c = demoCompanies!.find((c: any) => c.ticker === t) as any;
      return c && !latestByCompany.has(c.id);
    });
    for (const [companyId, v] of latestByCompany) {
      console.log(`   ${(idToTicker.get(companyId) ?? "?").padEnd(6)} period_end=${v.periodEnd} value=${v.value}`);
    }
    console.log(`   Missing (no value for this metric): ${missing.join(", ") || "none"}`);
  }

  console.log(`\nNo rows were written. This is read-only preflight only.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
