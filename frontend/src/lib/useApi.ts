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

import { useEffect, useRef, useState } from "react";
import { DEMO_MODE } from "./config";
import { api, ApiError } from "./apiClient";
import { filterToDemoUniverse } from "./demoUniverse";
import { followedFromWatchlists } from "./watchlistState";
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
  return useAsync(() => api.listCompanies().then(filterToDemoUniverse), FIXTURE_COMPANIES, []);
}

export function useCompanyMetrics(id: string | undefined): AsyncState<CalculatedMetricRow[]> {
  return useAsync(() => api.getCompanyMetrics(id!), [], [id]);
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

export interface FollowedState {
  followed: Set<string>;
  loading: boolean;
  toggle: (id: string) => void;
}

/** Real-mode: membership comes from GET /watchlists (watchlist_companies,
 * joined) on mount, and every Follow/Unfollow persists via
 * POST/DELETE /watchlists/:id/companies — this demo user's watchlist is
 * created lazily (api.createWatchlist) the first time they follow anything,
 * not eagerly on load. Demo mode is unchanged: pure local fixture state. */
export function useFollowedSet(): FollowedState {
  const [followed, setFollowed] = useState<Set<string>>(() => new Set(DEMO_MODE ? FIXTURE_FOLLOWED : []));
  const [loading, setLoading] = useState(!DEMO_MODE);
  const watchlistId = useRef<string | null>(null);

  useEffect(() => {
    if (DEMO_MODE) return;
    let cancelled = false;
    api
      .listWatchlists()
      .then((watchlists) => {
        if (cancelled) return;
        const { watchlistId: id, followed: ids } = followedFromWatchlists(watchlists);
        watchlistId.current = id;
        setFollowed(ids);
        setLoading(false);
      })
      .catch(() => {
        // Real failure — leave followed empty rather than fabricating
        // membership; loading still clears so the app doesn't hang.
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const toggle = (id: string) => {
    if (DEMO_MODE) {
      setFollowed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return;
    }

    const wasFollowed = followed.has(id);
    setFollowed((prev) => {
      const next = new Set(prev);
      if (wasFollowed) next.delete(id); else next.add(id);
      return next;
    });

    (async () => {
      try {
        if (wasFollowed) {
          if (!watchlistId.current) return; // nothing persisted yet, nothing to remove
          await api.removeFromWatchlist(watchlistId.current, id);
        } else {
          if (!watchlistId.current) {
            const created = await api.createWatchlist("My Companies");
            watchlistId.current = created.id;
          }
          await api.addToWatchlist(watchlistId.current, id);
        }
      } catch {
        // Revert the optimistic change on failure — never leave local state
        // claiming a persistence that didn't actually happen.
        setFollowed((prev) => {
          const next = new Set(prev);
          if (wasFollowed) next.add(id); else next.delete(id);
          return next;
        });
      }
    })();
  };

  return { followed, loading, toggle };
}
