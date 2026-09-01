// ============================================================================
// Tests: ingestIncomeStatement orchestration — Milestone 8D Stage 1
//
// Exercises the real, unmodified ingestIncomeStatement() end-to-end against
// an in-memory fake IngestionRepo and fake FinancialDataProvider — no
// Supabase, no network. Covers the provider-scoped raw-layer dedupe fix and
// the graceful canonical-conflict skip that ingest.ts now handles.
// ============================================================================

import { describe, it, expect } from "vitest";
import { ingestIncomeStatement, CanonicalAlreadyExistsError, type IngestionRepo } from "../src/ingestion/ingest";
import type { FinancialDataProvider, ProviderCompanyRef, RawLineItem } from "../src/providers/interfaces";
import type { PeriodType } from "../src/types/domain";
import type { FxRate } from "../src/ingestion/normalizers";

function fakeProvider(providerName: string, providerType: "SEC" | "FINANCIAL_API", data: RawLineItem[]): FinancialDataProvider {
  return {
    async getIncomeStatement() {
      return { status: "available", data, source: { providerName, providerType } };
    },
    async getBalanceSheet() {
      return { status: "unavailable", data: null, source: null, unavailableReason: "not implemented" };
    },
    async getCashFlow() {
      return { status: "unavailable", data: null, source: null, unavailableReason: "not implemented" };
    },
  };
}

/** In-memory fake mirroring supabaseIngestionRepo.ts's Stage 1 semantics:
 *  raw-layer dedupe scoped by provider, canonical layer throws
 *  CanonicalAlreadyExistsError on a second provider claiming the same slot. */
function fakeRepo() {
  const rawRows: Array<{ dataSourceId: string; metricName: string; periodEnd: string; periodType: PeriodType }> = [];
  const canonicalRows = new Map<string, unknown>(); // key -> stored metric
  const dataSources = new Map<string, { providerName: string; providerType: string }>();
  let nextSourceId = 0;

  const repo: IngestionRepo = {
    async insertRawFinancialData(params) {
      rawRows.push({
        dataSourceId: params.dataSourceId,
        metricName: params.metricName,
        periodEnd: params.periodEnd,
        periodType: params.periodType,
      });
    },
    async insertFinancialMetric(metric) {
      const key = `${metric.metricName}|${metric.periodEnd}|${metric.periodType}|${metric.currency}`;
      if (canonicalRows.has(key)) {
        throw new CanonicalAlreadyExistsError(`financial_metrics: ${key} already exists (fake unique constraint)`);
      }
      canonicalRows.set(key, metric);
    },
    async upsertDataSource(source) {
      const id = `src-${nextSourceId++}`;
      dataSources.set(id, { providerName: source.providerName, providerType: source.providerType });
      return id;
    },
    async getExistingObservationKeys(_companyId: string, periodType: PeriodType, providerName: string) {
      const keys = new Set<string>();
      for (const row of rawRows) {
        if (row.periodType !== periodType) continue;
        if (dataSources.get(row.dataSourceId)?.providerName !== providerName) continue;
        keys.add(`${row.metricName}|${row.periodEnd}|${row.periodType}`);
      }
      return keys;
    },
    async getFxRate(_from: string, _to: string): Promise<FxRate | undefined> {
      return undefined;
    },
  };

  return { repo, rawRows, canonicalRows };
}

const REF: ProviderCompanyRef = { ticker: "NVDA" };
const item = (overrides: Partial<RawLineItem> = {}): RawLineItem => ({
  metricName: "revenue",
  rawValue: 100,
  unit: "USD",
  currency: "USD",
  periodEnd: "2026-01-25",
  periodType: "ANNUAL",
  ...overrides,
});

describe("ingestIncomeStatement — normal first-time ingestion (unchanged behavior)", () => {
  it("accepts every item when nothing pre-exists", async () => {
    const { repo } = fakeRepo();
    const provider = fakeProvider("SEC EDGAR", "SEC", [item({ metricName: "revenue" }), item({ metricName: "net_income" })]);
    const result = await ingestIncomeStatement("company-1", REF, "USD", "ANNUAL", provider, repo);
    expect(result.accepted).toBe(2);
    expect(result.rejected).toBe(0);
    expect(result.canonicalSkipped).toBe(0);
  });
});

describe("ingestIncomeStatement — same-provider duplicate", () => {
  it("rejects a repeat ingestion from the SAME provider for the same metric/period", async () => {
    const { repo } = fakeRepo();
    const provider = fakeProvider("SEC EDGAR", "SEC", [item()]);
    await ingestIncomeStatement("company-1", REF, "USD", "ANNUAL", provider, repo);

    const result = await ingestIncomeStatement("company-1", REF, "USD", "ANNUAL", provider, repo);
    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.canonicalSkipped).toBe(0);
    expect(result.issues[0].issues[0].code).toBe("DUPLICATE_OBSERVATION");
  });
});

describe("ingestIncomeStatement — different-provider same-period (Milestone 8D Stage 1)", () => {
  it("accepts the raw observation from a different provider and gracefully skips the canonical insert", async () => {
    const { repo, rawRows, canonicalRows } = fakeRepo();
    const fmp = fakeProvider("Financial Modeling Prep", "FINANCIAL_API", [item()]);
    const first = await ingestIncomeStatement("company-1", REF, "USD", "ANNUAL", fmp, repo);
    expect(first.accepted).toBe(1);
    expect(canonicalRows.size).toBe(1);

    const sec = fakeProvider("SEC EDGAR", "SEC", [item()]);
    const second = await ingestIncomeStatement("company-1", REF, "USD", "ANNUAL", sec, repo);

    // Raw layer: NOT a duplicate — a different provider's observation for
    // the same metric/period is accepted and stored.
    expect(second.rejected).toBe(0);
    expect(rawRows.length).toBe(2); // FMP's + SEC's raw rows both stored
    expect(rawRows.filter((r) => r.metricName === "revenue" && r.periodEnd === "2026-01-25").length).toBe(2);

    // Canonical layer: gracefully skipped, not crashed, not overwritten.
    expect(second.accepted).toBe(0);
    expect(second.canonicalSkipped).toBe(1);
    expect(second.issues[0].issues[0].code).toBe("CANONICAL_ALREADY_EXISTS");
    expect(canonicalRows.size).toBe(1); // still just FMP's original canonical value
  });

  it("does not throw an uncaught exception when the canonical unique constraint would be violated", async () => {
    const { repo } = fakeRepo();
    const fmp = fakeProvider("Financial Modeling Prep", "FINANCIAL_API", [item()]);
    await ingestIncomeStatement("company-1", REF, "USD", "ANNUAL", fmp, repo);

    const sec = fakeProvider("SEC EDGAR", "SEC", [item()]);
    await expect(ingestIncomeStatement("company-1", REF, "USD", "ANNUAL", sec, repo)).resolves.toBeDefined();
  });

  it("still processes every item in a multi-item response even after one hits a canonical conflict", async () => {
    const { repo } = fakeRepo();
    const fmp = fakeProvider("Financial Modeling Prep", "FINANCIAL_API", [item({ metricName: "revenue" })]);
    await ingestIncomeStatement("company-1", REF, "USD", "ANNUAL", fmp, repo);

    const sec = fakeProvider("SEC EDGAR", "SEC", [item({ metricName: "revenue" }), item({ metricName: "net_income" })]);
    const result = await ingestIncomeStatement("company-1", REF, "USD", "ANNUAL", sec, repo);
    // revenue: canonical conflict (skipped); net_income: brand new, accepted.
    expect(result.canonicalSkipped).toBe(1);
    expect(result.accepted).toBe(1);
  });
});
