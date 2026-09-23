// ============================================================================
// Tests: change detection — only meaningful moves become events/alerts
// ============================================================================

import { describe, it, expect } from "vitest";
import { detectChanges, toAlertDraft } from "../src/changeDetection/changeDetector";
import { ALERT_THRESHOLD } from "../src/changeDetection/importance";
import type { FundamentalScore } from "../src/types/domain";

function score(overrides: Partial<FundamentalScore> = {}): FundamentalScore {
  return {
    companyId: "c1",
    score: 87,
    confidence: 0.9,
    dataCoverage: 0.95,
    calculationVersion: "v1.0",
    previousScore: null,
    scoreChange: null,
    calculatedAt: "2026-08-24T00:00:00Z",
    categoryScores: [
      { companyId: "c1", categoryId: "GROWTH", categoryKey: "GROWTH", score: 92, confidence: 0.9, coverage: 1, calculationVersion: "v1.0", calculatedAt: "" },
    ],
    ...overrides,
  };
}

describe("change detection", () => {
  it("produces no events on the very first score (nothing to compare against)", () => {
    const events = detectChanges("c1", score(), null);
    expect(events).toHaveLength(0);
  });

  it("a tiny sub-1pt category move does not become an event", () => {
    const current = score({ categoryScores: [{ companyId: "c1", categoryId: "GROWTH", categoryKey: "GROWTH", score: 92.4, confidence: 0.9, coverage: 1, calculationVersion: "v1.0", calculatedAt: "" }] });
    const previous = { fundamentalScore: 87, categoryScores: score().categoryScores.map((c) => ({ ...c, score: 92 })) };
    const events = detectChanges("c1", current, previous);
    expect(events.some((e) => e.eventType === "CATEGORY_SCORE_CHANGE")).toBe(false);
  });

  it("a large fundamental score move produces a SCORE_CHANGE event with importance reflecting magnitude", () => {
    const current = score({ score: 87 });
    const previous = { fundamentalScore: 79, categoryScores: score().categoryScores };
    const events = detectChanges("c1", current, previous);
    const scoreEvent = events.find((e) => e.eventType === "SCORE_CHANGE");
    expect(scoreEvent).toBeDefined();
    expect(scoreEvent!.absoluteChange).toBeCloseTo(8);
    expect(scoreEvent!.importanceScore).toBeGreaterThan(0);
  });

  it("toAlertDraft returns null for events below ALERT_THRESHOLD — no alert spam for tiny moves", () => {
    const lowImportanceEvent = {
      id: "e1",
      companyId: "c1",
      eventType: "SCORE_CHANGE",
      importanceScore: ALERT_THRESHOLD - 1,
      direction: "UP" as const,
      detectedAt: "2026-08-24T00:00:00Z",
    };
    expect(toAlertDraft(lowImportanceEvent, "Acme Corp")).toBeNull();
  });

  it("toAlertDraft returns a drafted alert for events at/above ALERT_THRESHOLD", () => {
    const highImportanceEvent = {
      id: "e1",
      companyId: "c1",
      eventType: "SCORE_CHANGE",
      importanceScore: ALERT_THRESHOLD + 10,
      oldValue: 79,
      newValue: 87,
      direction: "UP" as const,
      detectedAt: "2026-08-24T00:00:00Z",
    };
    const draft = toAlertDraft(highImportanceEvent, "Acme Corp");
    expect(draft).not.toBeNull();
    expect(draft!.severity).toBeDefined();
    expect(draft!.title).toContain("Acme Corp");
  });
});
