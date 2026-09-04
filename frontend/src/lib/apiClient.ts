// ============================================================================
// Equity AI — API Client
// One function per endpoint documented in ../backend
// (src/api/routes/*.ts, brief §47). This is the ONLY module in the frontend
// allowed to call `fetch`. Every function throws ApiError on failure —
// callers (the hooks in useApi.ts) decide whether to fall back to demo
// fixtures, never this layer.
// ============================================================================

import { API_BASE_URL, DEMO_USER_ID } from "./config";
import type {
  AlertRow, AnalysisResponse, CalculatedMetricRow, Company,
  FinancialMetricRow, ScoresResponse, ChangeEventRow, Watchlist,
} from "./types";

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError("No API_BASE_URL configured — set VITE_API_BASE_URL to reach a live backend.");
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "x-user-id": DEMO_USER_ID, ...init?.headers },
    });
  } catch (e) {
    throw new ApiError(`Could not reach the Equity AI API at ${API_BASE_URL}${path}: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(`${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`, res.status);
  }
  const json = await res.json();
  return json.data as T;
}

export const api = {
  listCompanies: () => request<Company[]>("/companies"),
  getCompany: (id: string) => request<Company>(`/companies/${id}`),
  getCompanyMetrics: (id: string) => request<CalculatedMetricRow[]>(`/companies/${id}/metrics`),
  getCompanyFinancials: (id: string) => request<FinancialMetricRow[]>(`/companies/${id}/financials`),
  getCompanyValuation: (id: string) => request<CalculatedMetricRow[]>(`/companies/${id}/valuation`),
  getCompanyScores: (id: string) => request<ScoresResponse>(`/companies/${id}/scores`),
  getCompanyAnalysis: (id: string) => request<AnalysisResponse>(`/companies/${id}/analysis`),
  getCompanyChanges: (id: string) => request<ChangeEventRow[]>(`/companies/${id}/changes`),
  search: (q: string) => request<Company[]>(`/search?q=${encodeURIComponent(q)}`),

  listWatchlists: () => request<Watchlist[]>("/watchlists"),
  createWatchlist: (name: string) =>
    request<Watchlist>("/watchlists", { method: "POST", body: JSON.stringify({ name }) }),
  addToWatchlist: (watchlistId: string, companyId: string) =>
    request<{ ok: true }>(`/watchlists/${watchlistId}/companies`, {
      method: "POST",
      body: JSON.stringify({ companyId }),
    }),
  removeFromWatchlist: (watchlistId: string, companyId: string) =>
    request<void>(`/watchlists/${watchlistId}/companies/${companyId}`, { method: "DELETE" }),

  listAlerts: () => request<AlertRow[]>("/alerts"),
  markAlertRead: (id: string) => request<{ ok: true }>(`/alerts/${id}/read`, { method: "PATCH" }),
};
