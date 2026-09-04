// ============================================================================
// GET /search?q=
// ============================================================================

import { Router } from "express";
import { getDbClient } from "../../db/client";
import { DEMO_TICKERS } from "../../config/demoUniverse";

const router = Router();

router.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 1) return res.json({ data: [] });

  const db = getDbClient();
  // Demo Readiness milestone: scoped to the 30-company demo universe (see
  // /companies for why this filter is needed).
  const { data, error } = await db
    .from("companies")
    .select("id, name, ticker, exchange, sector")
    .or(`name.ilike.%${q}%,ticker.ilike.%${q}%`)
    .eq("is_active", true)
    .in("ticker", DEMO_TICKERS)
    .limit(10);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

export default router;
