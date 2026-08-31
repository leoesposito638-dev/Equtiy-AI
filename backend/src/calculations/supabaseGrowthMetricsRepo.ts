// ============================================================================
// Equity AI — Supabase-backed GROWTH calculated-metrics repo
//
// Reads real `financial_metrics` (revenue/eps) and writes real
// `calculated_metrics` rows. Mirrors src/ingestion/supabaseIngestionRepo.ts's
// style exactly (same 23505-handling convention, same "this file is the only
// place that touches these two tables for this purpose" boundary). The
// calculation math itself lives entirely in growthMetrics.ts — this file
// only does I/O.
// ============================================================================

import { createHash } from "crypto";
import { getDbClient } from "../db/client";
import { CALCULATION_VERSION } from "./metrics";
import {
  calculateRevenueGrowthYoy,
  calculateRevenueCagr3y,
  calculateEpsGrowthYoy,
  calculateEpsCagr,
  calculateGrowthAcceleration,
  type GrowthMetricResult,
} from "./growthMetrics";

interface AnnualPeriodRow {
  id: string;
  periodEnd: string;
  value: number | null;
}

/** Reads up to `count` most-recent ANNUAL financial_metrics rows for one
 *  metric, most-recent-first, right-padded with nulls if fewer than `count`
 *  exist — this null-padding IS the "missing period" signal the calculation
 *  functions in growthMetrics.ts already handle explicitly. */
async function getAnnualPeriods(companyId: string, metricName: string, count: number): Promise<AnnualPeriodRow[]> {
  const db = getDbClient();
  const { data, error } = await db
    .from("financial_metrics")
    .select("id, period_end, value")
    .eq("company_id", companyId)
    .eq("metric_name", metricName)
    .eq("period_type", "ANNUAL")
    .order("period_end", { ascending: false })
    .limit(count);

  if (error) throw new Error(`financial_metrics lookup failed for ${metricName}: ${error.message}`);

  const rows: AnnualPeriodRow[] = (data ?? []).map((r: { id: string; period_end: string; value: number | null }) => ({
    id: r.id,
    periodEnd: r.period_end,
    value: r.value,
  }));
  while (rows.length < count) rows.push({ id: "", periodEnd: "", value: null });
  return rows;
}

function inputHash(rows: AnnualPeriodRow[]): string {
  const canonical = rows.map((r) => `${r.id}:${r.value ?? "null"}`).join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

async function insertCalculatedMetric(params: {
  companyId: string;
  metricName: string;
  value: number;
  periodEnd: string;
  inputDataHash: string;
}): Promise<{ id: string }> {
  const db = getDbClient();
  const { data, error } = await db
    .from("calculated_metrics")
    .insert({
      company_id: params.companyId,
      metric_name: params.metricName,
      value: params.value,
      period_end: params.periodEnd,
      period_type: "ANNUAL",
      calculation_version: CALCULATION_VERSION,
      input_data_hash: params.inputDataHash,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new Error(`calculated_metrics: this exact metric/period/version already exists (uq_calculated_metrics): ${error.message}`);
    }
    throw new Error(`calculated_metrics insert failed: ${error?.message ?? "no row returned"}`);
  }
  return { id: data.id as string };
}

export interface GrowthMetricOutcome {
  metricName: string;
  result: GrowthMetricResult;
  stored?: { id: string; periodEnd: string };
  storeError?: string;
}

/** Computes all 5 GROWTH metrics for one company from real financial_metrics
 *  data, writes a calculated_metrics row for each one that's available, and
 *  reports what happened for every metric — including the ones that stayed
 *  unavailable. Never writes a row for an unavailable result. */
export async function calculateAndStoreGrowthMetrics(companyId: string): Promise<GrowthMetricOutcome[]> {
  const revenueRows = await getAnnualPeriods(companyId, "revenue", 4);
  const epsRows = await getAnnualPeriods(companyId, "eps", 4);
  const revenueValues = revenueRows.map((r) => r.value);
  const epsValues = epsRows.map((r) => r.value);
  // The most recent period among whichever rows exist — used as period_end
  // for every metric computed "as of" the latest available data.
  const currentPeriodEnd = revenueRows[0]?.periodEnd || epsRows[0]?.periodEnd || "";

  const computations: Array<{ metricName: string; result: GrowthMetricResult; rowsUsed: AnnualPeriodRow[] }> = [
    { metricName: "revenue_growth_yoy", result: calculateRevenueGrowthYoy(revenueValues[0] ?? null, revenueValues[1] ?? null), rowsUsed: revenueRows.slice(0, 2) },
    { metricName: "revenue_cagr_3y", result: calculateRevenueCagr3y(revenueValues), rowsUsed: revenueRows },
    { metricName: "eps_growth_yoy", result: calculateEpsGrowthYoy(epsValues[0] ?? null, epsValues[1] ?? null), rowsUsed: epsRows.slice(0, 2) },
    { metricName: "eps_cagr", result: calculateEpsCagr(epsValues), rowsUsed: epsRows },
    { metricName: "growth_acceleration", result: calculateGrowthAcceleration(revenueValues), rowsUsed: revenueRows },
  ];

  const outcomes: GrowthMetricOutcome[] = [];
  for (const c of computations) {
    if (c.result.value === null) {
      outcomes.push({ metricName: c.metricName, result: c.result });
      continue;
    }
    try {
      const stored = await insertCalculatedMetric({
        companyId,
        metricName: c.metricName,
        value: c.result.value,
        periodEnd: currentPeriodEnd,
        inputDataHash: inputHash(c.rowsUsed),
      });
      outcomes.push({ metricName: c.metricName, result: c.result, stored: { id: stored.id, periodEnd: currentPeriodEnd } });
    } catch (e) {
      outcomes.push({ metricName: c.metricName, result: c.result, storeError: (e as Error).message });
    }
  }
  return outcomes;
}
