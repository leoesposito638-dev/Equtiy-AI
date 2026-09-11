// Milestone 13E: quick real-data spot check of the new tax_expense/pretax_income
// line items via the actual (now-extended) SecEdgarAdapter.getIncomeStatement.
import { SecEdgarAdapter } from "../providers/adapters/secEdgarAdapter";

const TICKERS = ["NVDA", "AMZN", "JPM", "MA", "ORCL", "MCD", "CVX"];

async function main() {
  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) throw new Error("Missing SEC_EDGAR_USER_AGENT");
  const adapter = new SecEdgarAdapter(userAgent);

  for (const ticker of TICKERS) {
    const result = await adapter.getIncomeStatement({ ticker }, "ANNUAL");
    console.log(`\n=== ${ticker} ===`);
    if (result.status !== "available" || !result.data) {
      console.log(`UNAVAILABLE: ${result.unavailableReason}`);
      continue;
    }
    for (const metric of ["tax_expense", "pretax_income"]) {
      const items = result.data.filter((i) => i.metricName === metric).sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
      console.log(`${metric}: ${items.length} period(s) — ${items.map((i) => `${i.periodEnd}=${i.rawValue?.toLocaleString()}`).join(", ") || "NONE"} (concept: ${items[0]?.metricIdentifier ?? "n/a"})`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
