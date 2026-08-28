// ============================================================================
// Data-fetching hooks
//
// Every hook returns { data, loading, error, isDemo }. `isDemo` is true ONLY
// when DEMO_MODE is active (no backend configured at all) — it is never set
// just because a single request failed. A genuine request failure against a
// configured backend surfaces as `error`, with no silent fixture fallback,
// because pretending a real backend's error is "just demo data" would hide
// real problems.
// ============================================================================

import { useEffect, useState } from "react";
import { DEMO_MODE } from "./config";
import { api, ApiError } from "./apiClient";
import {
  FIXTURE_ALERTS, FIXTURE_ANALYSIS, FIXTURE_CHANGES, FIXTURE_COMPANIES,
  FIXTURE_FINANCIALS, FIXTURE_FOLLOWED, FIXTURE_SCORES, FIXTURE_VALUATION,
} from "./fixtures";
import type {
  AlertRow, AnalysisResponse, CalculatedMetricRow, ChangeEventRow, Company,
  FinancialMetricRow, ScoresResponse,
} from "./types";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  isDemo: boolean;
}

function useAsync<T>(fetcher: () => Promise<T>, demoValue: T, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null, isDemo: DEMO_MODE });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    if (DEMO_MODE) {
      // Simulate network latency so loading states are visibly exercised.
      const t = setTimeout(() => {
        if (!cancelled) setState({ data: demoValue, loading: false, error: null, isDemo: true });
      }, 250);
      return () => { cancelled = true; clearTimeout(t); };
    }

    fetcher()
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null, isDemo: false }); })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof ApiError ? e.message : "Unexpected error contacting the Equity AI API.";
        setState({ data: null, loading: false, error: message, isDemo: false });
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

export function useCompanies(): AsyncState<Company[]> {
  return useAsync(api.listCompanies, FIXTURE_COMPANIES, []);
}

export function useCompanyScores(id: string | undefined): AsyncState<ScoresResponse> {
  return useAsync(
    () => api.getCompanyScores(id!),
    id ? FIXTURE_SCORES[id] ?? { fundamental: null, categories: [] } : { fundamental: null, categories: [] },
    [id]
  );
}

export function useCompanyFinancials(id: string | undefined): AsyncState<FinancialMetricRow[]> {
  return useAsync(() => api.getCompanyFinancials(id!), id ? FIXTURE_FINANCIALS[id] ?? [] : [], [id]);
}

export function useCompanyValuation(id: string | undefined): AsyncState<CalculatedMetricRow[]> {
  return useAsync(() => api.getCompanyValuation(id!), id ? FIXTURE_VALUATION[id] ?? [] : [], [id]);
}

export function useCompanyAnalysis(id: string | undefined): AsyncState<AnalysisResponse> {
  return useAsync(
    () => api.getCompanyAnalysis(id!),
    id ? FIXTURE_ANALYSIS[id] ?? { snapshot: null, thesis: null } : { snapshot: null, thesis: null },
    [id]
  );
}

export function useCompanyChanges(id: string | undefined): AsyncState<ChangeEventRow[]> {
  return useAsync(() => api.getCompanyChanges(id!), id ? FIXTURE_CHANGES[id] ?? [] : [], [id]);
}

export function useAlerts(): AsyncState<AlertRow[]> {
  return useAsync(api.listAlerts, FIXTURE_ALERTS, []);
}

/** Followed-company membership isn't a real endpoint response on its own in
 * the backend (it comes from watchlist_companies via a watchlist id this
 * demo doesn't have yet) — in demo mode we track it locally; in live mode
 * this should be replaced with a real watchlist id resolved via
 * POST /watchlists (see api.createWatchlist) the first time a user follows
 * a company, then persisted membership from that watchlist's companies. */
export function useFollowedSet(): [Set<string>, (id: string) => void] {
  const [followed, setFollowed] = useState<Set<string>>(() => new Set(DEMO_MODE ? FIXTURE_FOLLOWED : []));
  const toggle = (id: string) => {
    setFollowed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    // TODO(production): call api.addToWatchlist / api.removeFromWatchlist here
    // against the user's real watchlist id once watchlist bootstrap exists.
  };
  return [followed, toggle];
}
