// ============================================================================
// Equity AI — Company Description Ingestion (Milestone 16C, item 2)
//
// Populates companies.description (an existing, previously-unpopulated
// column — schema/001_core_tables.sql line 32; no schema change here) from
// FMP's /profile endpoint, for the 16 FMP-entitled companies only. FMP's own
// full paragraph is shortened to one sentence (calculations/
// textShortening.ts, a pure text-cut, never a reword) before being stored —
// the UNTRUNCATED original plus the exact source URL and retrieval
// timestamp are returned on the outcome so the caller can log/persist them
// for traceability, per the ticket's explicit "keep the original text
// traceable" requirement. This file itself never touches calculated_metrics,
// scoring, or the schema.
//
// Idempotent by design: never overwrites a description that is already
// non-null (whether set by an earlier run of this script or by any other
// means) — running this twice is a no-op for a company that already has one.
// ============================================================================

import { getDbClient } from "../db/client";
import { shortenToOneSentence } from "../calculations/textShortening";
import type { MarketDataProvider, ProviderCompanyRef } from "../providers/interfaces";

export interface CompanyDescriptionIngestionOutcome {
  ticker: string;
  status: "stored" | "skipped_existing" | "unavailable" | "error";
  /** FMP's own untruncated description — present only when status === "stored". */
  originalDescription?: string;
  shortenedDescription?: string;
  sourceUrl?: string;
  retrievedAt?: string;
  reason?: string;
}

export async function ingestCompanyDescription(
  companyId: string,
  ref: ProviderCompanyRef,
  marketData: MarketDataProvider
): Promise<CompanyDescriptionIngestionOutcome> {
  const db = getDbClient();

  const { data: existing, error: readError } = await db.from("companies").select("description").eq("id", companyId).single();
  if (readError) return { ticker: ref.ticker, status: "error", reason: `companies read failed: ${readError.message}` };
  if (existing?.description != null && existing.description.trim().length > 0) {
    return { ticker: ref.ticker, status: "skipped_existing" };
  }

  const result = await marketData.getCompanyProfile(ref);
  if (result.status !== "available" || !result.data) {
    return { ticker: ref.ticker, status: "unavailable", reason: result.unavailableReason };
  }

  const shortened = shortenToOneSentence(result.data.description ?? "");
  if (!shortened) {
    return { ticker: ref.ticker, status: "unavailable", reason: "Shortened description was empty." };
  }

  const { error: writeError } = await db.from("companies").update({ description: shortened }).eq("id", companyId);
  if (writeError) return { ticker: ref.ticker, status: "error", reason: `companies update failed: ${writeError.message}` };

  return {
    ticker: ref.ticker,
    status: "stored",
    originalDescription: result.data.description ?? undefined,
    shortenedDescription: shortened,
    sourceUrl: result.source?.sourceUrl,
    retrievedAt: new Date().toISOString(),
  };
}
