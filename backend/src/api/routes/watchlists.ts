// ============================================================================
// POST /watchlists
// POST /watchlists/:id/companies
// DELETE /watchlists/:id/companies/:companyId
// ============================================================================

import { Router } from "express";
import { getDbClient } from "../../db/client";
import { requireUser } from "../auth";

const router = Router();

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
