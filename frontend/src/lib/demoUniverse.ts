// ============================================================================
// The approved 30-company US demo universe (Milestone 10A). The backend's
// `companies` table also carries a handful of legacy, pre-demo rows (e.g.
// AAPL, MSFT, META, CSCO) that were never part of this verified universe —
// GET /companies returns all of them with no filter. This module is the one
// place that constrains what the frontend displays to exactly the approved
// 30, so no page has to remember the rule independently.
// ============================================================================

import type { Company } from "./types";

export const DEMO_UNIVERSE_TICKERS: ReadonlySet<string> = new Set([
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
]);

export function filterToDemoUniverse(companies: Company[]): Company[] {
  return companies.filter((c) => DEMO_UNIVERSE_TICKERS.has(c.ticker));
}
