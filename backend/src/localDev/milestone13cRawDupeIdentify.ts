// ============================================================================
// Equity AI — Milestone 13C: identify exact-duplicate raw_financial_data
// rows created by the pre-existing ingest.ts periodType-dedup bug (fixed
// this milestone) during this milestone's balance-sheet re-ingestion.
// READ-ONLY — only reports; a separate script performs the guarded delete.
// A "duplicate" here means: same company_id, metric_name, period_end,
// period_type, unit, currency, raw_value, AND same provider (via
// data_source_id -> data_sources.provider_name) — i.e. byte-for-byte the
// same observation stored twice. Only the NEWER row(s) in each duplicate
// group are candidates for deletion; the oldest (original, 12B-era) row is
// always kept.
// ============================================================================

import { getDbClient } from "../db/client";

const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
];

async function main() {
  const db = getDbClient();
  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", DEMO_TICKERS);
  const companyIds = (companies as any[]).map((c) => c.id);
  const idToTicker = new Map((companies as any[]).map((c) => [c.id, c.ticker]));

  // Supabase's default page size is 1000 rows — must paginate explicitly or
  // silently miss rows (this table now has ~2600+ rows for the demo universe).
  const rows: any[] = [];
  const PAGE_SIZE = 1000;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: page, error } = await db
      .from("raw_financial_data")
      .select("id, company_id, metric_name, period_end, period_type, unit, currency, raw_value, created_at, data_source_id, data_sources(provider_name)")
      .in("company_id", companyIds)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!page || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  console.log(`Total raw_financial_data rows fetched (paginated): ${rows.length}`);

  const groups = new Map<string, any[]>();
  for (const r of rows as any[]) {
    const provider = r.data_sources?.provider_name ?? "UNKNOWN";
    const key = `${r.company_id}|${r.metric_name}|${r.period_end}|${r.period_type}|${r.unit}|${r.currency}|${r.raw_value}|${provider}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const toDelete: string[] = [];
  const toKeep: string[] = [];
  let dupeGroups = 0;
  const perTicker = new Map<string, number>();
  for (const [, rowsInGroup] of groups) {
    if (rowsInGroup.length <= 1) continue;
    dupeGroups++;
    // Oldest (first, since sorted ascending by created_at) is kept.
    toKeep.push(rowsInGroup[0].id);
    for (const r of rowsInGroup.slice(1)) {
      toDelete.push(r.id);
      const t = idToTicker.get(r.company_id);
      perTicker.set(t, (perTicker.get(t) ?? 0) + 1);
    }
  }

  console.log(`Duplicate groups found: ${dupeGroups}`);
  console.log(`Rows to delete (newer duplicates): ${toDelete.length}`);
  console.log(`Rows to keep (oldest in each group): ${toKeep.length}`);
  console.log(`\nPer-company breakdown:`);
  for (const [ticker, n] of [...perTicker.entries()].sort()) console.log(`   ${ticker}: ${n}`);

  console.log(`\nWriting delete-candidate IDs to /tmp scratchpad for the guarded delete script...`);
  const fs = await import("fs");
  fs.writeFileSync(
    "/tmp/claude-0/-home-user-Equtiy-AI/244afb25-a379-5428-bf6b-ee7a486ec794/scratchpad/13c_raw_dupe_ids.json",
    JSON.stringify({ toDelete, toKeep, dupeGroups }, null, 2)
  );
  console.log(`Done.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
