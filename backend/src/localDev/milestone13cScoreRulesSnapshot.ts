import { getDbClient } from "../db/client";
async function main() {
  const db = getDbClient();
  const { data: cats } = await db.from("score_categories").select("id, category_key").order("category_key");
  const catKeyById = new Map((cats as any[]).map((c) => [c.id, c.category_key]));
  const { data: rules, error } = await db.from("score_rules").select("*").eq("version", "v1.0").order("category_id");
  if (error) throw error;
  console.log(`Total v1.0 score_rules rows: ${(rules as any[]).length}\n`);
  for (const r of rules as any[]) {
    console.log(JSON.stringify({
      category: catKeyById.get(r.category_id),
      metric_name: r.metric_name,
      rule_type: r.rule_type,
      weight: r.weight,
      direction: r.direction,
      minimum_data_points: r.minimum_data_points,
      sector_specific: r.sector_specific,
      active: r.active,
    }));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
