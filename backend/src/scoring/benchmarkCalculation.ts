// ============================================================================
// Equity AI — Benchmark Calculation (Milestone 5)
//
// Pure functions only — no DB. Given real per-company observations for ONE
// metric, determines which of SECTOR / MARKET_WIDE a benchmark snapshot can
// legitimately support, and computes p25/median/p75/p90 from the real
// values with NO outlier treatment (decision 6 — raw values as stored).
//
// The 10/30 thresholds and "per metric, not per sector" scoping come
// directly from the approved Milestone 5 design; nothing here invents a
// number beyond what was approved.
// ============================================================================

export const SECTOR_MIN_SAMPLE_SIZE = 10;
export const MARKET_WIDE_MIN_SAMPLE_SIZE = 30;

export interface CompanyMetricObservation {
  companyId: string;
  periodEnd: string;
  value: number;
}

export interface CompanyMetricObservationWithSector extends CompanyMetricObservation {
  sector: string | undefined;
}

/**
 * Fiscal period alignment (approved decision 9): companies are NOT required
 * to share a fiscal year-end. For a benchmark snapshot as of `asOfDate`,
 * each company contributes its own MOST RECENT observation with
 * periodEnd <= asOfDate — never a different company's period, never an
 * average across periods, never a future period smuggled in.
 *
 * `observations` may contain multiple periods per company (e.g. the full
 * backfilled history from Milestone 4A) — this reduces to exactly one
 * observation per company.
 */
export function selectLatestPerCompanyAsOf<T extends CompanyMetricObservation>(
  observations: T[],
  asOfDate: string
): T[] {
  const latestByCompany = new Map<string, T>();
  for (const obs of observations) {
    if (obs.periodEnd > asOfDate) continue; // not yet available as of this snapshot date
    const current = latestByCompany.get(obs.companyId);
    if (!current || obs.periodEnd > current.periodEnd) {
      latestByCompany.set(obs.companyId, obs);
    }
  }
  return [...latestByCompany.values()];
}

/**
 * p25/median/p75/p90 via linear interpolation between order statistics
 * (the "R-7" / numpy-default method) — a standard, well-defined choice,
 * documented explicitly here because "percentile" is not a single
 * universally-agreed algorithm. No outlier removal, no trimming, no
 * winsorizing (approved decision 6) — every real value in `values`
 * participates exactly as stored.
 */
export function computeQuantiles(values: number[]): { p25: number; median: number; p75: number; p90: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number): number => {
    if (sorted.length === 1) return sorted[0]!;
    const index = p * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower]!;
    const weight = index - lower;
    return sorted[lower]! + weight * (sorted[upper]! - sorted[lower]!);
  };
  return { p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9) };
}

/**
 * Mirrors uq_metric_benchmarks_v2 (schema/006_benchmark_provenance.sql)
 * exactly: (metric_name, benchmark_type, coalesce(sector,''), period_end,
 * benchmark_version). Two snapshots collide only when every one of these
 * matches — a routine data refresh (new calculated_at, same period_end) is
 * NOT itself part of this key, matching the approved rule that a refresh
 * must not overwrite a prior snapshot at a different period_end, while a
 * genuine re-run at the exact same period_end/version is treated as the
 * same snapshot (duplicate-safe, same as every other insert in this
 * codebase).
 */
export function buildBenchmarkSnapshotKey(params: {
  metricName: string;
  benchmarkType: "SECTOR" | "MARKET_WIDE";
  sector: string | null;
  periodEnd: string;
  benchmarkVersion: string;
}): string {
  return [params.metricName, params.benchmarkType, params.sector ?? "", params.periodEnd, params.benchmarkVersion].join("|");
}

export interface BenchmarkComputationResult {
  sectorBenchmarks: Array<{ sector: string; sampleSize: number; p25: number; median: number; p75: number; p90: number }>;
  marketWideBenchmark: { sampleSize: number; p25: number; median: number; p75: number; p90: number } | null;
}

/**
 * For ONE metric: groups real observations by sector, and produces a
 * SECTOR benchmark for every sector meeting SECTOR_MIN_SAMPLE_SIZE
 * (independently — the threshold applies per metric, per approved decision
 * 2, and this function is always called scoped to one metric already), plus
 * a single MARKET_WIDE benchmark across ALL observations if the total meets
 * MARKET_WIDE_MIN_SAMPLE_SIZE. Neither threshold met for a given grouping
 * -> that grouping simply produces no row, which callers must treat as
 * UNAVAILABLE (never a fabricated/partial benchmark).
 *
 * `observations` must already be one-per-company (see
 * selectLatestPerCompanyAsOf) — a company appearing twice would silently
 * double-count its own value in the distribution.
 */
export function computeBenchmarkTiers(observations: CompanyMetricObservationWithSector[]): BenchmarkComputationResult {
  const bySector = new Map<string, number[]>();
  const allValues: number[] = [];

  for (const obs of observations) {
    allValues.push(obs.value);
    if (!obs.sector) continue;
    const list = bySector.get(obs.sector) ?? [];
    list.push(obs.value);
    bySector.set(obs.sector, list);
  }

  const sectorBenchmarks: BenchmarkComputationResult["sectorBenchmarks"] = [];
  for (const [sector, values] of bySector) {
    if (values.length < SECTOR_MIN_SAMPLE_SIZE) continue;
    sectorBenchmarks.push({ sector, sampleSize: values.length, ...computeQuantiles(values) });
  }

  const marketWideBenchmark =
    allValues.length >= MARKET_WIDE_MIN_SAMPLE_SIZE
      ? { sampleSize: allValues.length, ...computeQuantiles(allValues) }
      : null;

  return { sectorBenchmarks, marketWideBenchmark };
}
