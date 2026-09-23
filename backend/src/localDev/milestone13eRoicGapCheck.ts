import { getDbClient } from "../db/client";
import { fetchAllPaginated } from "../db/paginate";
async function main() {
  const db = getDbClient();
  const { data: companies } = await db.from("companies").select("id, ticker").in("ticker", ["IBM","JNJ","LLY","MRK","PFE","CVX","COP"]);
  const idToTicker = new Map((companies as any[]).map((c) => [c.id, c.ticker]));
  // Milestone 14D.1: paginated for consistency with the rest of this
  // codebase's fix — this 7-company scope is well under 1000 rows today,
  // but calculated_metrics/financial_metrics are both risk tables.
  const rows = await fetchAllPaginated<any>((from, to) =>
    db.from("calculated_metrics").select("company_id, metric_name, period_end")
      .in("company_id", (companies as any[]).map((c) => c.id))
      .in("metric_name", ["invested_capital", "effective_tax_rate", "operating_income"])
      .order("id", { ascending: true })
      .range(from, to)
  );
  const byCompanyMetric = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = `${idToTicker.get(r.company_id)}|${r.metric_name}`;
    const s = byCompanyMetric.get(key) ?? new Set<string>();
    s.add(r.period_end);
    byCompanyMetric.set(key, s);
  }
  // operating_income is a raw financial_metrics fact, not calculated_metrics - check there instead
  const oiRows = await fetchAllPaginated<any>((from, to) =>
    db.from("financial_metrics").select("company_id, period_end, value")
      .in("company_id", (companies as any[]).map((c) => c.id))
      .eq("metric_name", "operating_income").eq("period_type", "ANNUAL")
      .order("id", { ascending: true })
      .range(from, to)
  );
  for (const r of oiRows) {
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
