// ============================================================================
// Equity AI — Milestone 12C Phase 1/6: read-only baseline snapshot of
// category_scores / fundamental_scores BEFORE any persistence-code change.
// Records: total counts, duplicate (company_id, category_id) pairs,
// duplicate company_id fundamental_scores, and zero-score/zero-confidence
// rows. No writes.
// ============================================================================

import { getDbClient } from "../db/client";

async function main() {
  const db = getDbClient();

  const { count: catCount } = await db.from("category_scores").select("*", { count: "exact", head: true });
  const { count: fundCount } = await db.from("fundamental_scores").select("*", { count: "exact", head: true });
  console.log(`category_scores total rows: ${catCount}`);
  console.log(`fundamental_scores total rows: ${fundCount}`);

  const { data: catRows } = await db.from("category_scores").select("company_id, category_id, score, confidence, coverage");
  const dupMap = new Map<string, number>();
  for (const r of catRows as any[]) {
    const key = `${r.company_id}|${r.category_id}`;
    dupMap.set(key, (dupMap.get(key) ?? 0) + 1);
  }
  const dupes = [...dupMap.entries()].filter(([, n]) => n > 1);
  console.log(`Duplicate (company_id, category_id) category_scores pairs: ${dupes.length}`);
  for (const [key, n] of dupes) console.log(`   ${key} -> ${n} rows`);

  const zeroCat = (catRows as any[]).filter((r) => r.score === 0 && r.confidence === 0);
  console.log(`category_scores rows with score=0 AND confidence=0 (fabricated-placeholder signature): ${zeroCat.length}`);

  const { data: fundRows } = await db.from("fundamental_scores").select("company_id, score, confidence");
  const fundDupMap = new Map<string, number>();
  for (const r of fundRows as any[]) {
    fundDupMap.set(r.company_id, (fundDupMap.get(r.company_id) ?? 0) + 1);
  }
  const fundDupes = [...fundDupMap.entries()].filter(([, n]) => n > 1);
  console.log(`Duplicate company_id fundamental_scores rows: ${fundDupes.length}`);
  for (const [key, n] of fundDupes) console.log(`   ${key} -> ${n} rows`);

  console.log(`\nBaseline recorded. No writes performed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
