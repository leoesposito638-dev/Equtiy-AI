// ============================================================================
// Equity AI — Supabase-backed IngestionRepo
//
// Implements the IngestionRepo interface declared in ingest.ts against the
// real Supabase client (src/db/client.ts). ingest.ts itself is completely
// unmodified — it only knows about the IngestionRepo interface, never about
// Supabase directly.
// ============================================================================

import { getDbClient } from "../db/client";
import { CanonicalAlreadyExistsError, type IngestionRepo } from "./ingest";
import type { PeriodType, FinancialMetric } from "../types/domain";
import type { FxRate } from "./normalizers";

export function buildSupabaseIngestionRepo(): IngestionRepo {
  const db = getDbClient();

  return {
    async insertRawFinancialData(params) {
      const { error } = await db.from("raw_financial_data").insert({
        company_id: params.companyId,
        data_source_id: params.dataSourceId,
        metric_name: params.metricName,
        raw_value: params.rawValue,
        unit: params.unit,
        currency: params.currency,
        period_start: params.periodStart ?? null,
        period_end: params.periodEnd,
        period_type: params.periodType,
      });
      if (error) {
        // The dedupe unique index (uq_raw_fin_dedupe) rejecting a repeat
        // insert is an expected, benign case — surface it as such rather
        // than a generic failure.
        if (error.code === "23505") {
          throw new Error(`raw_financial_data: this exact observation was already ingested (unique constraint uq_raw_fin_dedupe): ${error.message}`);
        }
        throw new Error(`raw_financial_data insert failed: ${error.message}`);
      }
    },

    async insertFinancialMetric(metric: FinancialMetric) {
      const { error } = await db.from("financial_metrics").insert({
        company_id: metric.companyId,
        metric_name: metric.metricName,
        metric_category: metric.metricCategory ?? null,
        value: metric.value,
        unit: metric.unit,
        currency: metric.currency,
        period_start: metric.periodStart ?? null,
        period_end: metric.periodEnd,
        period_type: metric.periodType,
        source_id: metric.sourceId,
        calculation_type: metric.calculationType,
        confidence_score: metric.confidenceScore ?? null,
      });
      if (error) {
        if (error.code === "23505") {
          // Milestone 8D Stage 1: a canonical row for this company/metric/
          // period/period_type/currency already exists — from another
          // provider's earlier ingestion, most likely. This is an expected,
          // graceful outcome (ingest.ts catches it and skips), never a crash.
          throw new CanonicalAlreadyExistsError(
            `financial_metrics: a row for this company/metric/period/period_type/currency already exists (unique constraint uq_financial_metrics): ${error.message}`
          );
        }
        throw new Error(`financial_metrics insert failed: ${error.message}`);
      }
    },

    async upsertDataSource(source) {
      // data_sources has no natural unique key across (provider, url) in the
      // schema, so each ingestion run records its own data_sources row —
      // this mirrors "retrieved_at" being meaningfully different per fetch
      // even when the same filing is re-read later. Real de-duplication (if
      // desired) belongs in a future increment with an explicit unique
      // constraint, not silently assumed here.
      const { data, error } = await db
        .from("data_sources")
        .insert({
          provider_name: source.providerName,
          provider_type: source.providerType,
          source_url: source.sourceUrl ?? null,
          filing_date: source.filingDate ?? null,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(`data_sources insert failed: ${error?.message ?? "no row returned"}`);
      }
      return data.id as string;
    },

    async getExistingObservationKeys(companyId: string, periodType: PeriodType, providerName: string) {
      // Milestone 8D Stage 1: scoped to `providerName` via the existing
      // raw_financial_data.data_source_id -> data_sources relationship — no
      // schema change. A different provider's observation for the same
      // metric/period is therefore NOT in this set, so it is not treated as
      // a duplicate at the raw layer (see validators.ts / ingest.ts).
      const { data, error } = await db
        .from("raw_financial_data")
        .select("metric_name, period_end, period_type, data_sources!inner(provider_name)")
        .eq("company_id", companyId)
        .eq("period_type", periodType)
        .eq("data_sources.provider_name", providerName);

      if (error) throw new Error(`getExistingObservationKeys query failed: ${error.message}`);

      return new Set((data ?? []).map((row: { metric_name: string; period_end: string; period_type: string }) =>
        `${row.metric_name}|${row.period_end}|${row.period_type}`
      ));
    },

    async getFxRate(from: string, to: string): Promise<FxRate | undefined> {
      // KNOWN GAP: there is no fx_rates table in the current schema
      // (schema/001_core_tables.sql - schema/003_analysis_tables.sql), so
      // this always returns undefined. Per normalizeLineItem's own contract
      // (src/ingestion/normalizers.ts), that correctly causes any
      // non-matching-currency line item to be rejected rather than silently
      // guessing a conversion rate. Not a concern for this first NVDA/
      // revenue/USD test since no conversion is needed. Add an fx_rates
      // table + real lookup here before ingesting any company that reports
      // in a currency other than its `companies.currency`.
      void from;
      void to;
      return undefined;
    },
  };
}

/** Resolves a company's internal UUID from its ticker — needed because
 * ingestIncomeStatement() takes a companyId, not a ticker, and the caller
 * (the test script) only knows the ticker. */
export async function getCompanyIdByTicker(ticker: string): Promise<{ id: string; currency: string } | null> {
  const db = getDbClient();
  const { data, error } = await db.from("companies").select("id, currency").eq("ticker", ticker).eq("is_active", true).maybeSingle();
  if (error) throw new Error(`companies lookup failed: ${error.message}`);
  if (!data) return null;
  return { id: data.id as string, currency: (data.currency as string) ?? "USD" };
}
