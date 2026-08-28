// ============================================================================
// Equity AI — AI Output Schema
// Every AI response is validated against this shape before it is allowed
// anywhere near the database. A response that fails validation is dropped
// and logged — never partially trusted.
// ============================================================================

import { z } from "zod";

export const AiAnalysisOutputSchema = z.object({
  headline: z.string().min(1).max(120),
  summary: z.string().min(1).max(1200),
  key_strengths: z.array(z.string()).max(6),
  key_weaknesses: z.array(z.string()).max(6),
  bull_case: z.string().min(1).max(800),
  base_case: z.string().min(1).max(800),
  bear_case: z.string().min(1).max(800),
  risks: z.array(z.string()).max(8),
  catalysts: z.array(z.string()).max(8),
  what_changed: z.array(z.string()).max(8),
  confidence: z.number().min(0).max(1),
});

export type AiAnalysisOutput = z.infer<typeof AiAnalysisOutputSchema>;

export function parseAiOutput(raw: string): { ok: true; data: AiAnalysisOutput } | { ok: false; error: string } {
  let json: unknown;
  try {
    // Strip accidental markdown code fences — models sometimes add them
    // despite instructions; we still validate strictly afterward.
    const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
    json = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, error: `AI output was not valid JSON: ${(e as Error).message}` };
  }

  const parsed = AiAnalysisOutputSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `AI output failed schema validation: ${parsed.error.message}` };
  }
  return { ok: true, data: parsed.data };
}
