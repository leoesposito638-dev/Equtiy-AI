// ============================================================================
// The one score to headline for a company: the real fundamental_scores row
// when one exists, otherwise the real GROWTH category_scores row (the only
// category scored so far), otherwise nothing. Never fabricates a value —
// returns null when neither exists, exactly as the backend reported it.
// ============================================================================

import type { ScoresResponse } from "./types";

export interface PrimaryScore {
  score: number;
  confidence: number;
  label: string;
}

export function primaryScore(scores: ScoresResponse | null | undefined): PrimaryScore | null {
  if (!scores) return null;
  if (scores.fundamental) {
    return { score: scores.fundamental.score, confidence: scores.fundamental.confidence, label: "Fundamental Score" };
  }
  const growth = scores.categories.find((c) => c.score_categories.category_key === "GROWTH");
  if (growth) {
    return { score: growth.score, confidence: growth.confidence, label: "Growth Score" };
  }
  return null;
}
