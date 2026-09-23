// ============================================================================
// Equity AI — Milestone 9B: live read-only verification of the revenue
// concept-selection fix (SecEdgarAdapter.fetchAnnualRevenue). No writes, no
// Supabase, no ingestIncomeStatement — direct, real calls to
// SecEdgarAdapter.getIncomeStatement() for the 11 companies confirmed stale
// in Milestone 9A, plus a regression check on NVDA/TXN/IBM.
//
// Run with:
//   npm run milestone9b:live-verify
// ============================================================================

import { SecEdgarAdapter } from "../providers/adapters/secEdgarAdapter";

function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }

const STALE_COMPANIES = ["AAPL", "MSFT", "META", "CSCO", "AMAT", "HON", "UNP", "HD", "AVGO", "WFC", "MS"];
const REGRESSION_COMPANIES = ["NVDA", "TXN", "IBM"];

async function check(adapter: SecEdgarAdapter, ticker: string) {
  const result = await adapter.getIncomeStatement({ ticker }, "ANNUAL");
  if (result.status !== "available" || !result.data) {
    console.log(`${ticker}: UNAVAILABLE — ${result.unavailableReason}`);
    return;
  }
  const rev = result.data.filter((i) => i.metricName === "revenue").sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
  const mostRecent = rev.at(-1)?.periodEnd;
  const oldest = rev[0]?.periodEnd;
  const concept = rev[0]?.metricIdentifier;
  const now = new Date();
  const mostRecentYear = mostRecent ? parseInt(mostRecent.slice(0, 4), 10) : 0;
  const isCurrent = mostRecentYear >= now.getFullYear() - 2;
  console.log(
    `${ticker.padEnd(6)} status=available observations=${rev.length} mostRecent=${mostRecent} oldest=${oldest} concept=${concept} current=${isCurrent ? "YES" : "NO"} usable4periods=${rev.length >= 4 ? "YES" : "NO"}`
  );
  console.log(`       all periods: ${rev.map((r) => r.periodEnd).join(", ")}`);
}

async function main() {
  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) fail("Missing SEC_EDGAR_USER_AGENT");
  const adapter = new SecEdgarAdapter(userAgent);

  console.log("=== PREVIOUSLY STALE COMPANIES ===");
  for (const t of STALE_COMPANIES) await check(adapter, t);

  console.log("\n=== REGRESSION CHECK (must remain current) ===");
  for (const t of REGRESSION_COMPANIES) await check(adapter, t);
}
main().catch((e) => fail((e as Error).stack ?? (e as Error).message));
