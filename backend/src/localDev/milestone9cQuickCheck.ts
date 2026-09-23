import { SecEdgarAdapter } from "../providers/adapters/secEdgarAdapter";
function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }
const TICKERS = process.argv.slice(2);
async function main() {
  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) fail("Missing SEC_EDGAR_USER_AGENT");
  const adapter = new SecEdgarAdapter(userAgent);
  for (const ticker of TICKERS) {
    const result = await adapter.getIncomeStatement({ ticker }, "ANNUAL");
    if (result.status !== "available" || !result.data) {
      console.log(`${ticker}: UNAVAILABLE — ${result.unavailableReason}`);
      continue;
    }
    for (const metric of ["revenue", "net_income", "eps"]) {
      const items = result.data.filter((i) => i.metricName === metric).sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
      console.log(`${ticker} ${metric}: count=${items.length} concept=${items[0]?.metricIdentifier} periods=${items.map((i) => i.periodEnd).join(",")}`);
    }
  }
}
main().catch((e) => fail((e as Error).stack ?? (e as Error).message));
