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
  insertFinancialMetric(metric: FinancialMetric): Promise<void>;
  upsertDataSource(source: {
    providerName: string;
    providerType: string;
    sourceUrl?: string;
    filingDate?: string;
  }): Promise<string /* data_source_id */>;
  getExistingObservationKeys(companyId: string, periodType: PeriodType): Promise<Set<string>>;
  getFxRate(from: string, to: string): Promise<FxRate | undefined>;
}

export interface IngestionResult {
  companyId: string;
  accepted: number;
  rejected: number;
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
  const result: IngestionResult = { companyId, accepted: 0, rejected: 0, issues: [] };

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

  const existingKeys = await repo.getExistingObservationKeys(companyId, periodType);

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

    await repo.insertFinancialMetric(metric);
    result.accepted++;
  }

  return result;
}

// ingestBalanceSheet / ingestCashFlow follow the identical shape and are
// omitted here to avoid repetition — same validate → normalize → store flow,
// swapping provider.getBalanceSheet / provider.getCashFlow as the source call.
