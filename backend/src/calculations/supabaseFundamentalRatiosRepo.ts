// ============================================================================
// Equity AI — Milestone 12B: Supabase-backed repo for the new PROFITABILITY /
// FINANCIAL_HEALTH / COMPETITIVE_ADVANTAGE ratio metrics.
//
// Mirrors supabaseGrowthMetricsRepo.ts exactly: reads real financial_metrics
// (both ANNUAL duration facts and INSTANT balance-sheet facts), computes
// every ratio for every period where its real inputs align, writes
// calculated_metrics rows, idempotent/duplicate-safe via the same
// existing-keys-first-then-23505-backstop pattern. The calculation math
// lives entirely in fundamentalRatios.ts — this file only does I/O.
// ============================================================================

import { createHash } from "crypto";
import { getDbClient } from "../db/client";
import { CALCULATION_VERSION } from "./metrics";
import {
  computeNetMargin, computeGrossMargin, computeOperatingMargin, computeRoe,
  computeCurrentRatio, computeInterestCoverage, computeFreeCashFlow, computeFcfMargin, computeRdIntensity,
  computeTotalDebt, computeEbitda, computeNetDebt, computeDebtToEquity, computeNetDebtToEbitda,
  computeInvestedCapital, computeEffectiveTaxRate, computeRoic,
  type PeriodValue, type RatioResult,
} from "./fundamentalRatios";

/** Milestone 13C: companies whose ingested `cash` value is confirmed (via a
 *  live SEC companyconcept cross-check reproducing the exact "most recent
 *  period wins" selection secEdgarAdapter.ts's fetchMostCurrentInstantConcept
 *  already performs — see milestone13cCashConceptCrossCheck.ts) to come from
 *  CASH_CONCEPTS' fallback tag (CashCashEquivalentsRestrictedCashAnd...),
 *  which bundles in restricted cash. Net Debt's approved definition
 *  (Milestone 13B) requires cash-and-equivalents-only, so these companies'
 *  Net Debt is intentionally left unavailable rather than silently using
 *  restricted-cash-contaminated cash — never "assume the primary concept was
 *  used." This is NOT a financial-company carve-out: JPM/BAC are on this
 *  list, but so are PG and CVX (both non-financial); MA and SCHW are NOT on
 *  this list (their cash IS clean) but end up unavailable anyway because
 *  Total Debt itself is unavailable for them. financial_metrics does not
 *  currently persist which XBRL concept was actually used per row (a
 *  pre-existing, systemic gap unrelated to this metric — see the Milestone
 *  13C report), so this list is the smallest architecture-safe way to make
 *  Net Debt honest without a broader ingestion-pipeline refactor. */
const CASH_INCLUDES_RESTRICTED_CASH = new Set(["JPM", "BAC", "PG", "CVX"]);

async function getPeriods(companyId: string, metricName: string, periodType: "ANNUAL" | "INSTANT"): Promise<PeriodValue[]> {
  const db = getDbClient();
  const { data, error } = await db
    .from("financial_metrics")
    .select("id, period_end, value")
    .eq("company_id", companyId)
    .eq("metric_name", metricName)
    .eq("period_type", periodType)
    .order("period_end", { ascending: false })
    .limit(10);
  if (error) throw new Error(`financial_metrics lookup failed for ${metricName}: ${error.message}`);
  return (data ?? []).map((r: { id: string; period_end: string; value: number | null }) => ({ id: r.id, periodEnd: r.period_end, value: r.value }));
}

async function getExistingCalculatedMetricKeys(companyId: string): Promise<Set<string>> {
  const db = getDbClient();
  const { data, error } = await db
    .from("calculated_metrics")
    .select("metric_name, period_end")
    .eq("company_id", companyId)
    .eq("period_type", "ANNUAL")
    .eq("calculation_version", CALCULATION_VERSION);
  if (error) throw new Error(`calculated_metrics existing-keys query failed: ${error.message}`);
  return new Set((data ?? []).map((r: { metric_name: string; period_end: string }) => `${r.metric_name}|${r.period_end}`));
}

