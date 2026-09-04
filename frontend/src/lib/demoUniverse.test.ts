import { describe, it, expect } from "vitest";
import { filterToDemoUniverse, DEMO_UNIVERSE_TICKERS } from "./demoUniverse";
import type { Company } from "./types";

function company(ticker: string): Company {
  return { id: ticker, name: ticker, ticker };
}

describe("filterToDemoUniverse", () => {
  it("keeps every approved demo-universe ticker", () => {
    const all = [...DEMO_UNIVERSE_TICKERS].map(company);
    expect(filterToDemoUniverse(all)).toHaveLength(30);
  });

  it("drops legacy/non-demo companies (e.g. AAPL, MSFT, META, CSCO)", () => {
    const mixed = [company("NVDA"), company("AAPL"), company("MSFT"), company("META"), company("CSCO"), company("LLY")];
    const result = filterToDemoUniverse(mixed);
    expect(result.map((c) => c.ticker).sort()).toEqual(["LLY", "NVDA"]);
  });

  it("never introduces a company that wasn't in the input", () => {
    const result = filterToDemoUniverse([company("NVDA")]);
    expect(result).toEqual([company("NVDA")]);
  });

  it("returns an empty list unchanged", () => {
    expect(filterToDemoUniverse([])).toEqual([]);
  });
});
