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
