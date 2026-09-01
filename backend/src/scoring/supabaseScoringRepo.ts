// ============================================================================
// Equity AI — Supabase-backed ScoringRepo
//
// Implements the ScoringRepo interface declared in scoringEngine.ts against
// the real Supabase client. scoringEngine.ts, scoreCategory.ts, percentile.ts,
// and confidence.ts are completely unmodified — they only know about the
// ScoringRepo interface, never about Supabase directly, same boundary
// supabaseIngestionRepo.ts already established for ingestion.
//
// Row-mapping/shaping logic lives in scoringRepoHelpers.ts (pure, unit
// tested); this file is the thin I/O wrapper around it, verified via the
// real live NVDA run rather than mocked unit tests — matching how
// supabaseIngestionRepo.ts itself has no unit tests either.
// ============================================================================

import { getDbClient } from "../db/client";
import type { ScoringRepo } from "./scoringEngine";
import type { FundamentalScore, MetricBenchmark } from "../types/domain";
import type { MetricInput } from "./categoryScorers/types";
import { resolveBenchmarkTier } from "./benchmarkResolver";
import {
  buildMetricInput,
  mapScoreCategoryRow,
  mapScoreRuleRow,
  type DbScoreCategoryRow,
  type DbScoreRuleRow,
  type DbMetricBenchmarkRow,
} from "./scoringRepoHelpers";

/** Shapes one metric_benchmarks row into the MetricBenchmark shape resolver/
 *  scoring code expects — the same field mapping scoringRepoHelpers.ts's
 *  buildBenchmarkMap uses per-row, just applied to a single row at a time
 *  here since getBenchmarks (below) must resolve SECTOR vs MARKET_WIDE per
 *  metric via the existing resolveBenchmarkTier(), not just collect rows. */
function toMetricBenchmark(row: DbMetricBenchmarkRow): MetricBenchmark {
  return {
    metricName: row.metric_name,
    sector: row.sector ?? undefined,
    industry: row.industry ?? undefined,
    periodEnd: row.period_end,
    p25: row.p25,
    median: row.median,
    p75: row.p75,
    p90: row.p90,
    sampleSize: row.sample_size,
  };
}

/** How many past ANNUAL calculated_metrics periods to load per metric.
 *  Generous relative to the largest minimum_data_points (4) so nothing
 *  gets silently truncated as more history accumulates over time. */
const MAX_HISTORY_PERIODS = 20;

