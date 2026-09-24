import { describe, it, expect } from "vitest";
import { shortenToOneSentence } from "../src/calculations/textShortening";

describe("shortenToOneSentence", () => {
  it("keeps only the first sentence of a multi-sentence paragraph", () => {
    const text = "NVIDIA Corporation designs, develops, and markets graphics processors. It also offers networking solutions. The company sells to gaming, professional visualization, and data center markets.";
    expect(shortenToOneSentence(text)).toBe("NVIDIA Corporation designs, develops, and markets graphics processors.");
  });

  it("returns the whole text unchanged when it is already a single sentence", () => {
    expect(shortenToOneSentence("A single sentence with no period at the end")).toBe("A single sentence with no period at the end");
  });

  it("returns the whole text unchanged when it is empty", () => {
    expect(shortenToOneSentence("")).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(shortenToOneSentence("  Trimmed sentence.  Second sentence.  ")).toBe("Trimmed sentence.");
  });

  it("handles exclamation and question marks as sentence boundaries", () => {
    expect(shortenToOneSentence("Is this real? Yes it is.")).toBe("Is this real?");
    expect(shortenToOneSentence("This is exciting! More detail follows.")).toBe("This is exciting!");
  });

  it("never fabricates or rewords — the output is always a verbatim prefix of the input", () => {
    const text = "American technology company focused on GPUs, artificial intelligence and accelerated computing. Founded in 1993.";
    const result = shortenToOneSentence(text);
    expect(text.startsWith(result)).toBe(true);
  });

  it("documents the known abbreviation-splitting limitation (e.g. 'U.S.' followed by a capitalized word)", () => {
    // Known, accepted limitation: this heuristic splits mid-sentence on "U.S."
    // because "S." is followed by a capital letter. The result is still a
    // real, verbatim prefix — never fabricated — just shorter than ideal.
    const text = "The company is regulated by the U.S. Securities and Exchange Commission under federal law.";
    const result = shortenToOneSentence(text);
    expect(result).toBe("The company is regulated by the U.S.");
    expect(text.startsWith(result)).toBe(true);
  });
});
