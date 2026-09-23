// ============================================================================
// Equity AI — Database Client
// Thin Supabase/Postgres client factory. All repositories (IngestionRepo,
// ScoringRepo, etc.) are implemented against this client elsewhere — kept
// out of this file so scoring/ingestion logic never imports a SQL driver
// directly and stays testable with in-memory fakes.
// ============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getDbClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. This environment has no live database configured — " +
        "repositories should be constructed with an in-memory fake for tests, and this client should only be " +
        "reached from a deployed environment with real credentials."
    );
  }

  client = createClient(url, serviceKey, { auth: { persistSession: false } });
  return client;
}
