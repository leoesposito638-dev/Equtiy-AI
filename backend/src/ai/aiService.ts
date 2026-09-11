// ============================================================================
// Equity AI — AI Interpretation Service
//
// STRICT BOUNDARY: this module receives already-computed, already-verified
// structured data (a FundamentalScore + its category scores + selected
// calculated_metrics). It NEVER receives raw provider access, NEVER
// receives write access to financial_metrics/calculated_metrics/scores, and
// its only output is validated, structured text — explanation, not new
// facts. If the model output can't be parsed into AiAnalysisOutputSchema,
// the caller must treat that as no analysis, not a best-effort save.
// ============================================================================

import { parseAiOutput, type AiAnalysisOutput } from "./schema";
import type { FundamentalScore, OpportunityScore } from "../types/domain";

export const AI_PROMPT_VERSION = "v1.0";
export const AI_MODEL = "claude-sonnet-4-6";

export interface AiAnalysisInput {
  companyName: string;
  ticker: string;
  fundamental: FundamentalScore;
  opportunity: OpportunityScore;
  keyMetrics: Record<string, { value: number | null; peerPercentile: number | null; unit: string }>;
}

const SYSTEM_PROMPT = `You are the analysis layer of Equity AI. You will be given ONLY verified,
pre-computed structured financial data — scores, percentiles, and metric values that have already
been calculated by a deterministic scoring engine. You must not invent, estimate, or "fill in" any
numeric fact that is not present in the input. If something is not present, omit it rather than guess.

Your job is strictly interpretation: explain what the numbers mean, in the voice of a careful sell-side
analyst — not a chatbot, not a hype machine. Be specific about what is strong, what is weak, and why,
referencing only the figures you were given.

Respond with ONLY a JSON object matching this exact shape, no markdown fences, no preamble:
{
  "headline": string,
  "summary": string,
  "key_strengths": string[],
  "key_weaknesses": string[],
  "bull_case": string,
  "base_case": string,
  "bear_case": string,
  "risks": string[],
  "catalysts": string[],
  "what_changed": string[],
  "confidence": number (0-1, your own confidence in this interpretation given the data's coverage)
}`;

function buildUserPrompt(input: AiAnalysisInput): string {
  return JSON.stringify(
    {
      company: input.companyName,
      ticker: input.ticker,
      fundamental_score: input.fundamental.score,
      fundamental_confidence: input.fundamental.confidence,
      data_coverage: input.fundamental.dataCoverage,
      score_change: input.fundamental.scoreChange,
      opportunity_score: input.opportunity.score,
      categories: input.fundamental.categoryScores.map((c) => ({
        category: c.categoryKey,
        score: c.score,
        confidence: c.confidence,
        coverage: c.coverage,
      })),
      key_metrics: input.keyMetrics,
    },
    null,
    2
  );
}

export interface AiClient {
  /** Thin wrapper over POST /v1/messages — swap implementation, not this service. */
  complete(system: string, user: string): Promise<string>;
}

export async function generateAnalysis(
  input: AiAnalysisInput,
  client: AiClient
): Promise<{ ok: true; output: AiAnalysisOutput; promptVersion: string; model: string } | { ok: false; error: string }> {
  // Refuse to generate an analysis for data too thin to say anything
  // responsible — matches brief §20's confidence discipline.
  if (input.fundamental.dataCoverage < 0.3) {
    return { ok: false, error: `data_coverage (${input.fundamental.dataCoverage}) too low to generate a reliable analysis.` };
  }

  const raw = await client.complete(SYSTEM_PROMPT, buildUserPrompt(input));
  const parsed = parseAiOutput(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  return { ok: true, output: parsed.data, promptVersion: AI_PROMPT_VERSION, model: AI_MODEL };
}
