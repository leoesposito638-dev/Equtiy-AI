// ============================================================================
// Equity AI — Ingestion Pipeline Orchestration
//
// EXTERNAL SOURCE → RAW → NORMALIZE → VALIDATE → CANONICAL
//
// This module is the only place allowed to call provider adapters and the
// only place allowed to write raw_financial_data / financial_metrics. The
// scoring engine and API layer never talk to providers directly.
// ============================================================================

import type { FinancialDataProvider, ProviderCompanyRef } from "../providers/interfaces";
import type { PeriodType, FinancialMetric } from "../types/domain";
import { validateRawLineItem, type ValidationIssue } from "./validators";
import { normalizeLineItem, type FxRate } from "./normalizers";

/** Thrown by IngestionRepo.insertFinancialMetric when a canonical
 *  financial_metrics row already exists for this company/metric/period/
 *  period_type/currency (Milestone 8D Stage 1: a different, lower-or-not-yet-
 *  prioritized provider already claimed this canonical slot). This is an
 *  expected, benign outcome — never an uncaught crash — and never triggers a
 *  retroactive overwrite of the existing canonical value. */
export class CanonicalAlreadyExistsError extends Error {}

export interface IngestionRepo {
  insertRawFinancialData(params: {
    companyId: string;
    dataSourceId: string;
    metricName: string;
    rawValue: number | null;
    unit: string;
    currency: string;
    periodStart?: string;
    periodEnd: string;
    periodType: PeriodType;
  }): Promise<void>;
  /** @throws CanonicalAlreadyExistsError when a canonical row for this
   *  company/metric/period/period_type/currency already exists from another
   *  ingestion — the caller treats this as a graceful skip, not a failure. */
  insertFinancialMetric(metric: FinancialMetric): Promise<void>;
  upsertDataSource(source: {
    providerName: string;
    providerType: string;
    sourceUrl?: string;
    filingDate?: string;
  }): Promise<string /* data_source_id */>;
  /** Milestone 8D Stage 1: scoped to `providerName` — returns only the
   *  observation keys already ingested FROM THIS SAME PROVIDER, so a
   *  different provider's observation for the same metric/period is not
   *  treated as a duplicate at the raw layer. */
  getExistingObservationKeys(companyId: string, periodType: PeriodType, providerName: string): Promise<Set<string>>;
  getFxRate(from: string, to: string): Promise<FxRate | undefined>;
}

export interface IngestionResult {
  companyId: string;
  accepted: number;
  rejected: number;
  /** Milestone 8D Stage 1: raw observation was stored, but the canonical
   *  financial_metrics row was NOT written because a canonical value for
   *  this company/metric/period/period_type/currency already exists from a
   *  different provider. The existing canonical row is left untouched. */
  canonicalSkipped: number;
  issues: Array<{ metricName: string; issues: ValidationIssue[] }>;
}

export async function ingestIncomeStatement(
  companyId: string,
  ref: ProviderCompanyRef,
  companyCurrency: string,
  periodType: PeriodType,
  provider: FinancialDataProvider,
  repo: IngestionRepo
): Promise<IngestionResult> {
  const result: IngestionResult = { companyId, accepted: 0, rejected: 0, canonicalSkipped: 0, issues: [] };

  const response = await provider.getIncomeStatement(ref, periodType);
  if (response.status !== "available" || !response.data || !response.source) {
    // Explicit unavailability, not an error we paper over.
    result.issues.push({
      metricName: "*",
      issues: [{ code: "MISSING_VALUE", message: response.unavailableReason ?? "No data returned by provider." }],
    });
    return result;
  }

  const dataSourceId = await repo.upsertDataSource({
    providerName: response.source.providerName,
    providerType: response.source.providerType,
    sourceUrl: response.source.sourceUrl,
    filingDate: response.source.filingDate,
  });

  // Milestone 8D Stage 1: scoped to THIS provider only — a different
  // provider's observation for the same metric/period is not a duplicate.
  const existingKeys = await repo.getExistingObservationKeys(companyId, periodType, response.source.providerName);

  for (const item of response.data) {
    const validation = validateRawLineItem(item, existingKeys);
    if (!validation.valid) {
      result.rejected++;
      result.issues.push({ metricName: item.metricName, issues: validation.issues });
      continue;
    }

    // Never discard the raw observation, even though it will also be normalized.
    await repo.insertRawFinancialData({
      companyId,
      dataSourceId,
      metricName: item.metricName,
      rawValue: item.rawValue,
      unit: item.unit,
      currency: item.currency,
      periodStart: item.periodStart,
      periodEnd: item.periodEnd,
      periodType: item.periodType,
    });

    const fxRate =
      item.currency === companyCurrency ? undefined : await repo.getFxRate(item.currency, companyCurrency);

    const { metric, error } = normalizeLineItem(item, companyId, dataSourceId, companyCurrency, fxRate);
    if (!metric) {
      result.rejected++;
      result.issues.push({ metricName: item.metricName, issues: [{ code: "MISSING_CURRENCY", message: error! }] });
      continue;
    }

    try {
      await repo.insertFinancialMetric(metric);
      result.accepted++;
    } catch (e) {
      if (e instanceof CanonicalAlreadyExistsError) {
        // Milestone 8D Stage 1: the raw observation above is already safely
        // stored. No retroactive promotion/overwrite of the existing
        // canonical value — that is explicitly out of scope for Stage 1.
        result.canonicalSkipped++;
        result.issues.push({
          metricName: item.metricName,
          issues: [
            {
              code: "CANONICAL_ALREADY_EXISTS",
              message: `${item.metricName} for ${item.periodEnd} (${item.periodType}): raw observation stored from ${response.source.providerName}, but a canonical financial_metrics row already exists from a different provider — left untouched (no Stage 2 conflict resolution yet).`,
            },
          ],
        });
        continue;
      }
      throw e;
    }
  }

  return result;
}

// ingestBalanceSheet / ingestCashFlow follow the identical shape and are
// omitted here to avoid repetition — same validate → normalize → store flow,
// swapping provider.getBalanceSheet / provider.getCashFlow as the source call.
