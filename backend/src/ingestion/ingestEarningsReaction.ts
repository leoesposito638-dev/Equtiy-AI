// ============================================================================
// Equity AI — Earnings Reaction (2-Day Window) Ingestion (Milestone 14E)
//
// For one company: reads ONLY historical earnings rows (eps_actual not
// null — an upcoming/scheduled report has no real reaction to measure yet)
// and this company's full daily_prices series, runs the pure
// calculations/earningsReaction.ts formula for each, and persists a
// passing result into calculated_metrics. NO FMP/provider calls happen
// here — daily_prices (split_and_dividend_adjusted) is the only source,
// per Milestone 14E Part 1's explicit scope.
//
// Convention (matches eps_surprise_percent/revenue_surprise_percent
// exactly, Milestone 14B — see this milestone's report for why):
//   period_end   = earnings.period_end (the fiscal period this report
//                  covers, NOT report_date) — so a consumer can join
//                  calculated_metrics rows for eps_surprise_percent and
//                  earnings_reaction_2d_window on the same period_end and
//                  get both facts about the same earnings event.
//   period_type  = 'QUARTER'
//   calculation_version = EARNINGS_REACTION_CALCULATION_VERSION (below),
//                  its own distinct version string, independent of every
//                  other calculated_metrics family.
//
// Traceability (Milestone 14E Part 1): input_data_hash is a one-way
// SHA-256 fingerprint (same convention as every other calculated_metrics
// writer in this codebase — schema/002_scoring_tables.sql's own comment:
// "hash of the exact financial_metrics rows used") — it proves
// reproducibility, it does not literally store the two trace dates/closes.
// Today, full traceability for a stored value means: look up the earnings
// row for (company_id, period_end) to get report_date, then re-run this
// same deterministic nearest-trading-day search against daily_prices
// (unchanged data) to recover the exact prev/next rows — no schema change
// needed, but nothing is stored verbatim either. See this milestone's
// report for a proposed (not implemented) companion table that would make
// this literal instead of re-derived.
//
// Idempotency: calculated_metrics DOES have a real unique constraint
// (company_id, metric_name, period_end, period_type, calculation_version)
// — checked up front via existing-keys pre-check, with the 23505 backstop,
// same pattern as every other calculated_metrics writer (ingestEarnings.ts,
// ingestForwardValuation.ts).
//
// "Missing price -> no row, logged as unavailable. No fallback, no
// interpolation." (Milestone 14E Part 2, verbatim): a null result from the
// pure formula is never stored, never retried with a substitute price —
// only ever counted and reported.
// ============================================================================

import { createHash } from "crypto";
import { getDbClient } from "../db/client";
import { fetchAllPaginated } from "../db/paginate";
import { calculateEarningsReaction2dWindow, type DailyClose } from "../calculations/earningsReaction";

export const EARNINGS_REACTION_CALCULATION_VERSION = "v1.0-earnings-reaction-2d";
export const EARNINGS_REACTION_METRIC_NAME = "earnings_reaction_2d_window";

export interface EarningsReactionIngestionOutcome {
  companyId: string;
  historicalEarningsRows: number;
  computed: number;
  stored: number;
  skippedExisting: number;
  unavailable: number;
  unavailableReasons: Array<{ periodEnd: string; reportDate: string; reason: string }>;
}

interface HistoricalEarningsRow {
  period_end: string;
  report_date: string;
}

async function getHistoricalEarnings(companyId: string): Promise<HistoricalEarningsRow[]> {
  const db = getDbClient();
  // Milestone 14D.1 pagination convention: earnings currently stays well
  // under 1000 rows per company, but paginated for consistency with every
  // other >1 row select in this codebase.
  return fetchAllPaginated<HistoricalEarningsRow>((from, to) =>
    db
      .from("earnings")
      .select("period_end, report_date")
      .eq("company_id", companyId)
      .not("eps_actual", "is", null) // historical only — never an upcoming/scheduled report
      .order("report_date", { ascending: true })
      .range(from, to)
  );
}

async function getAllDailyPrices(companyId: string): Promise<DailyClose[]> {
  const db = getDbClient();
  const rows = await fetchAllPaginated<{ trade_date: string; close: number }>((from, to) =>
    db
      .from("daily_prices")
      .select("trade_date, close")
      .eq("company_id", companyId)
      .order("trade_date", { ascending: true })
      .range(from, to)
  );
  return rows.map((r) => ({ date: r.trade_date.slice(0, 10), close: r.close }));
}

async function getExistingCalculatedMetricPeriods(companyId: string): Promise<Set<string>> {
  const db = getDbClient();
  const rows = await fetchAllPaginated<{ period_end: string }>((from, to) =>
    db
      .from("calculated_metrics")
      .select("period_end")
      .eq("company_id", companyId)
      .eq("metric_name", EARNINGS_REACTION_METRIC_NAME)
      .eq("period_type", "QUARTER")
      .eq("calculation_version", EARNINGS_REACTION_CALCULATION_VERSION)
      .range(from, to)
  );
  return new Set(rows.map((r) => r.period_end));
}

function hashOf(parts: Array<string | number | null>): string {
  return createHash("sha256").update(parts.map((p) => String(p)).join("|")).digest("hex");
}

/** `date` portion only, same naive-slice convention as ingestEarnings.ts's
 *  own toDateOnly() — reused here rather than reimplemented, since
 *  report_date is the exact same column/format in both files. */
function toDateOnly(isoDateOrDateTime: string): string {
  return isoDateOrDateTime.slice(0, 10);
}

export async function ingestEarningsReaction(companyId: string): Promise<EarningsReactionIngestionOutcome> {
  const outcome: EarningsReactionIngestionOutcome = {
    companyId,
    historicalEarningsRows: 0,
    computed: 0,
    stored: 0,
    skippedExisting: 0,
    unavailable: 0,
    unavailableReasons: [],
  };

  const [historicalEarnings, prices, existingPeriods] = await Promise.all([
    getHistoricalEarnings(companyId),
    getAllDailyPrices(companyId),
    getExistingCalculatedMetricPeriods(companyId),
  ]);
  outcome.historicalEarningsRows = historicalEarnings.length;

  const db = getDbClient();

  for (const earningsRow of historicalEarnings) {
    const periodEnd = toDateOnly(earningsRow.period_end);
    const reportDate = toDateOnly(earningsRow.report_date);

    if (existingPeriods.has(periodEnd)) {
      outcome.skippedExisting++;
      continue;
    }

    const result = calculateEarningsReaction2dWindow(reportDate, prices);
    outcome.computed++;

    if (result.value === null) {
      outcome.unavailable++;
      outcome.unavailableReasons.push({ periodEnd, reportDate, reason: result.reason ?? "unknown" });
      continue;
    }

    const inputDataHash = hashOf([companyId, periodEnd, reportDate, result.prevDate, result.prevClose, result.nextDate, result.nextClose]);

    const { error } = await db.from("calculated_metrics").insert({
      company_id: companyId,
      metric_name: EARNINGS_REACTION_METRIC_NAME,
      value: result.value,
      period_end: periodEnd,
      period_type: "QUARTER",
      calculation_version: EARNINGS_REACTION_CALCULATION_VERSION,
      input_data_hash: inputDataHash,
    });

    if (error) {
      if (error.code === "23505") {
        outcome.skippedExisting++;
        continue;
      }
      throw new Error(`calculated_metrics insert failed for ${EARNINGS_REACTION_METRIC_NAME} (period_end=${periodEnd}): ${error.message}`);
    }

    outcome.stored++;
    existingPeriods.add(periodEnd);
  }

  return outcome;
}
