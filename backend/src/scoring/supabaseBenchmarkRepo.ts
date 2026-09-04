// ============================================================================
// Equity AI — Supabase-backed benchmark computation I/O (Milestone 5)
//
// Thin I/O around the pure logic in benchmarkCalculation.ts. Two halves:
//
//   READ + COMPUTE (fetchAndComputeBenchmarkSnapshot): real, read-only
//   queries against calculated_metrics/companies — safe to run against the
//   live database today, requires no schema change, writes nothing.
//
//   WRITE (insertBenchmarkSnapshotRows): implemented for completeness
//   against schema/006_benchmark_provenance.sql's new columns, but that
//   migration has NOT been applied to the live database (see its header
//   comment), so this function cannot succeed there yet — and per Milestone
//   5's explicit instruction, it is never called from anywhere in this
//   milestone regardless. It exists so the write path is ready, not so it
//   runs.
// ============================================================================

import { getDbClient } from "../db/client";
import type { PeriodType } from "../types/domain";
import {
  selectLatestPerCompanyAsOf,
  computeBenchmarkTiers,
  type CompanyMetricObservationWithSector,
  type BenchmarkComputationResult,
} from "./benchmarkCalculation";

async function fetchObservationsForMetric(
  metricName: string,
  periodType: PeriodType,
  calculationVersion: string
): Promise<CompanyMetricObservationWithSector[]> {
  const db = getDbClient();

  const { data: metricRows, error: metricError } = await db
    .from("calculated_metrics")
    .select("company_id, period_end, value")
    .eq("metric_name", metricName)
    .eq("period_type", periodType)
    .eq("calculation_version", calculationVersion);
  if (metricError) throw new Error(`calculated_metrics query failed for ${metricName}: ${metricError.message}`);

  const rows = (metricRows ?? []) as Array<{ company_id: string; period_end: string; value: number | null }>;
  if (rows.length === 0) return [];

  const companyIds = [...new Set(rows.map((r) => r.company_id))];
  const { data: companyRows, error: companyError } = await db
    .from("companies")
    .select("id, sector")
    .in("id", companyIds);
  if (companyError) throw new Error(`companies sector lookup failed: ${companyError.message}`);

  const sectorByCompany = new Map<string, string | undefined>(
    (companyRows ?? []).map((c: { id: string; sector: string | null }) => [c.id, c.sector ?? undefined])
  );

  return rows
    .filter((r) => r.value !== null) // defensive; calculated_metrics never stores null-value rows by convention
    .map((r) => ({
      companyId: r.company_id,
      periodEnd: r.period_end,
      value: r.value as number,
      sector: sectorByCompany.get(r.company_id),
    }));
}

export interface BenchmarkSnapshotResult extends BenchmarkComputationResult {
  metricName: string;
  asOfDate: string;
  totalObservationsConsidered: number; // before the sector/market-wide thresholds are applied
}

/**
 * Real, read-only: fetches every real calculated_metrics observation for
 * one metric, reduces to one-per-company as of `asOfDate` (fiscal alignment,
 * approved decision 9), and computes whichever of SECTOR/MARKET_WIDE the
 * real sample sizes actually support. Writes nothing. Safe to run against
 * the live database at any time — including with today's single-company
 * dataset, where it correctly returns no qualifying benchmark at all.
 */
export async function fetchAndComputeBenchmarkSnapshot(
  metricName: string,
  periodType: PeriodType,
  calculationVersion: string,
  asOfDate: string
): Promise<BenchmarkSnapshotResult> {
  const rawObservations = await fetchObservationsForMetric(metricName, periodType, calculationVersion);
  const latestPerCompany = selectLatestPerCompanyAsOf(rawObservations, asOfDate);
  const computation = computeBenchmarkTiers(latestPerCompany);
  return { metricName, asOfDate, totalObservationsConsidered: latestPerCompany.length, ...computation };
}

export interface BenchmarkSnapshotRow {
  metricName: string;
  benchmarkType: "SECTOR" | "MARKET_WIDE";
  sector: string | null; // null for MARKET_WIDE
  periodEnd: string; // = asOfDate, the snapshot date
  benchmarkVersion: string;
  sampleSize: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
}

/**
 * NOT CALLED ANYWHERE IN THIS MILESTONE. Implemented so the write path
 * exists and is ready once (a) schema/006_benchmark_provenance.sql has
 * actually been applied to the live database, and (b) a future milestone
 * explicitly approves populating metric_benchmarks with production data.
 * Relies on uq_metric_benchmarks_v2 (schema/006) for duplicate-safety on
 * re-runs — same defense-in-depth pattern as every other insert in this
 * codebase (app-level check not included here since this function is
 * unexercised; a real caller would pre-check existing snapshot keys the
 * same way backfillGrowthMetrics does).
 */
export async function insertBenchmarkSnapshotRows(rows: BenchmarkSnapshotRow[]): Promise<void> {
  const db = getDbClient();
  for (const row of rows) {
    const { error } = await db.from("metric_benchmarks").insert({
      metric_name: row.metricName,
      benchmark_type: row.benchmarkType,
      sector: row.sector,
      period_end: row.periodEnd,
      benchmark_version: row.benchmarkVersion,
      sample_size: row.sampleSize,
      p25: row.p25,
      median: row.median,
      p75: row.p75,
      p90: row.p90,
    });
    if (error) {
      if (error.code === "23505") {
        throw new Error(`metric_benchmarks: this exact snapshot already exists (uq_metric_benchmarks_v2): ${error.message}`);
      }
      throw new Error(`metric_benchmarks insert failed: ${error.message}`);
    }
  }
}
