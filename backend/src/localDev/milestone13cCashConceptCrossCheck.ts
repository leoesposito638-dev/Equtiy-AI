// ============================================================================
// Equity AI — Milestone 13C Phase 9: cash-concept classification cross-check.
// READ-ONLY, no writes, no DB access. Since financial_metrics.metric_identifier
// was found to be NULL for every already-ingested row (a pre-existing,
// systemic gap unrelated to this milestone — see final report), we cannot
// determine which CASH_CONCEPTS candidate was used for any company's
// already-ingested cash value directly from stored data. Instead, this
// script RE-DERIVES the same deterministic decision
// fetchMostCurrentInstantConcept() makes (fetch every candidate concept,
// pick whichever has the MOST RECENT period end among those with real data)
// against the live SEC API, for all 30 companies — the same authoritative
// source the original ingestion used — to classify each company as
// CLEAN (CashAndCashEquivalentsAtCarryingValue) or FALLBACK
// (CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents, which
// bundles in restricted cash) or NONE.
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

const CASH_CONCEPTS = ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"];

interface Fact { end: string; val: number; form: string; fp: string; filed: string; }

async function fetchInstantConcept(cik: string, concept: string, headers: Record<string, string>): Promise<{ ok: true; latestEnd: string } | { ok: false }> {
  const url = `${SEC_DATA_BASE_URL}/CIK${cik}/us-gaap/${concept}.json`;
  const res = await fetch(url, { headers });
  if (!res.ok) return { ok: false };
  const body = (await res.json()) as { units?: { USD?: Fact[] } };
  const usd = body.units?.USD ?? [];
  const annual = usd.filter((f) => f.form === "10-K" && f.fp === "FY" && typeof f.val === "number");
  if (annual.length === 0) return { ok: false };
  const latestEnd = annual.map((f) => f.end).sort().at(-1)!;
  return { ok: true, latestEnd };
}

async function main() {
  const userAgent = process.env.SEC_EDGAR_USER_AGENT;
  if (!userAgent) fail("Missing SEC_EDGAR_USER_AGENT");
  const headers = { "User-Agent": userAgent };

  const tickerMapRes = await fetch(SEC_TICKER_MAP_URL, { headers });
  if (!tickerMapRes.ok) fail(`ticker map fetch failed: HTTP ${tickerMapRes.status}`);
  const tickerMapBody = (await tickerMapRes.json()) as Record<string, { cik_str: number; ticker: string }>;
  const tickerToCik = new Map<string, string>();
  for (const entry of Object.values(tickerMapBody)) {
    if (entry?.ticker) tickerToCik.set(entry.ticker.toUpperCase(), pad10(entry.cik_str));
  }

  const results: Array<{ ticker: string; winner: string | null }> = [];

  for (const ticker of DEMO_TICKERS) {
    const cik = tickerToCik.get(ticker);
    if (!cik) { console.log(`${ticker}: CIK NOT FOUND`); results.push({ ticker, winner: null }); continue; }

    const candidates: Array<{ concept: string; latestEnd: string }> = [];
    for (const concept of CASH_CONCEPTS) {
      const r = await fetchInstantConcept(cik, concept, headers);
      if (r.ok) candidates.push({ concept, latestEnd: r.latestEnd });
    }
    if (candidates.length === 0) {
      console.log(`${ticker.padEnd(6)} NONE — no cash concept found at all`);
      results.push({ ticker, winner: null });
      continue;
    }
    const winner = candidates.reduce((a, b) => (b.latestEnd > a.latestEnd ? b : a));
    const classification = winner.concept === "CashAndCashEquivalentsAtCarryingValue" ? "CLEAN" : "FALLBACK (includes restricted cash)";
    console.log(`${ticker.padEnd(6)} winner=${winner.concept} (latest=${winner.latestEnd}) -> ${classification}`);
    results.push({ ticker, winner: winner.concept });
  }

  const clean = results.filter((r) => r.winner === "CashAndCashEquivalentsAtCarryingValue").map((r) => r.ticker);
  const fallback = results.filter((r) => r.winner === "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents").map((r) => r.ticker);
  const none = results.filter((r) => r.winner === null).map((r) => r.ticker);
  console.log(`\nCLEAN (${clean.length}/30): ${clean.join(", ")}`);
  console.log(`FALLBACK (${fallback.length}/30): ${fallback.join(", ")}`);
  console.log(`NONE (${none.length}/30): ${none.join(", ")}`);
  console.log(`\nDone. Read-only, no writes.\n`);
}

main().catch((e) => fail((e as Error).stack ?? (e as Error).message));
