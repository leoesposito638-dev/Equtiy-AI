// ============================================================================
// Equity AI — Change Detection Engine
// Compares a newly-calculated FundamentalScore against the previous
// snapshot's category scores and produces change_events. Only events at or
// above ALERT_THRESHOLD are turned into alerts (src/api used by the
// /internal/monitoring endpoint calls both in sequence).
// ============================================================================

import type { CategoryScore, ChangeEvent, FundamentalScore } from "../types/domain";
import { computeImportanceScore, severityFor, ALERT_THRESHOLD } from "./importance";

export interface PreviousSnapshot {
  fundamentalScore: number;
  categoryScores: CategoryScore[];
}

/** Business-relevance prior per category — revenue/margin-adjacent categories
 *  are treated as more central than e.g. management, all else equal. This is
 *  a starting prior only; see brief §35 — it's one of five inputs, not the
 *  whole story. */
const CATEGORY_RELEVANCE: Record<CategoryScore["categoryKey"], number> = {
  GROWTH: 0.9,
  PROFITABILITY: 0.9,
  FINANCIAL_HEALTH: 0.75,
  VALUATION: 0.6,
  CAPITAL_ALLOCATION: 0.55,
  COMPETITIVE_ADVANTAGE: 0.6,
  MANAGEMENT: 0.5,
  EARNINGS_MOMENTUM: 0.8,
};

export function detectChanges(
  companyId: string,
  current: FundamentalScore,
  previous: PreviousSnapshot | null
): Omit<ChangeEvent, "id" | "detectedAt">[] {
  const events: Omit<ChangeEvent, "id" | "detectedAt">[] = [];
  if (!previous) return events; // first score ever calculated — nothing to compare against

  const scoreDelta = current.score - previous.fundamentalScore;
  if (Math.abs(scoreDelta) > 0) {
    const importance = computeImportanceScore({
      magnitude: clamp(Math.abs(scoreDelta) / 15, 0, 1), // a 15pt move ~= max magnitude signal
      historicalSignificance: clamp(Math.abs(scoreDelta) / 10, 0, 1),
      peerSignificance: 0.5, // requires peer score deltas — populate once peer scoring runs at scale
      businessRelevance: 1, // the top-level score is maximally relevant by definition
      scoreImpact: 1,
    });

    events.push({
      companyId,
      eventType: "SCORE_CHANGE",
      metricName: "fundamental_score",
      oldValue: previous.fundamentalScore,
      newValue: current.score,
      absoluteChange: Math.round(scoreDelta * 10) / 10,
      percentageChange: previous.fundamentalScore !== 0 ? (scoreDelta / previous.fundamentalScore) * 100 : null,
      importanceScore: importance,
      direction: scoreDelta > 0 ? "UP" : scoreDelta < 0 ? "DOWN" : "FLAT",
    });
  }

  for (const cs of current.categoryScores) {
    const prevCs = previous.categoryScores.find((p) => p.categoryKey === cs.categoryKey);
    if (!prevCs) continue;
    const delta = cs.score - prevCs.score;
    if (Math.abs(delta) < 1) continue; // sub-1pt category noise is never worth an event

    const importance = computeImportanceScore({
      magnitude: clamp(Math.abs(delta) / 20, 0, 1),
      historicalSignificance: clamp(Math.abs(delta) / 15, 0, 1),
      peerSignificance: 0.5,
      businessRelevance: CATEGORY_RELEVANCE[cs.categoryKey],
      scoreImpact: clamp(Math.abs(delta) / 100, 0, 1),
    });

    events.push({
      companyId,
      eventType: "CATEGORY_SCORE_CHANGE",
      metricName: cs.categoryKey,
      oldValue: prevCs.score,
      newValue: cs.score,
      absoluteChange: Math.round(delta * 10) / 10,
      percentageChange: prevCs.score !== 0 ? (delta / prevCs.score) * 100 : null,
      importanceScore: importance,
      direction: delta > 0 ? "UP" : delta < 0 ? "DOWN" : "FLAT",
    });
  }

  return events;
}

export function toAlertDraft(event: ChangeEvent & { id: string }, companyName: string) {
  if (event.importanceScore < ALERT_THRESHOLD) return null; // not meaningful enough — brief §35/§36

  const severity = severityFor(event.importanceScore);
  const isScoreChange = event.eventType === "SCORE_CHANGE";
  const title = isScoreChange
    ? `${companyName}: fundamental score changed`
    : `${companyName}: ${prettyCategory(event.metricName)} changed`;

  return {
    changeEventId: event.id,
    companyId: event.companyId,
    alertType: event.eventType,
    severity,
    title,
    scoreBefore: event.oldValue ?? undefined,
    scoreAfter: event.newValue ?? undefined,
  };
}

function prettyCategory(key?: string): string {
  if (!key) return "a score";
  return key
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
