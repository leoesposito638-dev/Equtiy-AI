// ============================================================================
// POST /internal/ingestion/company/:id
// POST /internal/scoring/company/:id
// POST /internal/analysis/company/:id
// POST /internal/monitoring/company/:id
//
// These endpoints run the actual pipeline stages and are the ONLY place the
// app is allowed to trigger provider calls, scoring, AI generation, or
// change detection for a company. Gated by requireInternalAuth — a
// service-to-service token, deliberately separate from user auth so a
// leaked user session can never trigger a re-score or spend AI budget.
// ============================================================================

import { Router, type Request, type Response, type NextFunction } from "express";
import { buildProviderRegistry } from "../../providers/registry";
import { calculateFundamentalScore } from "../../scoring/scoringEngine";
import { calculateOpportunityScore } from "../../scoring/opportunityScore";
import { detectChanges, toAlertDraft } from "../../changeDetection/changeDetector";
import { generateAnalysis } from "../../ai/aiService";
// import { ingestIncomeStatement } from "../../ingestion/ingest"; // wired once a real ScoringRepo/IngestionRepo/AiClient exist for the target environment

const router = Router();

export function requireInternalAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.header("x-internal-token");
  if (!token || token !== process.env.INTERNAL_SERVICE_TOKEN) {
    return res.status(403).json({ error: "Forbidden — internal endpoints require a valid service token." });
  }
  next();
}

router.post("/ingestion/company/:id", async (req, res) => {
  // Requires a concrete IngestionRepo backed by getDbClient() plus a real
  // (non-"unavailable") FinancialDataProvider. Wire this once vendor
  // credentials exist — see src/providers/registry.ts.
  const registry = buildProviderRegistry();
  void registry;
  res.status(501).json({
    error:
      "Ingestion is not runnable in this environment: no live database connection and no configured " +
      "FinancialDataProvider (see src/providers/registry.ts). The pipeline code (src/ingestion/ingest.ts) is complete.",
  });
});

router.post("/scoring/company/:id", async (req, res) => {
  // calculateFundamentalScore(req.params.id, repo) — requires a concrete
  // ScoringRepo implementation reading calculated_metrics/score_rules from
  // a live database. See tests/scoring.test.ts for a fully working example
  // against an in-memory fake ScoringRepo, proving the engine itself is
  // correct end-to-end without a database.
  void calculateFundamentalScore;
  void calculateOpportunityScore;
  res.status(501).json({ error: "Scoring requires a live database connection (see src/db/client.ts)." });
});

router.post("/analysis/company/:id", async (req, res) => {
  // generateAnalysis(input, new AnthropicClient(process.env.ANTHROPIC_API_KEY!))
  void generateAnalysis;
  res.status(501).json({ error: "Analysis requires ANTHROPIC_API_KEY and a live database connection." });
});

router.post("/monitoring/company/:id", async (req, res) => {
  // detectChanges(...) -> toAlertDraft(...) -> insert into alerts, for any
  // event at or above ALERT_THRESHOLD. Requires the scoring step above to
  // have already produced a new + previous FundamentalScore.
  void detectChanges;
  void toAlertDraft;
  res.status(501).json({ error: "Monitoring requires a live database connection and a completed scoring run." });
});

export default router;
