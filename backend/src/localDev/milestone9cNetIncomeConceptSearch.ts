const SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }
function pad10(n: number) { return String(n).padStart(10, "0"); }
const TICKERS = ["MA", "CAT"];
async function main() {
  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) fail("Missing SEC_EDGAR_USER_AGENT");
  const headers = { "User-Agent": userAgent };
  const tickerMapRes = await fetch(SEC_TICKER_MAP_URL, { headers });
  const tickerMapBody = await tickerMapRes.json() as Record<string, {cik_str:number; ticker:string; title:string}>;
  const tickerToCik = new Map<string, string>();
  for (const e of Object.values(tickerMapBody)) if (e.ticker) tickerToCik.set(e.ticker.toUpperCase(), pad10(e.cik_str));

  for (const ticker of TICKERS) {
    const cik = tickerToCik.get(ticker);
    console.log(`\n=== ${ticker} CIK ${cik} ===`);
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const res = await fetch(url, { headers });
    const body = await res.json() as { facts?: { "us-gaap"?: Record<string, { units: Record<string, any[]> }> } };
    const usGaap = body.facts?.["us-gaap"] ?? {};
    const niLike = Object.keys(usGaap).filter((k) => /^(NetIncome|ProfitLoss|IncomeLossFromContinuingOperations)/i.test(k));
    for (const concept of niLike) {
      const usdFacts: any[] = usGaap[concept].units?.USD ?? [];
      const annualSpanFacts = usdFacts.filter((f) => f.form === "10-K" && f.fp === "FY" && typeof f.val === "number" &&
        (() => { if (!f.start) return true; const d = Math.round((new Date(f.end).getTime() - new Date(f.start).getTime())/86400000); return d >= 340 && d <= 390; })());
      if (annualSpanFacts.length === 0) { console.log(`  - ${concept}: no genuinely-annual USD 10-K/FY facts`); continue; }
      const byEnd = new Map<string, any>();
      for (const f of annualSpanFacts) { const ex = byEnd.get(f.end); if (!ex || f.filed > ex.filed) byEnd.set(f.end, f); }
      const sorted = [...byEnd.entries()].sort((a,b) => a[0] < b[0] ? 1 : -1);
      console.log(`  - ${concept}: ${sorted.length} annual period(s), most recent end=${sorted[0][0]} val=${sorted[0][1].val} filed=${sorted[0][1].filed}`);
    }
  }
}
main().catch((e) => fail((e as Error).stack ?? (e as Error).message));
