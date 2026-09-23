// ============================================================================
// One-off export: captures the REAL Supabase-backed state of the 30-company
// demo universe into a static JSON snapshot, in exactly the shape the
// frontend's real API client already consumes (see ../api/routes/*.ts).
//
// This exists to replace the old hand-written FAKE fixture data
// (frontend/src/lib/fixtures.ts) with a real, non-fabricated capture of the
// actual database — so a backend-less local demo still shows real numbers.
//
// Read-only, and uses nothing but the existing, unmodified API routes: this
// script boots the same buildServer() the real deployment uses, on an
// ephemeral loopback port, and issues plain GET requests against it — the
// exact same requests the browser's apiClient.ts makes. No new queries, no
// writes, no schema/methodology changes.
//
// Run with: npx ts-node --transpile-only src/localDev/exportRealDemoSnapshot.ts
// (requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment)
// ============================================================================

import { writeFileSync } from "fs";
import path from "path";
import { buildServer } from "../api/server";
import { DEMO_TICKERS } from "../config/demoUniverse";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  const app = buildServer();
  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to bind ephemeral port.");
  const base = `http://127.0.0.1:${address.port}`;

  async function get<T>(reqPath: string): Promise<T> {
    const res = await fetch(`${base}${reqPath}`, { headers: { "x-user-id": DEMO_USER_ID } });
    if (!res.ok) throw new Error(`GET ${reqPath} -> ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { data: T };
    return body.data;
  }

  const companies = await get<Array<{ id: string; ticker: string }>>("/companies");

  // Fail fast on exactly the invariants the demo depends on — never silently
  // export a snapshot that's missing a required ticker or leaking a legacy
  // one.
  const gotTickers = new Set(companies.map((c) => c.ticker));
  const missing = DEMO_TICKERS.filter((t) => !gotTickers.has(t));
  const extra = companies.map((c) => c.ticker).filter((t) => !(DEMO_TICKERS as readonly string[]).includes(t));
  if (companies.length !== 30) throw new Error(`Expected exactly 30 companies, got ${companies.length}.`);
  if (missing.length) throw new Error(`Missing required demo tickers: ${missing.join(", ")}`);
  if (extra.length) throw new Error(`Unexpected non-demo tickers present: ${extra.join(", ")}`);

  const scores: Record<string, unknown> = {};
  const financials: Record<string, unknown> = {};
  const metrics: Record<string, unknown> = {};
  const valuation: Record<string, unknown> = {};
  const analysis: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};

  for (const c of companies) {
    scores[c.id] = await get(`/companies/${c.id}/scores`);
    financials[c.id] = await get(`/companies/${c.id}/financials`);
    metrics[c.id] = await get(`/companies/${c.id}/metrics`);
    valuation[c.id] = await get(`/companies/${c.id}/valuation`);
    analysis[c.id] = await get(`/companies/${c.id}/analysis`);
    changes[c.id] = await get(`/companies/${c.id}/changes`);
  }

  const alerts = await get<unknown[]>("/alerts");

  const snapshot = {
    generatedAt: new Date().toISOString(),
    companies,
    scores,
    financials,
    metrics,
    valuation,
    analysis,
    changes,
    alerts,
  };

  const outPath = path.resolve(__dirname, "../../../frontend/src/data/realDemoSnapshot.json");
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n");
  // eslint-disable-next-line no-console
  console.log(`Wrote real-data snapshot for ${companies.length} companies to ${outPath}`);

  server.close();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
