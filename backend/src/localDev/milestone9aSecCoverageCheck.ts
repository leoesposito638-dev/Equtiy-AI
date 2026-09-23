// ============================================================================
// Equity AI — Milestone 9A: SEC coverage live verification (READ-ONLY)
//
// For each candidate ticker: resolves CIK via SEC's own authoritative
// ticker->CIK mapping (same source secEdgarAdapter.ts uses), then calls the
// REAL, unmodified SecEdgarAdapter.getIncomeStatement() directly (SEC only,
// not the full resolver — this milestone is specifically about SEC
// coverage). No Supabase reads/writes, no company creation, no ingestion.
//
// Run with:
//   npm run milestone9a:sec-check
// ============================================================================

import { SecEdgarAdapter } from "../providers/adapters/secEdgarAdapter";

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

const CANDIDATES = [
  // Already real-SEC-ingested in this project (recorded for completeness, not re-verified as "new")
  // NVDA, TXN, IBM handled separately below.
  "AAPL", "MSFT", "GOOGL", "META", "AMZN", "TSLA", "CSCO", // proven via FMP only so far in this project
  "ORCL", "QCOM", "AMAT", // Tech alternates
  "JPM", "BAC", "GS", "V", "MA", // Financials
  "JNJ", "ABT", "UNH", "LLY", "MRK", // Healthcare
  "CAT", "HON", "UNP", // Industrials
  "PG", "KO", "COST", // Staples (COST as an alternate)
  "XOM", "CVX", // Energy
  "VZ", "HD", "MCD", // Comm Services / Consumer Discretionary alternates
];

const ALREADY_SEC_INGESTED = ["NVDA", "TXN", "IBM"];

const SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";

function pad10(cik: number): string {
  return String(cik).padStart(10, "0");
}

async function main() {
  console.log(`Equity AI — Milestone 9A: SEC coverage live verification (read-only)\n`);

  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) fail(`Missing required environment variable: SEC_EDGAR_USER_AGENT.`);

  // Resolve CIKs directly for reporting purposes (read-only, same public
  // source the adapter itself uses) — lets us report a CIK even for a
  // ticker that ultimately fails the facts lookup.
  const tickerMapRes = await fetch(SEC_TICKER_MAP_URL, { headers: { "User-Agent": userAgent } });
  if (!tickerMapRes.ok) fail(`SEC ticker map fetch failed: HTTP ${tickerMapRes.status}`);
  const tickerMapBody = (await tickerMapRes.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
  const tickerToCik = new Map<string, { cik: string; title: string }>();
  for (const entry of Object.values(tickerMapBody)) {
    if (entry?.ticker) tickerToCik.set(entry.ticker.toUpperCase(), { cik: pad10(entry.cik_str), title: entry.title });
  }

  const adapter = new SecEdgarAdapter(userAgent);

  const results: Array<{
    ticker: string;
    cik: string | null;
    title: string | null;
    status: string;
    revenue: boolean;
    netIncome: boolean;
    eps: boolean;
    periods: number;
    revenueTag: string | null;
    unavailableReason: string | null;
  }> = [];

  for (const ticker of CANDIDATES) {
    const mapEntry = tickerToCik.get(ticker);
    console.log(`\n--- ${ticker} ---`);
    console.log(`   CIK (from SEC's authoritative mapping): ${mapEntry?.cik ?? "NOT FOUND"} ${mapEntry ? `(title: "${mapEntry.title}")` : ""}`);

    const result = await adapter.getIncomeStatement({ ticker }, "ANNUAL");
    if (result.status !== "available" || !result.data) {
      console.log(`   status=unavailable reason=${result.unavailableReason}`);
      results.push({
        ticker, cik: mapEntry?.cik ?? null, title: mapEntry?.title ?? null, status: "unavailable",
        revenue: false, netIncome: false, eps: false, periods: 0, revenueTag: null,
        unavailableReason: result.unavailableReason ?? null,
      });
      continue;
    }

    const revenueItems = result.data.filter((i) => i.metricName === "revenue");
    const netIncomeItems = result.data.filter((i) => i.metricName === "net_income");
    const epsItems = result.data.filter((i) => i.metricName === "eps");
    const periodsAllThree = new Set(revenueItems.map((i) => i.periodEnd)).size;
    console.log(`   status=available revenue_periods=${revenueItems.length} net_income_periods=${netIncomeItems.length} eps_periods=${epsItems.length}`);
    console.log(`   revenue tag: ${revenueItems[0]?.metricIdentifier ?? "n/a"}`);
    if (revenueItems.length > 0) {
      console.log(`   period ends: ${revenueItems.map((i) => i.periodEnd).sort().join(", ")}`);
    }

    results.push({
      ticker, cik: mapEntry?.cik ?? null, title: mapEntry?.title ?? null, status: "available",
      revenue: revenueItems.length > 0, netIncome: netIncomeItems.length > 0, eps: epsItems.length > 0,
      periods: periodsAllThree, revenueTag: revenueItems[0]?.metricIdentifier ?? null, unavailableReason: null,
    });
  }

  console.log(`\n${"=".repeat(100)}\nSUMMARY\n${"=".repeat(100)}`);
  console.log(
    "ticker".padEnd(8) + "status".padEnd(12) + "rev".padEnd(6) + "ni".padEnd(6) + "eps".padEnd(6) + "periods".padEnd(9) + "cik".padEnd(12) + "revenueTag"
  );
  for (const r of results) {
    console.log(
      r.ticker.padEnd(8) +
        r.status.padEnd(12) +
        (r.revenue ? "Y" : "N").padEnd(6) +
        (r.netIncome ? "Y" : "N").padEnd(6) +
        (r.eps ? "Y" : "N").padEnd(6) +
        String(r.periods).padEnd(9) +
        (r.cik ?? "?").padEnd(12) +
        (r.revenueTag ?? "")
    );
  }
  const fullyGood = results.filter((r) => r.status === "available" && r.revenue && r.netIncome && r.eps && r.periods >= 4);
  const partial = results.filter((r) => r.status === "available" && !(r.revenue && r.netIncome && r.eps && r.periods >= 4));
  const failed = results.filter((r) => r.status !== "available");
  console.log(`\nFull coverage (revenue+net_income+eps, >=4 periods): ${fullyGood.length} — ${fullyGood.map((r) => r.ticker).join(", ")}`);
  console.log(`Partial coverage: ${partial.length} — ${partial.map((r) => r.ticker).join(", ")}`);
  console.log(`Unavailable: ${failed.length} — ${failed.map((r) => r.ticker).join(", ")}`);
  console.log(`\nAlready proven via real SEC ingestion in this project (not re-checked here): ${ALREADY_SEC_INGESTED.join(", ")}`);

  console.log(`\n${"=".repeat(100)}\nDone. No Supabase reads/writes. No companies created. No ingestion pipeline run.\n${"=".repeat(100)}\n`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).stack ?? (e as Error).message}`));
