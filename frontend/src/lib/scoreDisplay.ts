// ============================================================================
// Milestone 16B — honesty rules for how a score is allowed to present itself.
//
// (a) Low confidence must never look authoritative: below
//     LOW_CONFIDENCE_THRESHOLD, a score-tier verdict word ("Excellent",
//     "Fair", ...) is replaced by "Insufficient data" everywhere a score
//     appears. The number itself is still shown — never hidden — just not
//     dressed up as a verdict. The threshold matches the boundary
//     ConfidenceBadge already used to switch to red (<50%), so this isn't a
//     new number invented for this milestone, just the same one enforced
//     consistently.
//
// (b) A score change is only real if both scores were produced by the same
//     calculation_version. fundamental_scores.previous_score/score_change
//     are static columns written at calculation time and say nothing about
//     which version the prior score came from — every rescore (v1.1 -> v1.2
//     -> v1.3, ...) is a brand-new row, so without checking versions a
//     "change" can just be two different scoring models disagreeing.
// ============================================================================

import type { FundamentalScoreRow } from "./types";
import { statusColor, statusFor, C } from "../styles/tokens";

export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export function isLowConfidence(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}

/** The exact wording every low-confidence score must show instead of a tier verdict. */
export const INSUFFICIENT_DATA_LABEL = "Insufficient data";

export function verdictLabel(score: number, confidence: number): string {
  if (isLowConfidence(confidence)) return INSUFFICIENT_DATA_LABEL;
  return statusFor(score);
}

export function verdictColor(score: number, confidence: number): string {
  if (isLowConfidence(confidence)) return C.textFaint;
  return statusColor(statusFor(score));
}

/**
 * True only when previous_score came from the SAME calculation_version as
 * the current row. previous_calculation_version is undefined for any
 * response captured before this milestone (e.g. a stale demo snapshot) —
 * treated as "unknown", which is not comparable, never as "assume yes".
 */
export function isComparableChange(fundamental: Pick<FundamentalScoreRow, "calculation_version" | "previous_score" | "previous_calculation_version"> | null | undefined): boolean {
  if (!fundamental) return false;
  if (fundamental.previous_score == null) return false;
  if (fundamental.previous_calculation_version == null) return false;
  return fundamental.previous_calculation_version === fundamental.calculation_version;
}
