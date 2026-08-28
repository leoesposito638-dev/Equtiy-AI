// ============================================================================
// Shared "followed companies" state, backed by useFollowedSet. Lives in
// context so Overview/My Companies/Discover/Company-page all see the same
// membership without re-fetching or duplicating local state per page.
// ============================================================================

import React, { createContext, useContext } from "react";
import { useFollowedSet } from "./useApi";

interface FollowedContextValue {
  followed: Set<string>;
  toggle: (id: string) => void;
}

const FollowedContext = createContext<FollowedContextValue | null>(null);

export function FollowedProvider({ children }: { children: React.ReactNode }) {
  const [followed, toggle] = useFollowedSet();
  return <FollowedContext.Provider value={{ followed, toggle }}>{children}</FollowedContext.Provider>;
}

export function useFollowed(): FollowedContextValue {
  const ctx = useContext(FollowedContext);
  if (!ctx) throw new Error("useFollowed must be used within a FollowedProvider");
  return ctx;
}
