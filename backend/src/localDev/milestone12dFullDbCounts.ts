// ============================================================================
// Equity AI — Milestone 12D Phase 16: full database safety snapshot.
// Read-only. Records exact row counts for every table this milestone could
// touch, run both before and after the milestone's writes.
// ============================================================================

import { getDbClient } from "../db/client";

const TABLES = [
  "companies", "data_sources", "raw_financial_data", "financial_metrics",
  "calculated_metrics", "metric_benchmarks", "category_scores", "fundamental_scores",
];

async function main() {
  const db = getDbClient();
  for (const table of TABLES) {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`${table} count failed: ${error.message}`);
    console.log(`${table.padEnd(22)} ${count}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
