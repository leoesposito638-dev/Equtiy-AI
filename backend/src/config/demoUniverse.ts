// ============================================================================
// Equity AI — the 30-company real-data demo universe.
//
// This exact ticker list has been used consistently (duplicated locally) by
// every ingestion/calculation/scoring script since Milestone 12B. Centralized
// here (Demo Readiness milestone) so the API layer can filter to it too —
// the `companies` table also holds ~8 earlier legacy/prototype companies
// (AAPL, MSFT, META, etc., seeded before the real 30-company build-out) that
// share `is_active = true` with no other distinguishing column, so an
// unfiltered `/companies` query was leaking them into the Discover page.
//
// Do NOT add or remove tickers here without an explicit, separate product
// decision — this list defines the entire demo's scope.
// ============================================================================

export const DEMO_TICKERS = [
  "NVDA", "TXN", "IBM", "ORCL", "QCOM", "ADBE", "INTC", "GOOGL", "DIS", "VZ",
  "AMZN", "TSLA", "LOW", "MCD", "JPM", "BAC", "MA", "SCHW", "JNJ", "UNH",
  "LLY", "MRK", "PFE", "CAT", "DE", "PG", "COST", "PEP", "CVX", "COP",
] as const;
