// ============================================================================
// Equity AI — API Server
// Express app assembling the routes listed in the brief (§47). Route
// handlers are intentionally thin — all real logic lives in
// ingestion/calculations/scoring/ai/changeDetection, which are unit tested
// independently. Internal endpoints are gated by a bearer-token check that
// is NOT the same auth path as user-facing endpoints.
// ============================================================================

import express from "express";
import companiesRouter from "./routes/companies";
import searchRouter from "./routes/search";
import watchlistsRouter from "./routes/watchlists";
import alertsRouter from "./routes/alerts";
import internalRouter, { requireInternalAuth } from "./routes/internal";

export function buildServer() {
  const app = express();
  app.use(express.json());

  // Minimal CORS so a browser-based frontend on a different origin/port can
  // reach this API — no `cors` package added, this is the whole of what's
  // needed (GET-only public surface, plus PATCH/POST for watchlists/alerts).
  // Local-dev/demo scope: matches the permissive `*` already used by
  // localDev/server.ts for the same reason.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-id");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Public/user-facing surface
  app.use("/companies", companiesRouter);
  app.use("/search", searchRouter);
  app.use("/watchlists", watchlistsRouter);
  app.use("/alerts", alertsRouter);

  // Internal/admin surface — ingestion, scoring, analysis, monitoring triggers.
  // Never reachable without a valid internal service token.
  app.use("/internal", requireInternalAuth, internalRouter);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  return app;
}

if (require.main === module) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  buildServer().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Equity AI API listening on :${port}`);
  });
}
