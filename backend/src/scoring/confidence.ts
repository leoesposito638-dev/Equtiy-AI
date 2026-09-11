// ============================================================================
// Equity AI — Confidence & Coverage
//
// Score and confidence are ALWAYS kept separate (brief §20). A company with
// thin data must never present the same way as one with rich data, even if
// the point estimate happens to land on the same number.
// ============================================================================

export interface RuleEvaluation {
  weight: number;
  hasEnoughData: boolean;
  usedBenchmark: boolean; // false => fell back to scoreFromTrendOnly, lower-trust path
}

export interface ConfidenceResult {
  coverage: number;   // fraction of total rule weight that had enough data
  confidence: number; // 0..1 — coverage further discounted when benchmarks were missing
}

export function computeConfidence(evaluations: RuleEvaluation[]): ConfidenceResult {
  const totalWeight = evaluations.reduce((s, e) => s + e.weight, 0);
  if (totalWeight === 0) return { coverage: 0, confidence: 0 };

  const coveredWeight = evaluations
    .filter((e) => e.hasEnoughData)
    .reduce((s, e) => s + e.weight, 0);

  const benchmarkedWeight = evaluations
    .filter((e) => e.hasEnoughData && e.usedBenchmark)
    .reduce((s, e) => s + e.weight, 0);

  const coverage = coveredWeight / totalWeight;

  // Confidence = coverage, further penalized for the portion of covered
  // weight that had to fall back to a trend-only estimate (no peer/
  // historical benchmark available).
  const benchmarkedShareOfCovered = coveredWeight > 0 ? benchmarkedWeight / coveredWeight : 0;
  const confidence = coverage * (0.5 + 0.5 * benchmarkedShareOfCovered);

  return { coverage: round(coverage), confidence: round(confidence) };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
