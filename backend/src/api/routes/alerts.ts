// ============================================================================
// GET /alerts
// PATCH /alerts/:id/read
// ============================================================================

import { Router } from "express";
import { getDbClient } from "../../db/client";
import { requireUser } from "../auth";

const router = Router();

router.get("/", requireUser, async (req, res) => {
  const db = getDbClient();
  const { data, error } = await db
    .from("alerts")
    .select("*, companies(name, ticker)")
    .eq("user_id", req.userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.patch("/:id/read", requireUser, async (req, res) => {
  const db = getDbClient();
  const { error } = await db
    .from("alerts")
    .update({ is_read: true })
    .eq("id", req.params.id)
    .eq("user_id", req.userId); // never let a user mark someone else's alert read
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: { ok: true } });
});

export default router;
