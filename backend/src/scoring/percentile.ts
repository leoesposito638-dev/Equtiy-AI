// ============================================================================
// Equity AI — Percentile Engine
//
// Converts a raw metric value into a 0-100 score by locating it against a
// distribution (peer group and/or historical benchmark), NOT a hardcoded
// threshold. This is the core mechanism behind brief §22 ("no simple hard
// thresholds").
// ============================================================================

import type { Direction } from "../types/domain";
import type { MetricBenchmark } from "../types/domain";

/**
 * Given a company's value and a benchmark distribution (p25/median/p75/p90),
 * interpolate a 0-100 percentile score. Direction flips which end is "good".
 * OPTIMAL_RANGE treats the median as the ideal point and penalizes distance
 * from it in either direction (used for e.g. current_ratio, where both too
 * low and too high are red flags).
 */
export function scoreAgainstBenchmark(
  value: number | null,
  benchmark: MetricBenchmark | null,
  direction: Direction
): { score: number | null; percentile: number | null } {
  if (value === null || !benchmark) return { score: null, percentile: null };

  const { p25, median, p75, p90 } = benchmark;

  if (direction === "OPTIMAL_RANGE") {
    // Distance from median, normalized by the p25-p75 spread; closer = better.
    const spread = Math.max(p75 - p25, 1e-9);
    const distance = Math.abs(value - median) / spread;
    const score = clamp(100 - distance * 50, 0, 100);
    return { score, percentile: score }; // symmetric — percentile isn't directional here
  }

  // Piecewise-linear interpolation across the known percentile anchors.
  const anchors: Array<[number, number]> = [
    [0, Math.min(p25, median) - (p75 - p25 || 1)], // rough floor
    [25, p25],
    [50, median],
    [75, p75],
    [90, p90],
    [100, p90 + (p90 - p75 || 1)], // rough ceiling
  ];

  let percentile = interpolate(anchors, value);
  percentile = clamp(percentile, 0, 100);

  const score = direction === "HIGHER_IS_BETTER" ? percentile : 100 - percentile;
  return { score: clamp(score, 0, 100), percentile };
}

function interpolate(anchors: Array<[number, number]>, value: number): number {
  // anchors sorted by the *value* axis (2nd element) ascending
  const sorted = [...anchors].sort((a, b) => a[1] - b[1]);
  if (value <= sorted[0][1]) return sorted[0][0];
  if (value >= sorted[sorted.length - 1][1]) return sorted[sorted.length - 1][0];
  for (let i = 0; i < sorted.length - 1; i++) {
    const [pctA, valA] = sorted[i];
    const [pctB, valB] = sorted[i + 1];
    if (value >= valA && value <= valB) {
      const t = valB === valA ? 0 : (value - valA) / (valB - valA);
      return pctA + t * (pctB - pctA);
    }
  }
  return 50;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Fallback when no peer/historical benchmark exists at all: score purely off
 * the company's own trend direction, heavily capped so absence of a
 * benchmark can never manufacture a high-confidence extreme score. The
 * scoring engine also drops confidence sharply whenever this path is used
 * (see scoringEngine.ts).
 */
export function scoreFromTrendOnly(trendValue: number | null, direction: Direction): number | null {
  if (trendValue === null) return null;
  const normalized = clamp(trendValue * 10, -1, 1); // trend slope -> [-1, 1]
  const directional = direction === "LOWER_IS_BETTER" ? -normalized : normalized;
  return clamp(50 + directional * 25, 25, 75); // capped to [25,75] — never "excellent" or "terrible" on trend alone
}
