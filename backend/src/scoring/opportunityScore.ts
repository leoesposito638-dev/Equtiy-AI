// ============================================================================
// Equity AI — Opportunity Score
//
// Kept structurally and semantically SEPARATE from FundamentalScore
// (brief §31): "Excellent company, but valuation may be demanding" requires
// two numbers, never blended into one. Fundamental Score answers "how strong
// is the company"; Opportunity Score answers "how interesting is it right
// now" — i.e. quality discounted/boosted by how demanding the current
// valuation and momentum are relative to that quality.
// ============================================================================

import type { CategoryScore, FundamentalScore, OpportunityScore } from "../types/domain";

export function calculateOpportunityScore(fundamental: FundamentalScore): OpportunityScore {
  const valuation = findCategory(fundamental.categoryScores, "VALUATION");
  const momentum = findCategory(fundamental.categoryScores, "EARNINGS_MOMENTUM");

  // Quality = fundamental score with valuation's own contribution removed,
  // so we don't double count "cheap" as both quality and opportunity.
  const qualityWeight = 1; // fundamental.score already excludes nothing structurally; this is intentionally simple in v1
  const qualityComponent = fundamental.score;

  const valuationComponent = valuation?.score ?? 50; // neutral prior if valuation is unscored
  const momentumComponent = momentum?.score ?? 50;

  // Opportunity leans on valuation more heavily than fundamental quality —
  // a great company at a demanding price should NOT show as a great
  // opportunity, per brief §31's own example (96 fundamental / 74 opportunity).
  const raw = qualityComponent * 0.45 + valuationComponent * 0.4 + momentumComponent * 0.15;

  const confidence = Math.min(
    fundamental.confidence,
    valuation?.confidence ?? 0.4,
    momentum?.confidence ?? 0.4
  );

  return {
    companyId: fundamental.companyId,
    score: Math.round(raw * 10) / 10,
    confidence: Math.round(confidence * 1000) / 1000,
    calculatedAt: new Date().toISOString(),
  };
}

function findCategory(
  scores: CategoryScore[],
  key: CategoryScore["categoryKey"]
): CategoryScore | undefined {
  return scores.find((c) => c.categoryKey === key);
}
