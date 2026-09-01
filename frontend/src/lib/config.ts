// ============================================================================
// Runtime configuration
// ============================================================================

export const API_BASE_URL: string | undefined = import.meta.env.VITE_API_BASE_URL || undefined;

/** Sent as x-user-id on every real request (apiClient.ts) — the backend's
 * alerts.user_id / watchlists.user_id columns are `uuid not null` with no
 * app-level format check (auth.ts's requireUser forwards the header as-is),
 * so this single demo identity must be UUID-shaped or Postgres rejects the
 * query outright (500). Same one identity as before — "00000000-...0001"
 * is a fixed, obviously-a-placeholder value, not a real generated user id. */
export const DEMO_USER_ID: string = import.meta.env.VITE_DEMO_USER_ID || "00000000-0000-0000-0000-000000000001";

/** True whenever there's no backend to actually call — the app runs entirely
 * on fixtures.ts in this mode, and every page surfaces that state visibly
 * rather than silently presenting fixtures as if they were live. */
export const DEMO_MODE = !API_BASE_URL;
