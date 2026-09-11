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
