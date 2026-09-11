const SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }
function pad10(n: number) { return String(n).padStart(10, "0"); }
async function main() {
  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) fail("Missing SEC_EDGAR_USER_AGENT");
  const headers = { "User-Agent": userAgent };
  const tickerMapRes = await fetch(SEC_TICKER_MAP_URL, { headers });
  const tickerMapBody = await tickerMapRes.json() as Record<string, {cik_str:number; ticker:string; title:string}>;
  let cik = "";
  for (const e of Object.values(tickerMapBody)) if (e.ticker === "HON") cik = pad10(e.cik_str);
  console.log("HON CIK:", cik);

  const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/RevenueFromContractWithCustomerExcludingAssessedTax.json`;
  const res = await fetch(url, { headers });
  const body = await res.json() as { units: { USD: any[] } };
  const facts = body.units.USD;
  const annual = facts.filter((f: any) => f.form === "10-K" && f.fp === "FY");
  console.log(`Total USD facts: ${facts.length}. form=10-K && fp=FY: ${annual.length}`);
  for (const f of annual) {
    console.log(`  start=${f.start} end=${f.end} val=${f.val} fy=${f.fy} fp=${f.fp} form=${f.form} filed=${f.filed} accn=${f.accn} frame=${f.frame ?? ""}`);
  }
}
main().catch((e) => fail((e as Error).stack ?? (e as Error).message));
