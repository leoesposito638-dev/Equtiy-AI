// ============================================================================
// Equity AI — Benchmark Tier Resolution (Milestone 5)
//
// Pure, no DB. Given whatever benchmark rows exist for a company's sector
// and for the market-wide tier (already fetched by the I/O layer — see
// supabaseBenchmarkRepo.ts), decides which one a score should actually use,
// and — the point of this module — makes that decision an explicit,
// inspectable value, never an implicit side effect. Sector-first, per
// approved decision 3.
//
// This module covers the 3 provenance states that exist at the
// benchmark-LOOKUP level: SECTOR, MARKET_WIDE, UNAVAILABLE. The 4th
// approved state, TREND_ONLY, is scoreCategory.ts's existing internal
// fallback when NO benchmark exists at all for a metric — it only exists
// once a benchmark lookup has already come back UNAVAILABLE and the engine
// tries a company's own trend instead. See the Milestone 5 report for the
// specific, not-yet-implemented integration point that would let
// scoreCategory.ts surface TREND_ONLY alongside these three.
// ============================================================================

import type { MetricBenchmark } from "../types/domain";

export type BenchmarkTier = "SECTOR" | "MARKET_WIDE" | "UNAVAILABLE";

export interface ResolvedBenchmark {
  tier: BenchmarkTier;
  benchmark: MetricBenchmark | null;
}

/**
 * Sector-first, market-wide fallback, explicit UNAVAILABLE otherwise
 * (approved decisions 2-3). Never falls back to an arbitrary or tiny
 * sample — both `sectorBenchmark` and `marketWideBenchmark` are expected to
 * already be null/undefined unless their respective sample-size threshold
 * was met (see computeBenchmarkTiers) — this function does not itself
 * re-check sample sizes; it only decides which of the two already-qualified
 * candidates (if either) to use.
 */
export function resolveBenchmarkTier(
  sectorBenchmark: MetricBenchmark | null | undefined,
  marketWideBenchmark: MetricBenchmark | null | undefined
): ResolvedBenchmark {
  if (sectorBenchmark) return { tier: "SECTOR", benchmark: sectorBenchmark };
  if (marketWideBenchmark) return { tier: "MARKET_WIDE", benchmark: marketWideBenchmark };
  return { tier: "UNAVAILABLE", benchmark: null };
}
