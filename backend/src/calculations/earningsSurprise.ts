// ============================================================================
// Equity AI — Earnings Surprise Formulas (Milestone 14B)
//
// Pure, deterministic functions — no I/O, no provider/db access — same
// convention as calculations/metrics.ts and calculations/forwardEps.ts:
// return null (never 0, never a guess) whenever a required input is
// missing or the formula would be mathematically invalid.
//
// EPS surprise   = (actual EPS - consensus EPS) / abs(consensus EPS)
// Revenue surprise = (actual revenue - consensus revenue) / abs(consensus revenue)
//
// Both are exactly pctChange(actual, consensus) from calculations/metrics.ts
// (same shape: (current - prior) / abs(prior)) — reused rather than
// reimplemented, with explicit non-finite guards added on top since
// pctChange's own `=== null` checks don't catch NaN/Infinity (NaN !== null
// in JS), and this milestone's test matrix requires non-finite input to be
// rejected explicitly, not just null input.
//
// This file intentionally does NOT apply any plausibility/data-quality
// guard (e.g. rejecting an implausibly large magnitude) — that is a
// SEPARATE, additional layer (calculations/earningsDataQuality.ts,
// Milestone 14B §8), applied by the ingestion layer on top of these pure
// formula results. Keeping the two concerns in separate files/functions
// mirrors the ticket's own separation between §4 (the formula) and §8 (the
// guard).
// ============================================================================

import { pctChange } from "./metrics";

export interface EarningsSurpriseResult {
  value: number | null;
  reason?: string;
}

function missing(label: string): EarningsSurpriseResult {
  return { value: null, reason: `${label} is missing.` };
}

function invalid(label: string, v: number): EarningsSurpriseResult {
  return { value: null, reason: `${label} is not a finite number (${v}).` };
}

/** Shared by EPS and revenue — both are the exact same formula shape over
 *  different fields. `label` is used only in the diagnostic `reason` text. */
function surprisePercent(actual: number | null, consensus: number | null, label: string): EarningsSurpriseResult {
  if (actual === null) return missing(`actual ${label}`);
  if (consensus === null) return missing(`consensus ${label}`);
  if (!Number.isFinite(actual)) return invalid(`actual ${label}`, actual);
  if (!Number.isFinite(consensus)) return invalid(`consensus ${label}`, consensus);
  if (consensus === 0) return { value: null, reason: `consensus ${label} is zero.` };

  const value = pctChange(actual, consensus);
  if (value === null || !Number.isFinite(value)) {
    return { value: null, reason: `${label} surprise result is not a finite number.` };
  }
  return { value };
}

export function calculateEpsSurprisePercent(actualEps: number | null, consensusEps: number | null): EarningsSurpriseResult {
  return surprisePercent(actualEps, consensusEps, "EPS");
}

export function calculateRevenueSurprisePercent(
  actualRevenue: number | null,
  consensusRevenue: number | null
): EarningsSurpriseResult {
  return surprisePercent(actualRevenue, consensusRevenue, "revenue");
}
