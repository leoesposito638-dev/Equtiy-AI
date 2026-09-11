// ============================================================================
// Tests: AI output validation — never trust unvalidated model output
// ============================================================================

import { describe, it, expect } from "vitest";
import { parseAiOutput } from "../src/ai/schema";

const VALID = {
  headline: "Strong growth, demanding valuation",
  summary: "Revenue growth remains well ahead of peers.",
  key_strengths: ["Revenue growth", "Margin expansion"],
  key_weaknesses: ["Valuation"],
  bull_case: "Continued share gains support the premium multiple.",
  base_case: "Growth moderates toward peer levels over two years.",
  bear_case: "A slowdown re-rates the multiple sharply lower.",
  risks: ["Execution risk"],
  catalysts: ["Next earnings report"],
  what_changed: ["Margins expanded"],
  confidence: 0.85,
};

describe("AI output validation", () => {
  it("accepts well-formed JSON matching the schema", () => {
    const result = parseAiOutput(JSON.stringify(VALID));
    expect(result.ok).toBe(true);
  });

  it("strips accidental markdown code fences before parsing", () => {
    const result = parseAiOutput("```json\n" + JSON.stringify(VALID) + "\n```");
    expect(result.ok).toBe(true);
  });

  it("rejects invalid JSON outright", () => {
    const result = parseAiOutput("not json at all");
    expect(result.ok).toBe(false);
  });

  it("rejects JSON missing required fields", () => {
    const { headline, ...missingHeadline } = VALID;
    const result = parseAiOutput(JSON.stringify(missingHeadline));
    expect(result.ok).toBe(false);
  });

  it("rejects a confidence value outside [0,1]", () => {
    const result = parseAiOutput(JSON.stringify({ ...VALID, confidence: 1.5 }));
    expect(result.ok).toBe(false);
  });
});
