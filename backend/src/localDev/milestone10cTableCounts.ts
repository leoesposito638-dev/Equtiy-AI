// ============================================================================
// Equity AI — Milestone 10C: read-only row-count snapshot across the tables
// that must remain unchanged (or change in the exactly-expected way) by the
// Growth Score write. No writes performed by this script.
// ============================================================================

import { getDbClient } from "../db/client";

const TABLES = [
  "companies",
  "data_sources",
  "raw_financial_data",
  "financial_metrics",
  "calculated_metrics",
  "metric_benchmarks",
  "category_scores",
];

async function main() {
  const db = getDbClient();
  for (const t of TABLES) {
    const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
    if (error) throw new Error(`${t}: ${error.message}`);
    console.log(`${t}: ${count}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
