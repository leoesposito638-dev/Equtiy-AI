// ============================================================================
// Regression test for Milestone 11C: DEMO_USER_ID must stay UUID-shaped.
// alerts.user_id / watchlists.user_id are `uuid not null` columns with no
// app-level format check (backend/src/api/auth.ts forwards the x-user-id
// header as-is) — a non-UUID default (e.g. the literal string "demo-user")
// makes every /alerts and /watchlists request fail with a 500 from
// Postgres's own type cast. This guards against that regressing silently.
// ============================================================================

import { describe, it, expect } from "vitest";
import { DEMO_USER_ID } from "./config";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("DEMO_USER_ID", () => {
  it("is UUID-shaped so it's a valid value for alerts.user_id / watchlists.user_id", () => {
    expect(DEMO_USER_ID).toMatch(UUID_RE);
  });

  it("is not the old non-UUID placeholder that caused the Milestone 11B alerts 500", () => {
    expect(DEMO_USER_ID).not.toBe("demo-user");
  });
});