function inputHash(ids: string[]): string {
  return createHash("sha256").update(ids.join("|")).digest("hex");
}

async function insertCalculatedMetric(params: { companyId: string; metricName: string; value: number; periodEnd: string; inputDataHash: string }): Promise<{ id: string } | { skipped: true }> {
  const db = getDbClient();
  const { data, error } = await db
    .from("calculated_metrics")
    .insert({
      company_id: params.companyId,
      metric_name: params.metricName,
      value: params.value,
      period_end: params.periodEnd,
      period_type: "ANNUAL", // matches existing convention: a derived ratio is recorded "as of" the fiscal year end it describes, regardless of whether its raw inputs were duration or instant facts
      calculation_version: CALCULATION_VERSION,
      input_data_hash: params.inputDataHash,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { skipped: true };
    throw new Error(`calculated_metrics insert failed for ${params.metricName}: ${error?.message ?? "no row returned"}`);
  }
  return { id: data.id as string };
}

export interface FundamentalRatioOutcome {
  metricName: string;
  periodEnd: string;
  value: number;
  stored?: { id: string };
  skippedReason?: "already_exists" | string;
}

/** Computes and stores every implementable ratio (Milestone 12B Phase 5,
 *  extended Milestone 13C with debt-derived metrics, extended Milestone 13E
 *  with invested_capital/effective_tax_rate/roic) for one company, across
 *  every real period where the required inputs align — not just the current
 *  period, so TREND rules reading these metrics' history (margin_trend,
 *  debt_trend, net_debt_trend, roic_persistence) have real data to work
 *  with. Returns an outcome per (metric, period) actually computed —
 *  metrics with no aligned real data simply produce no outcomes, never a
 *  fabricated one.
 *
 *  `companyTicker` gates Net Debt's cash input via
 *  CASH_INCLUDES_RESTRICTED_CASH (Milestone 13C) — required so Net Debt
 *  never silently uses a restricted-cash-contaminated value; omitting it
 *  (e.g. for a company outside the known-classified set) safely computes no
 *  net_debt rather than guessing the cash definition is clean. */
export async function calculateAndStoreFundamentalRatios(companyId: string, companyTicker?: string): Promise<FundamentalRatioOutcome[]> {
  const [
    netIncome, revenue, grossProfit, operatingIncome, equity,
    currentAssets, currentLiabilities, interestExpense,
    operatingCashFlow, capex, researchDevelopment,
    cash, longTermDebtCurrent, longTermDebtNoncurrent, shortTermBorrowings, depreciationAmortization,
    totalAssets, taxExpense, pretaxIncome,
    existingKeys,
  ] = await Promise.all([
    getPeriods(companyId, "net_income", "ANNUAL"),
    getPeriods(companyId, "revenue", "ANNUAL"),
    getPeriods(companyId, "gross_profit", "ANNUAL"),
    getPeriods(companyId, "operating_income", "ANNUAL"),
    getPeriods(companyId, "equity", "INSTANT"),
    getPeriods(companyId, "current_assets", "INSTANT"),
    getPeriods(companyId, "current_liabilities", "INSTANT"),
    getPeriods(companyId, "interest_expense", "ANNUAL"),
    getPeriods(companyId, "operating_cash_flow", "ANNUAL"),
    getPeriods(companyId, "capex", "ANNUAL"),
    getPeriods(companyId, "research_development", "ANNUAL"),
    getPeriods(companyId, "cash", "INSTANT"),
    getPeriods(companyId, "long_term_debt_current", "INSTANT"),
    getPeriods(companyId, "long_term_debt_noncurrent", "INSTANT"),
    getPeriods(companyId, "short_term_borrowings", "INSTANT"),
    getPeriods(companyId, "depreciation_amortization", "ANNUAL"),
    getPeriods(companyId, "total_assets", "INSTANT"),
    getPeriods(companyId, "tax_expense", "ANNUAL"),
    getPeriods(companyId, "pretax_income", "ANNUAL"),
    getExistingCalculatedMetricKeys(companyId),
  ]);

  const freeCashFlow = computeFreeCashFlow(operatingCashFlow, capex);
  const totalDebt = computeTotalDebt(longTermDebtCurrent, longTermDebtNoncurrent, shortTermBorrowings);
  const ebitda = computeEbitda(operatingIncome, depreciationAmortization);
  const cleanCash = companyTicker && !CASH_INCLUDES_RESTRICTED_CASH.has(companyTicker) ? cash : [];
  const netDebt = computeNetDebt(
    totalDebt.map((r) => ({ id: r.sourceObservationIds.join(","), periodEnd: r.periodEnd, value: r.value })),
    cleanCash
  );
  // Milestone 13E — Invested Capital deliberately uses the full `cash`
  // series, not `cleanCash`: the approved formula was never qualified with
  // Net Debt's cash-and-equivalents-only requirement (see the computeInvestedCapital
  // doc comment in fundamentalRatios.ts).
  const investedCapital = computeInvestedCapital(totalAssets, currentLiabilities, cash);
  const effectiveTaxRate = computeEffectiveTaxRate(taxExpense, pretaxIncome);
  const roic = computeRoic(
    operatingIncome,
    effectiveTaxRate.map((r) => ({ id: r.sourceObservationIds.join(","), periodEnd: r.periodEnd, value: r.value })),
    investedCapital.map((r) => ({ id: r.sourceObservationIds.join(","), periodEnd: r.periodEnd, value: r.value }))
  );

  const allResults: RatioResult[] = [
    ...computeNetMargin(netIncome, revenue),
    ...computeGrossMargin(grossProfit, revenue),
    ...computeOperatingMargin(operatingIncome, revenue),
    ...computeRoe(netIncome, equity),
    ...computeCurrentRatio(currentAssets, currentLiabilities),
    ...computeInterestCoverage(operatingIncome, interestExpense),
    ...freeCashFlow,
    ...computeFcfMargin(freeCashFlow.map((r) => ({ id: r.sourceObservationIds.join(","), periodEnd: r.periodEnd, value: r.value })), revenue),
    ...computeRdIntensity(researchDevelopment, revenue),
    ...totalDebt,
    ...ebitda,
    ...netDebt,
    ...computeDebtToEquity(totalDebt.map((r) => ({ id: r.sourceObservationIds.join(","), periodEnd: r.periodEnd, value: r.value })), equity),
    ...computeNetDebtToEbitda(
      netDebt.map((r) => ({ id: r.sourceObservationIds.join(","), periodEnd: r.periodEnd, value: r.value })),
      ebitda.map((r) => ({ id: r.sourceObservationIds.join(","), periodEnd: r.periodEnd, value: r.value }))
    ),
    ...investedCapital,
    ...effectiveTaxRate,
    ...roic,
  ];

  const outcomes: FundamentalRatioOutcome[] = [];
  for (const r of allResults) {
    const key = `${r.metricName}|${r.periodEnd}`;
    if (existingKeys.has(key)) {
      outcomes.push({ metricName: r.metricName, periodEnd: r.periodEnd, value: r.value, skippedReason: "already_exists" });
      continue;
    }
    try {
      const stored = await insertCalculatedMetric({
        companyId,
        metricName: r.metricName,
        value: r.value,
        periodEnd: r.periodEnd,
        inputDataHash: inputHash(r.sourceObservationIds),
      });
      if ("skipped" in stored) {
        outcomes.push({ metricName: r.metricName, periodEnd: r.periodEnd, value: r.value, skippedReason: "already_exists" });
      } else {
        outcomes.push({ metricName: r.metricName, periodEnd: r.periodEnd, value: r.value, stored: { id: stored.id } });
      }
    } catch (e) {
      outcomes.push({ metricName: r.metricName, periodEnd: r.periodEnd, value: r.value, skippedReason: (e as Error).message });
    }
  }
  return outcomes;
}
