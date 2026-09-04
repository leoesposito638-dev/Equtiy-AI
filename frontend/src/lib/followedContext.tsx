// ============================================================================
// Shared "followed companies" state, backed by useFollowedSet. Lives in
// context so Overview/My Companies/Discover/Company-page all see the same
// membership without re-fetching or duplicating local state per page.
// ============================================================================

import React, { createContext, useContext } from "react";
import { useFollowedSet, type FollowedState } from "./useApi";

const FollowedContext = createContext<FollowedState | null>(null);

export function FollowedProvider({ children }: { children: React.ReactNode }) {
  const state = useFollowedSet();
  return <FollowedContext.Provider value={state}>{children}</FollowedContext.Provider>;
}

export function useFollowed(): FollowedState {
  const ctx = useContext(FollowedContext);
  if (!ctx) throw new Error("useFollowed must be used within a FollowedProvider");
  return ctx;
}
