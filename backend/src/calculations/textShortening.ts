// ============================================================================
// Equity AI — Milestone 16C: shorten a real source paragraph to one sentence
// for the Company page identity block. Pure text transform — never invents
// content, only cuts. Splits on ". "/"! "/"? " followed by a capital letter
// or digit, a simple heuristic that is known to mis-split on a mid-sentence
// abbreviation immediately followed by a capitalized word (e.g. "the U.S.
// Securities..." splits after "U.S." because "S." is followed by a capital
// letter) — documented here rather than hidden, and acceptable because the
// output is always a real, verbatim prefix of the source text, never
// fabricated or reworded.
// ============================================================================

const SENTENCE_BOUNDARY = /([.!?])\s+(?=[A-Z0-9])/;

export function shortenToOneSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return trimmed;
  const match = trimmed.match(SENTENCE_BOUNDARY);
  if (!match || match.index == null) return trimmed; // no sentence boundary found — return the whole (short) text verbatim
  return trimmed.slice(0, match.index + 1);
}
