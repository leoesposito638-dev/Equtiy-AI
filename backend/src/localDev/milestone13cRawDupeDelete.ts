// ============================================================================
// Equity AI — Milestone 13C: guarded delete of the 656 exact-duplicate
// raw_financial_data rows identified by milestone13cRawDupeIdentify.ts
// (created by the pre-existing ingest.ts periodType-dedup bug, fixed this
// milestone, during this milestone's balance-sheet re-ingestion run).
//
// Safety: hard-aborts unless the delete-candidate ID list from the identify
// script's output matches EXACTLY the previously-reported count (656), and
// only deletes by explicit row id (never a broad WHERE clause) — same
// pattern used for the Milestone 12B category_scores cleanup.
// ============================================================================

import { readFileSync } from "fs";
import { getDbClient } from "../db/client";

const EXPECTED_DELETE_COUNT = 656;

async function main() {
  const raw = readFileSync(
    "/tmp/claude-0/-home-user-Equtiy-AI/244afb25-a379-5428-bf6b-ee7a486ec794/scratchpad/13c_raw_dupe_ids.json",
    "utf-8"
  );
  const { toDelete } = JSON.parse(raw) as { toDelete: string[] };

  if (toDelete.length !== EXPECTED_DELETE_COUNT) {
    throw new Error(
      `STOP: expected exactly ${EXPECTED_DELETE_COUNT} rows to delete, found ${toDelete.length}. Aborting — refusing to delete an unexpected set.`
    );
  }

  const db = getDbClient();
  const { count: beforeCount } = await db.from("raw_financial_data").select("*", { count: "exact", head: true });
  console.log(`raw_financial_data total before delete: ${beforeCount}`);

  // Delete in batches (Supabase .in() has practical size limits).
  const BATCH = 100;
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH);
    const { error } = await db.from("raw_financial_data").delete().in("id", batch);
    if (error) throw new Error(`Delete failed for batch starting at ${i}: ${error.message}`);
    deleted += batch.length;
  }
  console.log(`Deleted ${deleted} rows.`);

  const { count: afterCount } = await db.from("raw_financial_data").select("*", { count: "exact", head: true });
  console.log(`raw_financial_data total after delete: ${afterCount}`);
  console.log(`Delta: ${(afterCount ?? 0) - (beforeCount ?? 0)} (expected -${EXPECTED_DELETE_COUNT})`);

  if ((beforeCount ?? 0) - (afterCount ?? 0) !== EXPECTED_DELETE_COUNT) {
    throw new Error(`STOP: delta mismatch — expected -${EXPECTED_DELETE_COUNT}, got ${(afterCount ?? 0) - (beforeCount ?? 0)}.`);
  }
  console.log(`\nDone. Confirmed clean delete of exactly ${EXPECTED_DELETE_COUNT} duplicate rows.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
