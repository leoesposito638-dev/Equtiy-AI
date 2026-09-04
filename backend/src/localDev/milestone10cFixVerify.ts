// ============================================================================
// Equity AI — Milestone 10C-FIX: read-only verification that the real,
// fixed supabaseScoringRepo.getBenchmarks() now correctly returns the 4 real
// MARKET_WIDE benchmarks for the 30-company demo universe. NO writes.
// ============================================================================

import { buildSupabaseScoringRepo } from "../scoring/supabaseScoringRepo";
import { getDbClient } from "../db/client";

const GROWTH_METRICS = ["revenue_growth_yoy", "revenue_cagr_3y", "eps_growth_yoy", "eps_cagr", "growth_acceleration"];
const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

async function main() {
  const db = getDbClient();
  const repo = buildSupabaseScoringRepo();

  const { data: rawBenchmarks, error } = await db.from("metric_benchmarks").select("*");
  if (error) throw new Error(error.message);
  console.log(`Real metric_benchmarks rows (${rawBenchmarks!.length}):`);
  for (const r of rawBenchmarks! as any[]) {
    console.log(`   ${r.metric_name} | ${r.benchmark_type} | sector=${r.sector ?? "NULL"} | version=${r.benchmark_version} | period_end=${r.period_end} | median=${r.median}`);
  }

  const { data: companies, error: cErr } = await db.from("companies").select("id, ticker, sector").in("ticker", DEMO_TICKERS);
  if (cErr) throw new Error(cErr.message);
  if (companies!.length !== 30) throw new Error(`Expected 30 companies, found ${companies!.length}`);

  console.log(`\n${"=".repeat(100)}\nPER-COMPANY BENCHMARK RESOLUTION (real getBenchmarks() calls)\n${"=".repeat(100)}`);

  const tally: Record<string, { marketWide: number; sector: number; none: number }> = {};
  for (const m of GROWTH_METRICS) tally[m] = { marketWide: 0, sector: 0, none: 0 };

  for (const ticker of DEMO_TICKERS) {
    const company = companies!.find((c: any) => c.ticker === ticker) as any;
    const benchmarks = await repo.getBenchmarks(company.sector, GROWTH_METRICS);
    const line: string[] = [];
    for (const m of GROWTH_METRICS) {
      const b = benchmarks.get(m);
      if (!b) {
        line.push(`${m}=NONE`);
        tally[m].none++;
        continue;
      }
      const tier = b.sector ? "SECTOR" : "MARKET_WIDE";
      const rawMatch = (rawBenchmarks as any[]).find(
        (r) => r.metric_name === m && (tier === "SECTOR" ? r.sector === company.sector : r.sector === null)
      );
      const valuesMatch = rawMatch && rawMatch.p25 === b.p25 && rawMatch.median === b.median && rawMatch.p75 === b.p75 && rawMatch.p90 === b.p90 && rawMatch.sample_size === b.sampleSize;
      line.push(`${m}=${tier}${valuesMatch ? "" : " ❌MISMATCH"}`);
      if (tier === "SECTOR") tally[m].sector++; else tally[m].marketWide++;
    }
    console.log(`${ticker.padEnd(6)} sector=${(company.sector as string).padEnd(24)} ${line.join(" | ")}`);
  }

  console.log(`\n${"=".repeat(100)}\nTALLY ACROSS ALL 30 COMPANIES\n${"=".repeat(100)}`);
  for (const m of GROWTH_METRICS) {
    console.log(`${m.padEnd(22)} MARKET_WIDE=${tally[m].marketWide} SECTOR=${tally[m].sector} NONE=${tally[m].none}`);
  }

  console.log(`\nNo writes were performed. This is read-only verification only.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
