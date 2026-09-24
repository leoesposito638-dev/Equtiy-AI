import { describe, it, expect } from "vitest";
import { avatarInitial, avatarColor, fallbackDescription, AVATAR_PALETTE } from "./companyIdentity";

describe("avatarInitial", () => {
  it("takes the first letter of the company name, uppercased", () => {
    expect(avatarInitial("NVIDIA")).toBe("N");
    expect(avatarInitial("microsoft")).toBe("M");
  });

  it("strips a leading 'The ' so 'The X Corporation' and 'The Y Company' don't collapse to the same initial", () => {
    expect(avatarInitial("The Charles Schwab Corporation")).toBe("C");
    expect(avatarInitial("The Walt Disney Company")).toBe("W");
  });

  it("is case-insensitive when stripping 'The '", () => {
    expect(avatarInitial("the procter & gamble company")).toBe("P");
  });
});

describe("avatarColor", () => {
  it("is deterministic — the same ticker always gets the same color", () => {
    expect(avatarColor("NVDA")).toBe(avatarColor("NVDA"));
  });

  it("always returns a color from the fixed palette, never an arbitrary value", () => {
    expect(AVATAR_PALETTE).toContain(avatarColor("NVDA"));
    expect(AVATAR_PALETTE).toContain(avatarColor("AAPL"));
  });

  it("spreads different tickers across more than one palette color", () => {
    const colors = new Set(["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "JPM"].map(avatarColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("fallbackDescription", () => {
  it("builds a sentence from real sector + industry only", () => {
    expect(fallbackDescription("Technology", "Software")).toBe("A Technology company in Software.");
  });

  it("never builds a partial/fabricated sentence when either field is missing", () => {
    expect(fallbackDescription(null, "Software")).toBeNull();
    expect(fallbackDescription("Technology", null)).toBeNull();
    expect(fallbackDescription(undefined, undefined)).toBeNull();
    expect(fallbackDescription("", "Software")).toBeNull();
  });
});
