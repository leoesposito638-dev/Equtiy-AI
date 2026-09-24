// ============================================================================
// Equity AI — Milestone 16C item 2: company description ingestion, live, for
// the 16 FMP-entitled companies. Populates companies.description (existing
// column, previously null for all 30) via ingestCompanyDescription().
//
// Traceability: prints a full report (ticker, source URL, retrieval
// timestamp, the UNTRUNCATED original FMP description, and what was
// actually stored) AND writes the same data to a committed JSON file
// (docs/milestone-16c-description-sources.json) — durable evidence of
// where each stored sentence came from, without adding a schema column.
//
// Run with:
//   npx ts-node --transpile-only src/localDev/milestone16cCompanyDescriptionsIngestion.ts
// ============================================================================

import * as fs from "fs";
import * as path from "path";
import { buildProviderRegistry } from "../providers/registry";
import { ingestCompanyDescription } from "../ingestion/ingestCompanyDescriptions";
import { getCompanyIdByTicker } from "../ingestion/supabaseIngestionRepo";

const FMP_ENTITLED_16 = ["NVDA", "ADBE", "INTC", "GOOGL", "DIS", "VZ", "AMZN", "TSLA", "JPM", "BAC", "JNJ", "UNH", "PFE", "COST", "PEP", "CVX"];

async function main() {
  console.log("Equity AI — Milestone 16C: company description ingestion (16 FMP-entitled companies)\n");

  const registry = buildProviderRegistry();
  const rows: Array<{
    ticker: string;
    status: string;
    sourceUrl?: string;
    retrievedAt?: string;
    originalDescription?: string;
    shortenedDescription?: string;
    reason?: string;
  }> = [];

  for (const ticker of FMP_ENTITLED_16) {
    const company = await getCompanyIdByTicker(ticker);
    if (!company) {
      rows.push({ ticker, status: "SKIPPED (company not found)" });
      continue;
    }
    const outcome = await ingestCompanyDescription(company.id, { ticker }, registry.marketData);
    rows.push({
      ticker,
      status: outcome.status.toUpperCase(),
      sourceUrl: outcome.sourceUrl,
      retrievedAt: outcome.retrievedAt,
      originalDescription: outcome.originalDescription,
      shortenedDescription: outcome.shortenedDescription,
      reason: outcome.reason,
    });
  }

  console.log("Ticker | Status            | Shortened description");
  console.log("-------|-------------------|------------------------------------------------------------");
  for (const r of rows) {
    console.log(`${r.ticker.padEnd(6)} | ${r.status.padEnd(17)} | ${r.shortenedDescription ?? r.reason ?? ""}`);
  }

  const storedCount = rows.filter((r) => r.status === "STORED").length;
  console.log(`\nStored for ${storedCount}/${FMP_ENTITLED_16.length} companies.\n`);

  console.log("Full traceability (untruncated originals + source URLs):\n");
  for (const r of rows.filter((r) => r.status === "STORED")) {
    console.log(`${r.ticker} — source: ${r.sourceUrl} — retrieved: ${r.retrievedAt}`);
    console.log(`  original:  ${r.originalDescription}`);
    console.log(`  stored:    ${r.shortenedDescription}\n`);
  }

  const outPath = path.join(__dirname, "../../../docs/milestone-16c-description-sources.json");
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
  console.log(`Traceability log written to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
