// ============================================================================
// Equity AI — Milestone 10A: provision company identity rows for the
// remaining 24 companies in the 30-company US demo universe (established by
// Milestones 9A-9D). NVDA/TXN/IBM/GOOGL/AMZN/TSLA already exist — not
// touched here. Identity fields only, matching schema/007's convention
// exactly (sector/industry classification follows the existing companies
// table's real-world FMP-style pattern — see AAPL/GOOGL/META/AMZN/TSLA/NVO/
// SPOT precedent). No financial data, no scores.
//
// Idempotent: upserts on (ticker, exchange).
//
// Run with:
//   npx ts-node --transpile-only src/localDev/provisionDemo30Companies.ts
// ============================================================================

import { getDbClient } from "../db/client";

const NEW_COMPANIES = [
  { name: "Oracle Corporation", ticker: "ORCL", exchange: "NYSE", country: "US", currency: "USD", sector: "Technology", industry: "Software" },
  { name: "Qualcomm Incorporated", ticker: "QCOM", exchange: "NASDAQ", country: "US", currency: "USD", sector: "Technology", industry: "Semiconductors" },
  { name: "Adobe Inc.", ticker: "ADBE", exchange: "NASDAQ", country: "US", currency: "USD", sector: "Technology", industry: "Software" },
  { name: "Intel Corporation", ticker: "INTC", exchange: "NASDAQ", country: "US", currency: "USD", sector: "Technology", industry: "Semiconductors" },
  { name: "The Walt Disney Company", ticker: "DIS", exchange: "NYSE", country: "US", currency: "USD", sector: "Communication Services", industry: "Entertainment" },
  { name: "Verizon Communications Inc.", ticker: "VZ", exchange: "NYSE", country: "US", currency: "USD", sector: "Communication Services", industry: "Telecom Services" },
  { name: "Lowe's Companies, Inc.", ticker: "LOW", exchange: "NYSE", country: "US", currency: "USD", sector: "Consumer Discretionary", industry: "Home Improvement Retail" },
  { name: "McDonald's Corporation", ticker: "MCD", exchange: "NYSE", country: "US", currency: "USD", sector: "Consumer Discretionary", industry: "Restaurants" },
  { name: "JPMorgan Chase & Co.", ticker: "JPM", exchange: "NYSE", country: "US", currency: "USD", sector: "Financial Services", industry: "Banks - Diversified" },
  { name: "Bank of America Corporation", ticker: "BAC", exchange: "NYSE", country: "US", currency: "USD", sector: "Financial Services", industry: "Banks - Diversified" },
  { name: "Mastercard Incorporated", ticker: "MA", exchange: "NYSE", country: "US", currency: "USD", sector: "Financial Services", industry: "Credit Services" },
  { name: "The Charles Schwab Corporation", ticker: "SCHW", exchange: "NYSE", country: "US", currency: "USD", sector: "Financial Services", industry: "Capital Markets" },
  { name: "Johnson & Johnson", ticker: "JNJ", exchange: "NYSE", country: "US", currency: "USD", sector: "Healthcare", industry: "Drug Manufacturers" },
  { name: "UnitedHealth Group Incorporated", ticker: "UNH", exchange: "NYSE", country: "US", currency: "USD", sector: "Healthcare", industry: "Healthcare Plans" },
  { name: "Eli Lilly and Company", ticker: "LLY", exchange: "NYSE", country: "US", currency: "USD", sector: "Healthcare", industry: "Drug Manufacturers" },
  { name: "Merck & Co., Inc.", ticker: "MRK", exchange: "NYSE", country: "US", currency: "USD", sector: "Healthcare", industry: "Drug Manufacturers" },
  { name: "Pfizer Inc.", ticker: "PFE", exchange: "NYSE", country: "US", currency: "USD", sector: "Healthcare", industry: "Drug Manufacturers" },
  { name: "Caterpillar Inc.", ticker: "CAT", exchange: "NYSE", country: "US", currency: "USD", sector: "Industrials", industry: "Farm & Heavy Construction Machinery" },
  { name: "Deere & Company", ticker: "DE", exchange: "NYSE", country: "US", currency: "USD", sector: "Industrials", industry: "Farm & Heavy Construction Machinery" },
  { name: "The Procter & Gamble Company", ticker: "PG", exchange: "NYSE", country: "US", currency: "USD", sector: "Consumer Staples", industry: "Household & Personal Products" },
  { name: "Costco Wholesale Corporation", ticker: "COST", exchange: "NASDAQ", country: "US", currency: "USD", sector: "Consumer Staples", industry: "Discount Stores" },
  { name: "PepsiCo, Inc.", ticker: "PEP", exchange: "NASDAQ", country: "US", currency: "USD", sector: "Consumer Staples", industry: "Beverages - Non-Alcoholic" },
  { name: "Chevron Corporation", ticker: "CVX", exchange: "NYSE", country: "US", currency: "USD", sector: "Energy", industry: "Oil & Gas Integrated" },
  { name: "ConocoPhillips", ticker: "COP", exchange: "NYSE", country: "US", currency: "USD", sector: "Energy", industry: "Oil & Gas E&P" },
];

async function main() {
  const missingEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    console.error(`Missing required environment variable(s): ${missingEnv.join(", ")}.`);
    process.exit(1);
  }

  const db = getDbClient();
  const { data, error } = await db
    .from("companies")
    .upsert(NEW_COMPANIES.map((c) => ({ ...c, is_active: true })), { onConflict: "ticker,exchange" })
    .select("id, ticker, name, sector, industry");

  if (error) {
    console.error(`Insert failed: ${error.message}`);
    process.exit(1);
  }

  console.log(`Provisioned ${data!.length} company identity rows:`);
  for (const c of data!) console.log(`   ${c.ticker.padEnd(6)} ${c.name.padEnd(35)} id=${c.id}  sector=${c.sector}  industry=${c.industry}`);
}

main();
