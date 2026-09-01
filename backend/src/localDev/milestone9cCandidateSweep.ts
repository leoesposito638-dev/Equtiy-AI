// ============================================================================
// Equity AI — Milestone 9C Part 3: full re-verification of the 30-company
// candidate pool through the REAL (9B-fixed, unmodified) SecEdgarAdapter.
// READ-ONLY: no ingestion, no Supabase writes, no company creation.
//
// For each candidate, checks revenue/net_income/eps: available, 4 periods,
// current, and — new in 9C — genuinely ANNUAL (start..end spans ~350-380
// days), not a quarterly/stub fact slipping through the form=10-K/fp=FY
// filter (the exact mechanism found for HON). This day-span check is
// computed HERE for reporting only — it is NOT implemented in the adapter
// itself this milestone.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone9cCandidateSweep.ts
// ============================================================================

import { SecEdgarAdapter } from "../providers/adapters/secEdgarAdapter";

function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }

const CANDIDATES = [
  "GOOGL", "AMZN", "TSLA",
  "ORCL", "QCOM", "ADBE", "INTC", "DIS", "VZ", "LOW", "MCD",
  "BAC", "MA", "SCHW",
  "JNJ", "UNH", "LLY", "MRK", "PFE",
  "CAT", "DE",
  "PG", "COST", "PEP",
  "CVX", "COP",
];

function daysBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

async function main() {
  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) fail("Missing SEC_EDGAR_USER_AGENT");
  const adapter = new SecEdgarAdapter(userAgent);
  const nowYear = new Date().getFullYear();

  const summary: Record<string, string[]> = { clean: [], minorIssue: [], majorIssue: [], unavailable: [] };

  for (const ticker of CANDIDATES) {
    console.log(`\n--- ${ticker} ---`);
    const result = await adapter.getIncomeStatement({ ticker }, "ANNUAL");
    if (result.status !== "available" || !result.data) {
      console.log(`   UNAVAILABLE — ${result.unavailableReason}`);
      summary.unavailable.push(ticker);
      continue;
    }

    const issues: string[] = [];
    for (const metric of ["revenue", "net_income", "eps"]) {
      const items = result.data.filter((i) => i.metricName === metric).sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
      const periodEnds = items.map((i) => i.periodEnd);
      const uniquePeriods = new Set(periodEnds).size === periodEnds.length;
      const mostRecentYear = items.length > 0 ? parseInt(items[items.length - 1].periodEnd.slice(0, 4), 10) : 0;
      const current = mostRecentYear >= nowYear - 2;
      const spans = items.map((i) => daysBetween(i.periodStart, i.periodEnd));
      const allAnnualSpan = spans.every((d) => d === null || (d >= 340 && d <= 390));
      console.log(
        `   ${metric.padEnd(11)} count=${items.length} current=${current ? "Y" : "N"} unique=${uniquePeriods ? "Y" : "N"} annualSpan=${allAnnualSpan ? "Y" : "N"} concept=${items[0]?.metricIdentifier ?? "n/a"}`
      );
      console.log(`      periods: ${periodEnds.join(", ")}  spans(days): ${spans.join(", ")}`);
      if (items.length < 4) issues.push(`${metric}: only ${items.length} periods`);
      if (!current) issues.push(`${metric}: stale (most recent ${mostRecentYear})`);
      if (!uniquePeriods) issues.push(`${metric}: duplicate period_end values`);
      if (!allAnnualSpan) issues.push(`${metric}: contains a non-annual-span fact (quarterly/stub, like HON)`);
    }

    if (issues.length === 0) {
      console.log(`   => CLEAN`);
      summary.clean.push(ticker);
    } else {
      const major = issues.some((i) => i.includes("stale") || i.includes("only") || i.includes("non-annual-span"));
      console.log(`   => ${major ? "MAJOR" : "MINOR"} ISSUE(S): ${issues.join(" | ")}`);
      (major ? summary.majorIssue : summary.minorIssue).push(ticker);
    }
  }

  console.log(`\n${"=".repeat(90)}\nSUMMARY\n${"=".repeat(90)}`);
  console.log(`Clean: ${summary.clean.length} — ${summary.clean.join(", ")}`);
  console.log(`Minor issue: ${summary.minorIssue.length} — ${summary.minorIssue.join(", ")}`);
  console.log(`Major issue: ${summary.majorIssue.length} — ${summary.majorIssue.join(", ")}`);
  console.log(`Unavailable: ${summary.unavailable.length} — ${summary.unavailable.join(", ")}`);
}

main().catch((e) => fail((e as Error).stack ?? (e as Error).message));
