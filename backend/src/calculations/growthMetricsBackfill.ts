// ============================================================================
// Equity AI — GROWTH calculated-metrics backfill (pure window derivation)
//
// Given the REAL revenue/eps observations already in financial_metrics
// (nothing invented here), determines every additional past period_end at
// which each GROWTH metric can be LEGITIMATELY computed — i.e. every "as of"
// window where the required real raw periods actually exist — and computes
// the value using the exact same, unmodified functions from growthMetrics.ts
// used for the current-period calculation. No fabricated scoring runs: a
// window that isn't fully backed by real observations simply isn't produced.
//
// Pure and DB-free by design (same split as growthMetrics.ts itself) so it's
// unit-testable without Supabase; supabaseGrowthMetricsRepo.ts calls this and
// handles the actual insert + duplicate-safety.
// ============================================================================

import {
  calculateRevenueGrowthYoy,
  calculateRevenueCagr3y,
  calculateEpsGrowthYoy,
  calculateEpsCagr,
  calculateGrowthAcceleration,
} from "./growthMetrics";

export interface PeriodObservation {
  id: string;
  periodEnd: string;
  value: number | null;
}

export interface BackfillCandidate {
  metricName: string;
  periodEnd: string;
  value: number;
  /** financial_metrics row ids actually used to derive this value — for input_data_hash. */
  sourceObservationIds: string[];
}

/** revenuePeriods/epsPeriods MUST be ordered most-recent-first (index 0 =
 *  latest period), matching supabaseGrowthMetricsRepo.ts's existing query
 *  order and growthMetrics.ts's [t, t-1, t-2, t-3] convention. */
export function computeBackfillCandidates(
  revenuePeriods: PeriodObservation[],
  epsPeriods: PeriodObservation[]
): BackfillCandidate[] {
  const candidates: BackfillCandidate[] = [];

  // --- revenue_growth_yoy / eps_growth_yoy: every consecutive pair -------
  for (let i = 0; i < revenuePeriods.length - 1; i++) {
    const current = revenuePeriods[i]!;
    const previous = revenuePeriods[i + 1]!;
    const result = calculateRevenueGrowthYoy(current.value, previous.value);
    if (result.value !== null) {
      candidates.push({
        metricName: "revenue_growth_yoy",
        periodEnd: current.periodEnd,
        value: result.value,
        sourceObservationIds: [current.id, previous.id],
      });
    }
  }
  for (let i = 0; i < epsPeriods.length - 1; i++) {
    const current = epsPeriods[i]!;
    const previous = epsPeriods[i + 1]!;
    const result = calculateEpsGrowthYoy(current.value, previous.value);
    if (result.value !== null) {
      candidates.push({
        metricName: "eps_growth_yoy",
        periodEnd: current.periodEnd,
        value: result.value,
        sourceObservationIds: [current.id, previous.id],
      });
    }
  }

  // --- revenue_cagr_3y / eps_cagr / growth_acceleration: every full ------
  // 4-consecutive-period window (per the approved "require all 4" rule).
  for (let i = 0; i <= revenuePeriods.length - 4; i++) {
    const window = revenuePeriods.slice(i, i + 4);
    const values = window.map((p) => p.value);
    const ids = window.map((p) => p.id);

    const cagrResult = calculateRevenueCagr3y(values);
    if (cagrResult.value !== null) {
      candidates.push({ metricName: "revenue_cagr_3y", periodEnd: window[0]!.periodEnd, value: cagrResult.value, sourceObservationIds: ids });
    }

    const accelResult = calculateGrowthAcceleration(values);
    if (accelResult.value !== null) {
      candidates.push({ metricName: "growth_acceleration", periodEnd: window[0]!.periodEnd, value: accelResult.value, sourceObservationIds: ids });
    }
  }
  for (let i = 0; i <= epsPeriods.length - 4; i++) {
    const window = epsPeriods.slice(i, i + 4);
    const values = window.map((p) => p.value);
    const ids = window.map((p) => p.id);

    const cagrResult = calculateEpsCagr(values);
    if (cagrResult.value !== null) {
      candidates.push({ metricName: "eps_cagr", periodEnd: window[0]!.periodEnd, value: cagrResult.value, sourceObservationIds: ids });
    }
  }

  return candidates;
}

/** Removes candidates whose (metricName, periodEnd) already exists in
 *  calculated_metrics — the actual duplicate-safety mechanism for backfill,
 *  unit-testable without touching Supabase. The DB's own uq_calculated_metrics
 *  constraint remains the backstop, same defense-in-depth pattern as
 *  ingestion's DUPLICATE_OBSERVATION check + uq_raw_fin_dedupe. */
export function filterAlreadyStored(candidates: BackfillCandidate[], existingKeys: Set<string>): BackfillCandidate[] {
  return candidates.filter((c) => !existingKeys.has(`${c.metricName}|${c.periodEnd}`));
}
