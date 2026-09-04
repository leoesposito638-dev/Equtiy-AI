// ============================================================================
// Equity AI — Milestone 9C Part 1: search SEC companyfacts for revenue-like
// concepts actually used by JPM, WFC, MS (READ-ONLY, no writes).
//
// Fetches the real SEC companyfacts endpoint (all facts, all taxonomies) for
// each company, filters to us-gaap concepts whose name contains "Revenue"
// (case-insensitive), and reports which ones have real, current, annual
// (10-K, FY) data — so we can see what SEC data actually exists, rather
// than guessing a concept name.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone9cFinancialsConceptSearch.ts
// ============================================================================

const SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_COMPANYFACTS_BASE = "https://data.sec.gov/api/xbrl/companyfacts";

function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }
function pad10(cik: number): string { return String(cik).padStart(10, "0"); }

const TICKERS = ["JPM", "WFC", "MS"];

async function main() {
  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) fail("Missing SEC_EDGAR_USER_AGENT");
  const headers = { "User-Agent": userAgent };

  const tickerMapRes = await fetch(SEC_TICKER_MAP_URL, { headers });
  if (!tickerMapRes.ok) fail(`ticker map fetch failed: HTTP ${tickerMapRes.status}`);
  const tickerMapBody = (await tickerMapRes.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
  const tickerToCik = new Map<string, { cik: string; title: string }>();
  for (const entry of Object.values(tickerMapBody)) {
    if (entry?.ticker) tickerToCik.set(entry.ticker.toUpperCase(), { cik: pad10(entry.cik_str), title: entry.title });
  }

  for (const ticker of TICKERS) {
    const mapEntry = tickerToCik.get(ticker);
    console.log(`\n${"=".repeat(90)}\n${ticker} — CIK ${mapEntry?.cik ?? "NOT FOUND"} (${mapEntry?.title ?? "?"})\n${"=".repeat(90)}`);
    if (!mapEntry) continue;

    const url = `${SEC_COMPANYFACTS_BASE}/CIK${mapEntry.cik}.json`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.log(`   companyfacts fetch failed: HTTP ${res.status}`);
      continue;
    }
    const body = (await res.json()) as { facts?: { "us-gaap"?: Record<string, { units: Record<string, any[]> }> } };
    const usGaap = body.facts?.["us-gaap"] ?? {};
    const revenueLikeConcepts = Object.keys(usGaap).filter((k) => /revenue/i.test(k));
    console.log(`   Total us-gaap concepts: ${Object.keys(usGaap).length}. Revenue-like concept names found: ${revenueLikeConcepts.length}`);

    for (const concept of revenueLikeConcepts) {
      const unitsObj = usGaap[concept].units;
      const usdFacts: any[] = unitsObj?.USD ?? [];
      const annualFacts = usdFacts.filter((f) => f.form === "10-K" && f.fp === "FY" && typeof f.val === "number");
      if (annualFacts.length === 0) {
        console.log(`   - ${concept}: no USD 10-K/FY annual facts`);
        continue;
      }
      // dedupe by period end, most-recently-filed wins (mirrors adapter logic)
      const byEnd = new Map<string, any>();
      for (const f of annualFacts) {
        const existing = byEnd.get(f.end);
        if (!existing || f.filed > existing.filed) byEnd.set(f.end, f);
      }
      const sorted = [...byEnd.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
      const mostRecent = sorted[0];
      console.log(
        `   - ${concept}: ${sorted.length} annual period(s), most recent end=${mostRecent[0]} val=${mostRecent[1].val} form=${mostRecent[1].form} filed=${mostRecent[1].filed} accn=${mostRecent[1].accn}`
      );
      console.log(`       all period ends: ${sorted.map(([end]) => end).join(", ")}`);
    }
  }

  console.log(`\n${"=".repeat(90)}\nDone. Read-only, no writes.\n${"=".repeat(90)}\n`);
}

main().catch((e) => fail((e as Error).stack ?? (e as Error).message));
