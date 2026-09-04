// ============================================================================
// Equity AI — Milestone 6B Batch 3: provision company identity rows
//
// TXN, AMAT, CSCO, IBM were proposed and approved as candidates in
// Milestone 6B but never actually inserted into `companies` — confirmed
// directly against the live database before writing this. Financial-data
// ingestion requires a companies.id to attach to (raw_financial_data.company_id
// is a NOT NULL foreign key), so this is a necessary prerequisite, not new
// scope: identity fields only (name/ticker/exchange/country/currency/sector/
// industry), matching schema/007_seed_batch3_companies.sql exactly and using
// the same real, public facts already stated when these were proposed. No
// financial data, no scores, nothing else written.
//
// Idempotent: upserts on (ticker, exchange), matching companies'
// uq_companies_ticker_exchange constraint — safe to re-run.
//
// Run with:
//   npm run provision:batch3-companies
// ============================================================================

import { getDbClient } from "../db/client";

const BATCH_3_COMPANIES = [
  { name: "Texas Instruments", ticker: "TXN", exchange: "NASDAQ", country: "US", currency: "USD", sector: "Technology", industry: "Semiconductors" },
  { name: "Applied Materials", ticker: "AMAT", exchange: "NASDAQ", country: "US", currency: "USD", sector: "Technology", industry: "Semiconductor Equipment" },
  { name: "Cisco Systems", ticker: "CSCO", exchange: "NASDAQ", country: "US", currency: "USD", sector: "Technology", industry: "Communication Equipment" },
  { name: "International Business Machines", ticker: "IBM", exchange: "NYSE", country: "US", currency: "USD", sector: "Technology", industry: "Information Technology Services" },
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
    .upsert(BATCH_3_COMPANIES.map((c) => ({ ...c, is_active: true })), { onConflict: "ticker,exchange" })
    .select("id, ticker, name, sector, industry");

  if (error) {
    console.error(`Insert failed: ${error.message}`);
    process.exit(1);
  }

  console.log(`Provisioned ${data!.length} company identity rows:`);
  for (const c of data!) console.log(`   ${c.ticker.padEnd(6)} ${c.name.padEnd(35)} id=${c.id}  sector=${c.sector}  industry=${c.industry}`);
}

main();
