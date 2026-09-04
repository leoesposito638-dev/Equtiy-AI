// ============================================================================
// GET /companies
// GET /companies/:id
// GET /companies/:id/metrics
// GET /companies/:id/financials
// GET /companies/:id/valuation
// GET /companies/:id/scores
// GET /companies/:id/analysis
// GET /companies/:id/changes
//
// Every handler here reads from already-computed tables (companies,
// financial_metrics, calculated_metrics, fundamental_scores,
// category_scores, analysis_snapshots, change_events). No handler ever
// calls a provider or the scoring engine directly — that only happens via
// /internal, so user-facing latency stays predictable and reads never
// silently trigger a recalculation.
// ============================================================================

import { Router } from "express";
import { getDbClient } from "../../db/client";
import { DEMO_TICKERS } from "../../config/demoUniverse";

const router = Router();

router.get("/", async (req, res) => {
  const db = getDbClient();
  // Demo Readiness milestone: scoped to the 30-company demo universe. The
  // companies table also holds ~8 earlier legacy/prototype companies with
  // no distinguishing column from the real demo set (both share
  // is_active=true) — without this filter they leaked into Discover.
  const { data, error } = await db
    .from("companies")
    .select("*")
    .eq("is_active", true)
    .in("ticker", DEMO_TICKERS)
    .order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.get("/:id", async (req, res) => {
  const db = getDbClient();
  const { data, error } = await db.from("companies").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ error: "Company not found." });
  res.json({ data });
});

router.get("/:id/metrics", async (req, res) => {
  const db = getDbClient();
  const { data, error } = await db
    .from("calculated_metrics")
    .select("metric_name, value, period_end, period_type, calculation_version")
    .eq("company_id", req.params.id)
    .order("period_end", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.get("/:id/financials", async (req, res) => {
  const db = getDbClient();
  const { data, error } = await db
    .from("financial_metrics")
    .select("metric_name, value, unit, currency, period_end, period_type, source_id")
    .eq("company_id", req.params.id)
    .order("period_end", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.get("/:id/valuation", async (req, res) => {
  const db = getDbClient();
  const { data, error } = await db
    .from("calculated_metrics")
    .select("metric_name, value, period_end")
    .eq("company_id", req.params.id)
    .in("metric_name", ["pe", "forward_pe", "ev_ebitda", "ev_sales", "price_to_fcf", "fcf_yield"])
    .order("period_end", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.get("/:id/scores", async (req, res) => {
  const db = getDbClient();
  const [fundamental, categories] = await Promise.all([
    db
      .from("fundamental_scores")
      .select("*")
      .eq("company_id", req.params.id)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("category_scores")
      .select("*, score_categories(category_key, name)")
      .eq("company_id", req.params.id)
      .order("calculated_at", { ascending: false }),
  ]);
  if (fundamental.error) return res.status(500).json({ error: fundamental.error.message });
  if (categories.error) return res.status(500).json({ error: categories.error.message });

  // Milestone 13C: category_scores can now legitimately hold rows from more
  // than one calculation_version for the same category (v1.0 history kept
  // for reproducibility alongside new v1.1 scores — see
  // schema/007_scoring_config_v1_1.sql). This endpoint has always returned
  // "one row per category"; that assumption only held before because every
  // company had exactly one version. Keep only the most recent row per
  // category_id (the query above already orders by calculated_at desc) so a
  // rescored company doesn't render two cards for the same category.
  const seenCategoryIds = new Set<string>();
  const latestPerCategory = (categories.data ?? []).filter((row: any) => {
    if (seenCategoryIds.has(row.category_id)) return false;
    seenCategoryIds.add(row.category_id);
    return true;
  });

  res.json({ data: { fundamental: fundamental.data, categories: latestPerCategory } });
});

router.get("/:id/analysis", async (req, res) => {
  const db = getDbClient();
  const [snapshot, thesis] = await Promise.all([
    db.from("analysis_snapshots").select("*").eq("company_id", req.params.id).order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("investment_theses").select("*").eq("company_id", req.params.id).order("generated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (snapshot.error) return res.status(500).json({ error: snapshot.error.message });
  if (thesis.error) return res.status(500).json({ error: thesis.error.message });
  res.json({ data: { snapshot: snapshot.data, thesis: thesis.data } });
});

router.get("/:id/changes", async (req, res) => {
  const db = getDbClient();
  const { data, error } = await db
    .from("change_events")
    .select("*")
    .eq("company_id", req.params.id)
    .order("detected_at", { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

export default router;
