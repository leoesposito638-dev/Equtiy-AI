import { describe, it, expect } from "vitest";
import { followedFromWatchlists } from "./watchlistState";
import type { Watchlist } from "./types";

function watchlist(id: string, companyIds: string[]): Watchlist {
  return {
    id, user_id: "00000000-0000-0000-0000-000000000001", name: "My Companies", created_at: "2026-09-01T00:00:00Z",
    watchlist_companies: companyIds.map((company_id) => ({ company_id })),
  };
}

describe("followedFromWatchlists", () => {
  it("returns an empty set and no watchlist id when the user has no watchlist yet", () => {
    const result = followedFromWatchlists([]);
    expect(result.watchlistId).toBeNull();
    expect(result.followed.size).toBe(0);
  });

  it("extracts the followed company ids from the embedded watchlist_companies join", () => {
    const result = followedFromWatchlists([watchlist("wl-1", ["nvda-id", "lly-id"])]);
    expect(result.watchlistId).toBe("wl-1");
    expect([...result.followed].sort()).toEqual(["lly-id", "nvda-id"]);
  });

  it("returns an empty followed set for a watchlist with no members yet", () => {
    const result = followedFromWatchlists([watchlist("wl-1", [])]);
    expect(result.watchlistId).toBe("wl-1");
    expect(result.followed.size).toBe(0);
  });

  it("treats a missing watchlist_companies field as empty rather than throwing (POST /watchlists's response shape)", () => {
    const bare: Watchlist = { id: "wl-1", user_id: "u", name: "My Companies", created_at: "2026-09-01T00:00:00Z" };
    const result = followedFromWatchlists([bare]);
    expect(result.followed.size).toBe(0);
  });

  it("uses only the first watchlist when more than one exists, never merging or fabricating extra membership", () => {
    const result = followedFromWatchlists([watchlist("wl-1", ["nvda-id"]), watchlist("wl-2", ["lly-id"])]);
    expect(result.watchlistId).toBe("wl-1");
    expect([...result.followed]).toEqual(["nvda-id"]);
  });
});
