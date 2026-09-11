// ============================================================================
// Equity AI — Milestone 13C Phase 7: empirical SEC debt-concept investigation
// across the real 30-company demo universe. READ-ONLY (no writes, no
// Supabase). Fetches the real SEC companyconcept endpoint for the approved
// Total Debt candidate concepts (LongTermDebtCurrent, LongTermDebtNoncurrent,
// ShortTermBorrowings) plus a small number of well-known fallback synonyms,
// ONLY to check whether real data demonstrates they are necessary — per the
// milestone's explicit instruction not to adopt a concept "solely because it
// appears in a generic XBRL list."
//
// Reports, per company/concept: whether real USD instant facts exist,
// how many distinct period ends, the most recent value/period, and whether
// the fact set looks like duplicative/overlapping tagging of the same
// obligation (so double-counting can be reasoned about before any
// aggregation code is written).
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone13cDebtConceptInvestigate.ts
// ============================================================================

const SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_DATA_BASE_URL = "https://data.sec.gov/api/xbrl/companyconcept";

function fail(m: string): never { console.error(`\n❌ ${m}\n`); process.exit(1); }
function pad10(cik: number): string { return String(cik).padStart(10, "0"); }

const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

// Approved primary candidates (from the 13B decision) plus a small set of
// well-known synonym/fallback concepts, checked ONLY to see whether real
// data demonstrates a company needs them — never adopted speculatively.
const CANDIDATE_CONCEPTS = [
  "LongTermDebtCurrent",
  "LongTermDebtNoncurrent",
  "LongTermDebt", // some filers don't split current/noncurrent
  "ShortTermBorrowings",
  "DebtCurrent", // possible synonym seen at some filers
  "OtherShortTermBorrowings",
];

interface Fact { end: string; val: number; form: string; fp: string; filed: string; }

async function fetchConcept(cik: string, concept: string, headers: Record<string, string>): Promise<{ ok: true; facts: Fact[] } | { ok: false; reason: string }> {
  const url = `${SEC_DATA_BASE_URL}/CIK${cik}/us-gaap/${concept}.json`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return { ok: false, reason: "concept not tagged by this company" };
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
  const body = (await res.json()) as { units?: { USD?: Fact[] } };
  const usd = body.units?.USD ?? [];
  const annual = usd.filter((f) => f.form === "10-K" && f.fp === "FY" && typeof f.val === "number");
  if (annual.length === 0) return { ok: false, reason: "no USD 10-K/FY facts" };
  return { ok: true, facts: annual };
}

function dedupeByPeriodEnd(facts: Fact[]): Fact[] {
  const byEnd = new Map<string, Fact>();
  for (const f of facts) {
    const existing = byEnd.get(f.end);
    if (!existing || f.filed > existing.filed) byEnd.set(f.end, f);
  }
  return [...byEnd.values()].sort((a, b) => (a.end < b.end ? 1 : -1));
}

async function main() {
  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) fail("Missing SEC_EDGAR_USER_AGENT");
  const headers = { "User-Agent": userAgent };

  const tickerMapRes = await fetch(SEC_TICKER_MAP_URL, { headers });
  if (!tickerMapRes.ok) fail(`ticker map fetch failed: HTTP ${tickerMapRes.status}`);
  const tickerMapBody = (await tickerMapRes.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
  const tickerToCik = new Map<string, string>();
  for (const entry of Object.values(tickerMapBody)) {
    if (entry?.ticker) tickerToCik.set(entry.ticker.toUpperCase(), pad10(entry.cik_str));
  }

  const nowYear = new Date().getFullYear();
  const coverageByConcept = new Map<string, string[]>();
  const perCompanyResults = new Map<string, Map<string, Fact[]>>();

  for (const ticker of DEMO_TICKERS) {
    const cik = tickerToCik.get(ticker);
    console.log(`\n${"=".repeat(90)}\n${ticker} — CIK ${cik ?? "NOT FOUND"}\n${"=".repeat(90)}`);
    if (!cik) continue;

    const companyResults = new Map<string, Fact[]>();
    for (const concept of CANDIDATE_CONCEPTS) {
      const result = await fetchConcept(cik, concept, headers);
      if (!result.ok) {
        console.log(`   ${concept.padEnd(24)} — unavailable (${result.reason})`);
        continue;
      }
      const deduped = dedupeByPeriodEnd(result.facts);
      const mostRecent = deduped[0];
      const mostRecentYear = parseInt(mostRecent.end.slice(0, 4), 10);
      const current = mostRecentYear >= nowYear - 2;
      console.log(
        `   ${concept.padEnd(24)} — ${deduped.length} period(s), most recent end=${mostRecent.end} val=${mostRecent.val.toLocaleString()} current=${current ? "Y" : "N"}`
      );
      console.log(`      period ends: ${deduped.map((f) => f.end).join(", ")}`);
      companyResults.set(concept, deduped);
      const list = coverageByConcept.get(concept) ?? [];
      list.push(ticker);
      coverageByConcept.set(concept, list);
    }
    perCompanyResults.set(ticker, companyResults);
  }

  console.log(`\n${"=".repeat(90)}\nCOVERAGE SUMMARY (companies with >=1 real current annual fact)\n${"=".repeat(90)}`);
  for (const concept of CANDIDATE_CONCEPTS) {
    const covered = coverageByConcept.get(concept) ?? [];
    console.log(`${concept.padEnd(24)} ${covered.length}/30 — ${covered.join(", ") || "none"}`);
  }

  console.log(`\n${"=".repeat(90)}\nOVERLAP CHECK: companies tagging BOTH LongTermDebt AND LongTermDebtCurrent/Noncurrent\n${"=".repeat(90)}`);
  for (const ticker of DEMO_TICKERS) {
    const results = perCompanyResults.get(ticker);
    if (!results) continue;
    const hasCombined = results.has("LongTermDebt");
    const hasSplit = results.has("LongTermDebtCurrent") || results.has("LongTermDebtNoncurrent");
    if (hasCombined && hasSplit) {
      console.log(`   ⚠️ ${ticker}: tags BOTH LongTermDebt (combined) AND a split current/noncurrent concept — would double-count if both summed.`);
    }
  }

  console.log(`\n${"=".repeat(90)}\nCOMPANIES WITH ZERO DEBT-CONCEPT COVERAGE (candidates for financial-company/UNAVAILABLE treatment)\n${"=".repeat(90)}`);
  for (const ticker of DEMO_TICKERS) {
    const results = perCompanyResults.get(ticker);
    if (!results || results.size === 0) console.log(`   ${ticker}: no candidate debt concept found at all`);
  }

  console.log(`\nDone. Read-only, no writes.\n`);
}

main().catch((e) => fail((e as Error).stack ?? (e as Error).message));
