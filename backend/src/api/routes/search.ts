// ============================================================================
// GET /search?q=
//
// Milestone 16C item 4 — SECURITY FIX: the previous implementation built a
// PostgREST `.or()` filter by directly interpolating the raw query string
// into `name.ilike.%${q}%,ticker.ilike.%${q}%`. PostgREST's `or=` syntax is
// a comma-separated list of `column.operator.value` clauses, with `(` `)`
// used for logical grouping — a query containing a comma, a dot, or a
// paren could therefore change which clauses the filter actually contains
// (e.g. append an unintended clause, or break the grouping), not just what
// it searches for. There is no privilege escalation here (search only ever
// reads the already-public `companies` table, further scoped to
// is_active/DEMO_TICKERS below), but the filter's MEANING was not supposed
// to be user-controlled, and wasn't reliably that.
//
// Fix: two independent single-column `.ilike()` calls instead of one
// hand-built `.or()` string. Each column filter is its own query parameter
// — the query value is never parsed as a list of clauses, so a comma, dot,
// paren, or percent sign in `q` can only ever be literal characters to
// match against, never filter syntax. Results are merged and de-duplicated
// in application code (small result sets — capped at 10 total — so this is
// cheap), with an exact-ticker match sorted first since that's almost
// always what a user typing a ticker wants.
// ============================================================================

import { Router } from "express";
import { getDbClient } from "../../db/client";
import { DEMO_TICKERS } from "../../config/demoUniverse";

const router = Router();

interface CompanySearchRow {
  id: string;
  name: string;
  ticker: string;
  exchange: string | null;
  sector: string | null;
}

router.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 1) return res.json({ data: [] });

  const db = getDbClient();
  const SELECT = "id, name, ticker, exchange, sector";

  const [byName, byTicker] = await Promise.all([
    db.from("companies").select(SELECT).ilike("name", `%${q}%`).eq("is_active", true).in("ticker", DEMO_TICKERS).limit(10),
    db.from("companies").select(SELECT).ilike("ticker", `%${q}%`).eq("is_active", true).in("ticker", DEMO_TICKERS).limit(10),
  ]);

  if (byName.error) return res.status(500).json({ error: byName.error.message });
  if (byTicker.error) return res.status(500).json({ error: byTicker.error.message });

  const byId = new Map<string, CompanySearchRow>();
  for (const row of [...(byName.data ?? []), ...(byTicker.data ?? [])] as CompanySearchRow[]) {
    byId.set(row.id, row);
  }

  const qUpper = q.toUpperCase();
  const results = [...byId.values()].sort((a, b) => {
    const aExact = a.ticker.toUpperCase() === qUpper ? 0 : 1;
    const bExact = b.ticker.toUpperCase() === qUpper ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return a.name.localeCompare(b.name);
  });

  res.json({ data: results.slice(0, 10) });
});

export default router;
