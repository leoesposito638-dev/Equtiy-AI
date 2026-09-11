import { SecEdgarAdapter } from "../providers/adapters/secEdgarAdapter";

function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }

const CANDIDATES = ["COP", "WFC", "MS", "MMM", "SCHW"];

async function main() {
  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) fail(`Missing SEC_EDGAR_USER_AGENT`);
  const adapter = new SecEdgarAdapter(userAgent);
  for (const ticker of CANDIDATES) {
    const result = await adapter.getIncomeStatement({ ticker }, "ANNUAL");
    if (result.status !== "available" || !result.data) {
      console.log(`${ticker}: unavailable — ${result.unavailableReason}`);
      continue;
    }
    const rev = result.data.filter((i) => i.metricName === "revenue");
    const ni = result.data.filter((i) => i.metricName === "net_income");
    const eps = result.data.filter((i) => i.metricName === "eps");
    console.log(`${ticker}: rev=${rev.length} ni=${ni.length} eps=${eps.length} tag=${rev[0]?.metricIdentifier} periods=${rev.map((i) => i.periodEnd).sort().join(",")}`);
  }
}
main().catch((e) => fail((e as Error).stack ?? (e as Error).message));
