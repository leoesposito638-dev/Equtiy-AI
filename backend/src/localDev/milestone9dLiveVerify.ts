// ============================================================================
// Equity AI — Milestone 9D: live read-only verification of the SEC adapter
// after the revenue/net-income concept fallback + annual-span fix.
// Run with: npx ts-node --transpile-only src/localDev/milestone9dLiveVerify.ts
// ============================================================================
import { SecEdgarAdapter } from "../providers/adapters/secEdgarAdapter";
function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }

const TICKERS = ["JPM", "WFC", "MS", "MA", "CAT", "HON", "NVDA", "TXN", "IBM"];

function daysBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

async function main() {
  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) fail("Missing SEC_EDGAR_USER_AGENT");
  const adapter = new SecEdgarAdapter(userAgent);

  for (const ticker of TICKERS) {
    console.log(`\n--- ${ticker} ---`);
    const result = await adapter.getIncomeStatement({ ticker }, "ANNUAL");
    if (result.status !== "available" || !result.data) {
      console.log(`   UNAVAILABLE — ${result.unavailableReason}`);
      continue;
    }
    for (const metric of ["revenue", "net_income", "eps"]) {
      const items = result.data.filter((i) => i.metricName === metric).sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
      const spans = items.map((i) => daysBetween(i.periodStart, i.periodEnd));
      const allSpanOk = spans.every((d) => d !== null && d >= 340 && d <= 390);
      const mostRecentYear = items.length ? parseInt(items[items.length - 1].periodEnd.slice(0, 4), 10) : 0;
      console.log(`   ${metric.padEnd(11)} count=${items.length} concept=${items[0]?.metricIdentifier ?? "n/a"} allSpanOk=${allSpanOk ? "Y" : "N"} currentYear=${mostRecentYear}`);
      console.log(`      periods: ${items.map((i) => i.periodEnd).join(", ")}  spans: ${spans.join(", ")}`);
    }
    console.log(`   overall status: ${result.status}`);
  }
}
main().catch((e) => fail((e as Error).stack ?? (e as Error).message));
