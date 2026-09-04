const SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }
function pad10(n: number) { return String(n).padStart(10, "0"); }
const CHECKS: Array<{ticker: string; concept: string; unit: "USD"|"USD/shares"}> = [
  { ticker: "TSLA", concept: "NetIncomeLoss", unit: "USD" },
  { ticker: "TSLA", concept: "EarningsPerShareBasic", unit: "USD/shares" },
  { ticker: "JNJ", concept: "RevenueFromContractWithCustomerExcludingAssessedTax", unit: "USD" },
  { ticker: "JNJ", concept: "NetIncomeLoss", unit: "USD" },
  { ticker: "JNJ", concept: "EarningsPerShareBasic", unit: "USD/shares" },
];
async function main() {
  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) fail("Missing SEC_EDGAR_USER_AGENT");
  const headers = { "User-Agent": userAgent };
  const tickerMapRes = await fetch(SEC_TICKER_MAP_URL, { headers });
  const tickerMapBody = await tickerMapRes.json() as Record<string, {cik_str:number; ticker:string}>;
  const tickerToCik = new Map<string, string>();
  for (const e of Object.values(tickerMapBody)) if (e.ticker) tickerToCik.set(e.ticker.toUpperCase(), pad10(e.cik_str));

  for (const { ticker, concept, unit } of CHECKS) {
    const cik = tickerToCik.get(ticker);
    const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${concept}.json`;
    const res = await fetch(url, { headers });
    if (!res.ok) { console.log(`${ticker} ${concept}: HTTP ${res.status}`); continue; }
    const body = await res.json() as { units: Record<string, any[]> };
    const facts: any[] = body.units[unit] ?? [];
    const genuinelyAnnual = facts.filter((f) => {
      if (f.form !== "10-K" || f.fp !== "FY" || typeof f.val !== "number") return false;
      if (!f.start) return true;
      const d = Math.round((new Date(f.end).getTime() - new Date(f.start).getTime()) / 86400000);
      return d >= 340 && d <= 390;
    });
    const byEnd = new Map<string, any>();
    for (const f of genuinelyAnnual) { const ex = byEnd.get(f.end); if (!ex || f.filed > ex.filed) byEnd.set(f.end, f); }
    const sorted = [...byEnd.entries()].sort((a,b) => a[0] < b[0] ? 1 : -1).slice(0, 4);
    console.log(`${ticker} ${concept}: ${byEnd.size} total genuinely-annual periods; top 4: ${sorted.map(([end, f]) => `${end}=${f.val}`).join(", ")}`);
  }
}
main().catch((e) => fail((e as Error).stack ?? (e as Error).message));