export function buildSupabaseScoringRepo(): ScoringRepo {
  const db = getDbClient();

  return {
    async getActiveCategories() {
      const { data, error } = await db.from("score_categories").select("*").eq("is_active", true);
      if (error) throw new Error(`score_categories query failed: ${error.message}`);
      return (data ?? []).map((row) => mapScoreCategoryRow(row as DbScoreCategoryRow));
    },

    async getActiveRules(version: string) {
      const { data, error } = await db.from("score_rules").select("*").eq("version", version).eq("active", true);
      if (error) throw new Error(`score_rules query failed: ${error.message}`);
      return (data ?? []).map((row) => mapScoreRuleRow(row as DbScoreRuleRow));
    },

    async getMetricInputs(companyId: string, metricNames: string[]) {
      const map = new Map<string, MetricInput>();
      // One query per metric — metricNames per call is always small (one
      // category's worth of rules, currently <=6), and this keeps each
      // metric's history independently ordered/limited without a more
      // complex batched-and-grouped query.
      for (const metricName of metricNames) {
        const { data, error } = await db
          .from("calculated_metrics")
          .select("period_end, value")
          .eq("company_id", companyId)
          .eq("metric_name", metricName)
          .eq("period_type", "ANNUAL")
          .order("period_end", { ascending: false })
          .limit(MAX_HISTORY_PERIODS);
        if (error) throw new Error(`calculated_metrics query failed for ${metricName}: ${error.message}`);

        const rows = (data ?? [])
          .filter((r: { value: number | null }) => r.value !== null)
          .map((r: { period_end: string; value: number }) => ({ periodEnd: r.period_end, value: r.value }));
        if (rows.length > 0) map.set(metricName, buildMetricInput(metricName, rows));
      }
      return map;
    },

    async getBenchmarks(companySector: string | undefined, metricNames: string[]) {
      if (metricNames.length === 0) return new Map();

      // Fetch BOTH candidate tiers — a plain .eq("sector", companySector)
      // can never match a MARKET_WIDE row (sector IS NULL is never equal to
      // a non-null value in Postgres), which is exactly the bug this fixes.
      const [sectorResult, marketWideResult] = await Promise.all([
        companySector
          ? db.from("metric_benchmarks").select("*").in("metric_name", metricNames).eq("sector", companySector)
          : Promise.resolve({ data: [] as DbMetricBenchmarkRow[], error: null }),
        db.from("metric_benchmarks").select("*").in("metric_name", metricNames).is("sector", null),
      ]);
      if (sectorResult.error) throw new Error(`metric_benchmarks sector query failed: ${sectorResult.error.message}`);
      if (marketWideResult.error) throw new Error(`metric_benchmarks market-wide query failed: ${marketWideResult.error.message}`);

      const sectorRowByMetric = new Map(((sectorResult.data ?? []) as DbMetricBenchmarkRow[]).map((r) => [r.metric_name, r]));
      const marketWideRowByMetric = new Map(((marketWideResult.data ?? []) as DbMetricBenchmarkRow[]).map((r) => [r.metric_name, r]));

      const map = new Map<string, MetricBenchmark>();
      for (const metricName of metricNames) {
        const sectorRow = sectorRowByMetric.get(metricName);
        const marketWideRow = marketWideRowByMetric.get(metricName);
        // Existing, already-tested tier resolution (benchmarkResolver.ts) —
        // SECTOR first, MARKET_WIDE fallback, no row if neither exists.
        const resolved = resolveBenchmarkTier(
          sectorRow ? toMetricBenchmark(sectorRow) : null,
          marketWideRow ? toMetricBenchmark(marketWideRow) : null
        );
        if (resolved.benchmark) map.set(metricName, resolved.benchmark);
      }
      return map;
    },

    async getCompanySector(companyId: string) {
      const { data, error } = await db.from("companies").select("sector").eq("id", companyId).maybeSingle();
      if (error) throw new Error(`companies sector lookup failed: ${error.message}`);
      return (data?.sector as string | undefined) ?? undefined;
    },

    async getPreviousFundamentalScore(companyId: string) {
      const { data, error } = await db
        .from("fundamental_scores")
        .select("score, calculated_at")
        .eq("company_id", companyId)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`fundamental_scores lookup failed: ${error.message}`);
      if (!data) return null;
      return { score: data.score as number, calculatedAt: data.calculated_at as string };
    },

    // Implemented for interface completeness — NOT exercised in Milestone
    // 4A. No code path in this milestone calls calculateFundamentalScore(),
    // so this never runs; it exists so the repo is genuinely ready for the
    // (separate, future, explicitly-approved) milestone that does.
    async storeFundamentalScore(result: FundamentalScore) {
      const { data: scoreRow, error: scoreError } = await db
        .from("fundamental_scores")
        .insert({
          company_id: result.companyId,
          score: result.score,
          confidence: result.confidence,
          data_coverage: result.dataCoverage,
          calculation_version: result.calculationVersion,
          previous_score: result.previousScore,
          score_change: result.scoreChange,
        })
        .select("id")
        .single();
      if (scoreError || !scoreRow) throw new Error(`fundamental_scores insert failed: ${scoreError?.message ?? "no row returned"}`);

      for (const cs of result.categoryScores) {
        const { error: catError } = await db.from("category_scores").insert({
          company_id: result.companyId,
          category_id: cs.categoryId,
          score: cs.score,
          confidence: cs.confidence,
          coverage: cs.coverage,
          calculation_version: cs.calculationVersion,
        });
        if (catError) throw new Error(`category_scores insert failed for ${cs.categoryKey}: ${catError.message}`);
      }
    },
  };
}
