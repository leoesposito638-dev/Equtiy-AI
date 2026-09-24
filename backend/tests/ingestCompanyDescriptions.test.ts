// ============================================================================
// Tests: ingestCompanyDescription (Milestone 16C, item 2) — idempotency
// (never overwrites an existing description), "never fabricate" (an
// unavailable/empty profile stores nothing), and traceability (the outcome
// carries the untruncated original text + source URL + retrieval time),
// against a small in-memory fake companies table. No real network/database
// call happens.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CompanyProfile, MarketDataProvider, ProviderCompanyRef, ProviderResult } from "../src/providers/interfaces";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

function makeFakeDb(companies: Record<string, { description: string | null }>) {
  function from(_table: "companies") {
    let mode: "select" | "update" = "select";
    let updatePayload: Record<string, unknown> | null = null;
    let idFilter: string | undefined;

    const builder: any = {
      select() {
        mode = "select";
        return builder;
      },
      update(payload: Record<string, unknown>) {
        mode = "update";
        updatePayload = payload;
        return builder;
      },
      eq(k: string, v: string) {
        if (k === "id") idFilter = v;
        return builder;
      },
      single() {
        const row = idFilter ? companies[idFilter] : undefined;
        return Promise.resolve(row ? { data: row, error: null } : { data: null, error: { message: "not found" } });
      },
      then(resolve: (v: { data: any; error: any }) => void) {
        if (mode === "update" && idFilter && updatePayload) {
          companies[idFilter] = { ...companies[idFilter], ...updatePayload } as { description: string | null };
          return resolve({ data: null, error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return builder;
  }
  return { from };
}

function makeProvider(profile: ProviderResult<CompanyProfile>): MarketDataProvider {
  const unavailable = async () => ({ status: "unavailable" as const, data: null, source: null });
  return {
    getQuote: unavailable,
    getHistoricalPrices: unavailable,
    getValuationRatios: unavailable,
    getLivePrice: unavailable,
    getDebtMetricsHistory: unavailable,
    async getCompanyProfile(_ref: ProviderCompanyRef) {
      return profile;
    },
  };
}

describe("ingestCompanyDescription", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("stores a shortened description and reports the untruncated original + source for traceability", async () => {
    const companies = { "company-1": { description: null } };
    dbClientMock.getDbClient.mockReturnValue(makeFakeDb(companies));
    const { ingestCompanyDescription } = await import("../src/ingestion/ingestCompanyDescriptions");

    const profile: ProviderResult<CompanyProfile> = {
      status: "available",
      data: { description: "NVIDIA Corporation designs GPUs. It also offers networking solutions." },
      source: { providerName: "Financial Modeling Prep", providerType: "MARKET_DATA", sourceUrl: "https://financialmodelingprep.com/stable/profile?symbol=NVDA" },
    };

    const outcome = await ingestCompanyDescription("company-1", { ticker: "NVDA" }, makeProvider(profile));

    expect(outcome.status).toBe("stored");
    expect(outcome.shortenedDescription).toBe("NVIDIA Corporation designs GPUs.");
    expect(outcome.originalDescription).toBe("NVIDIA Corporation designs GPUs. It also offers networking solutions.");
    expect(outcome.sourceUrl).toBe("https://financialmodelingprep.com/stable/profile?symbol=NVDA");
    expect(outcome.retrievedAt).toBeTruthy();
    expect(companies["company-1"].description).toBe("NVIDIA Corporation designs GPUs.");
  });

  it("never overwrites an existing description — idempotent, skips silently", async () => {
    const companies = { "company-1": { description: "An existing, previously-set description." } };
    dbClientMock.getDbClient.mockReturnValue(makeFakeDb(companies));
    const { ingestCompanyDescription } = await import("../src/ingestion/ingestCompanyDescriptions");

    const profile: ProviderResult<CompanyProfile> = {
      status: "available",
      data: { description: "A completely different profile description." },
      source: { providerName: "Financial Modeling Prep", providerType: "MARKET_DATA" },
    };

    const outcome = await ingestCompanyDescription("company-1", { ticker: "NVDA" }, makeProvider(profile));

    expect(outcome.status).toBe("skipped_existing");
    expect(companies["company-1"].description).toBe("An existing, previously-set description."); // untouched
  });

  it("stores nothing when the provider is unavailable — never fabricates a fallback", async () => {
    const companies = { "company-2": { description: null } };
    dbClientMock.getDbClient.mockReturnValue(makeFakeDb(companies));
    const { ingestCompanyDescription } = await import("../src/ingestion/ingestCompanyDescriptions");

    const outcome = await ingestCompanyDescription(
      "company-2",
      { ticker: "TXN" },
      makeProvider({ status: "unavailable", data: null, source: null, unavailableReason: "402 not entitled" })
    );

    expect(outcome.status).toBe("unavailable");
    expect(outcome.reason).toBe("402 not entitled");
    expect(companies["company-2"].description).toBeNull();
  });

  it("stores nothing when the profile description is empty", async () => {
    const companies = { "company-3": { description: null } };
    dbClientMock.getDbClient.mockReturnValue(makeFakeDb(companies));
    const { ingestCompanyDescription } = await import("../src/ingestion/ingestCompanyDescriptions");

    const outcome = await ingestCompanyDescription(
      "company-3",
      { ticker: "GOOGL" },
      makeProvider({ status: "available", data: { description: "   " }, source: { providerName: "Financial Modeling Prep", providerType: "MARKET_DATA" } })
    );

    expect(outcome.status).toBe("unavailable");
    expect(companies["company-3"].description).toBeNull();
  });
});
