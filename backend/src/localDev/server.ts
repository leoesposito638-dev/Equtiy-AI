// ============================================================================
// Equity AI — Local Dev Server (zero npm dependencies)
//
// Runs the REAL scoring engine (src/scoring/scoringEngine.ts, unmodified),
// the REAL calculation functions, and the REAL ingestion validators/
// normalizers end to end, over Node's built-in `http` module, backed by
// localDev/inMemoryRepo.ts instead of Postgres/Supabase.
//
// This is a wiring-proof and local sanity check, NOT the production API —
// production uses src/api/server.ts (Express, real routes, Supabase). Use
// this to verify the engine itself is correct before you have a database or
// vendor credentials at all.
//
// Run it with:  npx ts-node src/localDev/server.ts
// (or, after `npm run build`:  node dist/localDev/server.js)
// ============================================================================

import { createServer } from "node:http";
import { calculateFundamentalScore } from "../scoring/scoringEngine";
import { detectChanges, toAlertDraft } from "../changeDetection/changeDetector";
import { InMemoryStore } from "./inMemoryRepo";
import { SEED_COMPANIES } from "./seedData";

const PORT = Number(process.env.PORT ?? 4000);

async function bootstrap() {
  const store = new InMemoryStore();
  const changesByCompany = new Map<string, ReturnType<typeof detectChanges>>();
  const alertsByCompany = new Map<string, Array<ReturnType<typeof toAlertDraft>>>();

  console.log("Running the real scoring engine against local seed data (no database, no npm installs)...\n");

  for (const company of SEED_COMPANIES) {
    // 1) Baseline run — only prior-period data known, as if this were the
    //    company's first-ever scoring pass.
    const baseline = await calculateFundamentalScore(company.id, store.buildBaselineRepoFor(company.id));
    store.commitAsPrevious(company.id);

    // 2) Current run — full history known; the engine picks up the committed
    //    baseline as `previousScore` and computes a real `scoreChange`.
    const current = await calculateFundamentalScore(company.id, store.buildRepoFor(company.id));

    // 3) Real change detection between the two snapshots.
    const events = detectChanges(company.id, current, { fundamentalScore: baseline.score, categoryScores: baseline.categoryScores })
      .map((e, i) => ({ ...e, id: `${company.id}-evt-${i}`, detectedAt: current.calculatedAt }));
    changesByCompany.set(company.id, events);
    alertsByCompany.set(company.id, events.map((e) => toAlertDraft(e, company.name)).filter(Boolean));

    console.log(
      `${company.ticker}: baseline ${baseline.score} (confidence ${(baseline.confidence * 100).toFixed(0)}%) -> ` +
      `current ${current.score} (confidence ${(current.confidence * 100).toFixed(0)}%, coverage ${(current.dataCoverage * 100).toFixed(0)}%), ` +
      `score_change ${current.scoreChange}`
    );
  }
  console.log("\nReady. Serving on http://localhost:" + PORT + "\n");

  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*"); // local dev only
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const parts = url.pathname.split("/").filter(Boolean);

    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.end(JSON.stringify({ data: body }));
    };
    const notFound = () => send(404, { error: "Not found" });

    try {
      if (parts[0] === "health") return send(200, { status: "ok", mode: "local-dev-in-memory" });

      if (parts[0] === "companies" && parts.length === 1) {
        return send(200, SEED_COMPANIES);
      }

      if (parts[0] === "companies" && parts[1]) {
        const companyId = parts[1];
        const company = SEED_COMPANIES.find((c) => c.id === companyId);
        if (!company) return notFound();

        if (parts.length === 2) return send(200, company);

        if (parts[2] === "scores") {
          const result = store.lastResult.get(companyId);
          if (!result) return send(200, { fundamental: null, categories: [] });
          return send(200, {
            fundamental: {
              score: result.score, confidence: result.confidence, data_coverage: result.dataCoverage,
              calculation_version: result.calculationVersion, previous_score: result.previousScore,
              score_change: result.scoreChange, calculated_at: result.calculatedAt,
            },
            categories: result.categoryScores.map((c) => ({
              score: c.score, confidence: c.confidence, coverage: c.coverage,
              calculation_version: c.calculationVersion, calculated_at: c.calculatedAt,
              score_categories: { category_key: c.categoryKey, name: c.categoryKey },
            })),
          });
        }

        if (parts[2] === "financials") {
          const snapshot = store.getSnapshot(companyId);
          if (!snapshot) return send(200, []);
          const rows = Object.entries(snapshot.raw)
            .filter(([k, v]) => typeof v === "number" && !k.endsWith("_history"))
            .map(([metric_name, value]) => ({ metric_name, value, unit: metric_name.includes("margin") || metric_name.includes("growth") ? "%" : "ratio", currency: "USD", period_end: "2026-06-30", period_type: "ANNUAL", source_id: "local-seed" }));
          return send(200, rows);
        }

        if (parts[2] === "changes") {
          return send(200, (changesByCompany.get(companyId) ?? []).map((e) => ({
            id: e.id, event_type: e.eventType, metric_name: e.metricName ?? null,
            old_value: e.oldValue ?? null, new_value: e.newValue ?? null,
            absolute_change: e.absoluteChange ?? null, percentage_change: e.percentageChange ?? null,
            importance_score: e.importanceScore, direction: e.direction, detected_at: e.detectedAt,
          })));
        }

        if (parts[2] === "analysis") {
          // No AI call in local-dev mode (no ANTHROPIC_API_KEY / no network) —
          // honestly returns null rather than fabricating a thesis.
          return send(200, { snapshot: null, thesis: null });
        }
      }

      if (parts[0] === "alerts") {
        const all = SEED_COMPANIES.flatMap((c) => (alertsByCompany.get(c.id) ?? []).map((a) => ({ ...a, companies: { name: c.name, ticker: c.ticker } })));
        return send(200, all);
      }

      notFound();
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
  });

  server.listen(PORT);
}

bootstrap().catch((e) => {
  console.error("Failed to start local dev server:", e);
  process.exit(1);
});
