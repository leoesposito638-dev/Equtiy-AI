// ============================================================================
// Equity AI — Importance Scoring
// importance_score = f(magnitude, historical significance, peer significance,
// business relevance, score impact) — brief §35. Nothing becomes an alert
// just because a number moved.
// ============================================================================

export interface ImportanceInputs {
  /** How big the move is in absolute terms, already normalized by the caller
   *  (e.g. |Δscore| out of 100, or |Δmetric| in standard deviations). */
  magnitude: number; // 0..1
  /** Is this move large relative to the company's own historical volatility for this metric? */
  historicalSignificance: number; // 0..1
  /** Is this move large relative to how much peers are moving right now? */
  peerSignificance: number; // 0..1
  /** How central is this metric to the business (revenue > a minor opex line). */
  businessRelevance: number; // 0..1
  /** How much did this specific change move the top-level fundamental score. */
  scoreImpact: number; // 0..1
}

const WEIGHTS = {
  magnitude: 0.25,
  historicalSignificance: 0.2,
  peerSignificance: 0.15,
  businessRelevance: 0.2,
  scoreImpact: 0.2,
} as const;

export function computeImportanceScore(inputs: ImportanceInputs): number {
  const raw =
    inputs.magnitude * WEIGHTS.magnitude +
    inputs.historicalSignificance * WEIGHTS.historicalSignificance +
    inputs.peerSignificance * WEIGHTS.peerSignificance +
    inputs.businessRelevance * WEIGHTS.businessRelevance +
    inputs.scoreImpact * WEIGHTS.scoreImpact;

  return Math.round(clamp(raw, 0, 1) * 100);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function severityFor(importanceScore: number): "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (importanceScore >= 85) return "CRITICAL";
  if (importanceScore >= 65) return "HIGH";
  if (importanceScore >= 45) return "MEDIUM";
  if (importanceScore >= 25) return "LOW";
  return "INFO";
}

/** Only these graduate from change_events into a user-facing alert row. */
export const ALERT_THRESHOLD = 45; // MEDIUM and above
