// ============================================================================
// Demo fixtures — used ONLY when DEMO_MODE is true (no VITE_API_BASE_URL
// configured). Previously hand-written fake data; now sourced from
// realDemoSnapshot.json — a real, read-only capture of the actual
// Supabase-backed API responses for the 30-company demo universe (see
// backend/src/localDev/exportRealDemoSnapshot.ts). Same response shapes the
// real backend returns, real values, nothing fabricated: a metric with no
// stored value stays null/absent exactly as the live API would return it.
// ============================================================================

import snapshot from "../data/realDemoSnapshot.json";
import type {
  AlertRow, AnalysisResponse, CalculatedMetricRow, ChangeEventRow, Company,
  FinancialMetricRow, ScoresResponse,
} from "./types";

export const FIXTURE_COMPANIES: Company[] = snapshot.companies;

// Starts empty — real watchlist membership is a user action, not data to
// snapshot from the database. Follow/unfollow still works during the demo
// session (see useFollowedSet's DEMO_MODE branch in useApi.ts).
export const FIXTURE_FOLLOWED = new Set<string>();

export const FIXTURE_SCORES = snapshot.scores as unknown as Record<string, ScoresResponse>;
export const FIXTURE_FINANCIALS = snapshot.financials as unknown as Record<string, FinancialMetricRow[]>;
export const FIXTURE_METRICS = snapshot.metrics as unknown as Record<string, CalculatedMetricRow[]>;
export const FIXTURE_VALUATION = snapshot.valuation as unknown as Record<string, CalculatedMetricRow[]>;
export const FIXTURE_ANALYSIS = snapshot.analysis as unknown as Record<string, AnalysisResponse>;
export const FIXTURE_CHANGES = snapshot.changes as unknown as Record<string, ChangeEventRow[]>;
export const FIXTURE_ALERTS = snapshot.alerts as unknown as AlertRow[];

// Milestone 16B: the snapshot is real data, but it's a point-in-time
// capture — the scoring pipeline has moved on since (v1.1 -> v1.2 -> v1.3
// and beyond) and the snapshot never updates itself. DemoBanner must say
// exactly how stale it is rather than passing silently as if it were
// current. Derived from the snapshot's own contents, not hand-typed, so it
// can never drift from what's actually in the file.
function deriveSnapshotCalculationVersion(): string {
  const versions = new Set(
    Object.values(snapshot.scores as Record<string, ScoresResponse>)
      .map((s) => s.fundamental?.calculation_version)
      .filter((v): v is string => Boolean(v))
  );
  const list = [...versions];
  if (list.length === 0) return "unknown";
  if (list.length === 1) return list[0]!;
  return "mixed (" + list.sort().join(", ") + ")";
}

export const SNAPSHOT_META = {
  generatedAt: snapshot.generatedAt as string,
  calculationVersion: deriveSnapshotCalculationVersion(),
};
