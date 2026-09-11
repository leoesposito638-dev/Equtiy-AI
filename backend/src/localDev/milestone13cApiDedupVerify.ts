import { getDbClient } from "../db/client";
async function main() {
  const db = getDbClient();
  const { data: companies } = await db.from("companies").select("id, ticker").eq("ticker", "JNJ");
  const companyId = (companies as any[])[0].id;

  const { data: categories } = await db
    .from("category_scores")
    .select("*, score_categories(category_key, name)")
    .eq("company_id", companyId)
    .order("calculated_at", { ascending: false });

  console.log(`Raw rows returned by the query: ${(categories as any[]).length}`);
  const byCategory = new Map<string, number>();
  for (const r of categories as any[]) byCategory.set(r.score_categories.category_key, (byCategory.get(r.score_categories.category_key) ?? 0) + 1);
  console.log("Rows per category (before dedup):", Object.fromEntries(byCategory));

  // Replicate the exact dedup logic added to companies.ts
  const seenCategoryIds = new Set<string>();
  const latestPerCategory = (categories as any[]).filter((row: any) => {
    if (seenCategoryIds.has(row.category_id)) return false;
    seenCategoryIds.add(row.category_id);
    return true;
  });
  console.log(`\nAfter dedup: ${latestPerCategory.length} rows`);
  for (const r of latestPerCategory) {
    console.log(`   ${r.score_categories.category_key}: score=${r.score} version=${r.calculation_version} calculated_at=${r.calculated_at}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
