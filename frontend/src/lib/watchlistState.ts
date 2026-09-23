// ============================================================================
// Pure mapping from GET /watchlists's response shape (Watchlist[], each with
// an embedded watchlist_companies join) to the { watchlistId, followed }
// shape useFollowedSet needs. Extracted so the one piece of real mapping
// logic here is unit-testable without a React/jsdom test harness.
// ============================================================================

import type { Watchlist } from "./types";

export interface FollowedFromWatchlists {
  watchlistId: string | null;
  followed: Set<string>;
}

/** The demo user has at most one watchlist in practice (created lazily on
 * first follow) — this takes the first one returned and ignores any others
 * rather than merging, so behavior stays predictable if that ever changes. */
export function followedFromWatchlists(watchlists: Watchlist[]): FollowedFromWatchlists {
  const mine = watchlists[0] ?? null;
  return {
    watchlistId: mine?.id ?? null,
    followed: new Set((mine?.watchlist_companies ?? []).map((wc) => wc.company_id)),
  };
}
