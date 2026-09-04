// ============================================================================
// Equity AI — Anthropic API Client (real implementation of AiClient)
// Thin wrapper. Requires ANTHROPIC_API_KEY in the environment — not
// available in this sandbox (no network egress), so this file is untested
// here but is a complete, standard /v1/messages call.
// ============================================================================

import type { AiClient } from "./aiService";

export class AnthropicClient implements AiClient {
  constructor(private apiKey: string, private model = "claude-sonnet-4-6") {}

  async complete(system: string, user: string): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === "text");
    if (!textBlock) throw new Error("Anthropic API returned no text content block.");
    return textBlock.text as string;
  }
}
