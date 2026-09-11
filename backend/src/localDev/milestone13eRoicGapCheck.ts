import { getDbClient } from "../db/client";
async function main() {
  const db = getDbClient();
  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", ["IBM","JNJ","LLY","MRK","PFE","CVX","COP"]);
  const idToTicker = new Map((companies as any[]).map((c) => [c.id, c.ticker]));
  const { data: rows } = await db.from("calculated_metrics").select("company_id, metric_name, period_end")
    .in("company_id", (companies as any[]).map((c) => c.id))
    .in("metric_name", ["invested_capital", "effective_tax_rate", "operating_income"]);
  const byCompanyMetric = new Map<string, Set<string>>();
  for (const r of rows as any[]) {
    const key = `${idToTicker.get(r.company_id)}|${r.metric_name}`;
    const s = byCompanyMetric.get(key) ?? new Set<string>();
    s.add(r.period_end);
    byCompanyMetric.set(key, s);
  }
  // operating_income is a raw financial_metrics fact, not calculated_metrics - check there instead
  const { data: oiRows } = await db.from("financial_metrics").select("company_id, period_end, value")
    .in("company_id", (companies as any[]).map((c) => c.id))
    .eq("metric_name", "operating_income").eq("period_type", "ANNUAL");
  for (const r of oiRows as any[]) {
    const key = `${idToTicker.get(r.company_id)}|operating_income`;
    const s = byCompanyMetric.get(key) ?? new Set<string>();
    if (r.value !== null) s.add(r.period_end);
    byCompanyMetric.set(key, s);
  }
  for (const t of ["IBM","JNJ","LLY","MRK","PFE","CVX","COP"]) {
    const ic = [...(byCompanyMetric.get(`${t}|invested_capital`) ?? [])].sort();
    const etr = [...(byCompanyMetric.get(`${t}|effective_tax_rate`) ?? [])].sort();
    const oi = [...(byCompanyMetric.get(`${t}|operating_income`) ?? [])].sort();
    const allThree = ic.filter(p => etr.includes(p) && oi.includes(p));
    console.log(`${t}: IC=[${ic.join(",")}]  ETR=[${etr.join(",")}]  OI=[${oi.join(",")}]  ALIGNED=[${allThree.join(",")}]`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
