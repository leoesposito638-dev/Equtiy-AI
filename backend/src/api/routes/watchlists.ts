// ============================================================================
// GET /watchlists
// POST /watchlists
// POST /watchlists/:id/companies
// DELETE /watchlists/:id/companies/:companyId
// ============================================================================

import { Router } from "express";
import { getDbClient } from "../../db/client";
import { requireUser } from "../auth";

const router = Router();

// Added for Milestone 11D: without this, nothing could ever read watchlist
// state back — POST/DELETE existed with no way to load membership on mount
// or after a refresh. Same embedded-join pattern companies.ts already uses
// for /:id/scores (`.select("*, score_categories(...)")`).
router.get("/", requireUser, async (req, res) => {
  const db = getDbClient();
  const { data, error } = await db
    .from("watchlists")
    .select("*, watchlist_companies(company_id)")
    .eq("user_id", req.userId)
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.post("/", requireUser, async (req, res) => {
  const db = getDbClient();
  const { name } = req.body as { name?: string };
  const { data, error } = await db
    .from("watchlists")
    .insert({ user_id: req.userId, name: name ?? "My Companies" })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data });
});

router.post("/:id/companies", requireUser, async (req, res) => {
  const db = getDbClient();
  const { companyId } = req.body as { companyId?: string };
  if (!companyId) return res.status(400).json({ error: "companyId is required." });

  const { error } = await db
    .from("watchlist_companies")
    .insert({ watchlist_id: req.params.id, company_id: companyId });
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data: { ok: true } });
});

router.delete("/:id/companies/:companyId", requireUser, async (req, res) => {
  const db = getDbClient();
  const { error } = await db
    .from("watchlist_companies")
    .delete()
    .eq("watchlist_id", req.params.id)
    .eq("company_id", req.params.companyId);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

export default router;
