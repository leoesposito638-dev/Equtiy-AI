// ============================================================================
// Equity AI — Provider Resolver (Milestone 8B)
//
// Implements FinancialDataProvider by trying an ordered list of underlying
// providers, company-level / statement-level, first-available-wins. This is
// the ONLY change needed to give the app multi-provider fallback: it
// conforms to the exact same interface every adapter already implements, so
// ingest.ts (and validators.ts, normalizers.ts, and every existing adapter)
// needs zero changes — see Milestone 8A, Parts 1/2/6/9/10.
//
// Design, locked in by the approved Milestone 8A review:
//   - PRIMARY: SEC EDGAR. FALLBACK: FMP. (see registry.ts for the order.)
//   - Company-level / statement-level fallback only. Each of
//     getIncomeStatement / getBalanceSheet / getCashFlow is resolved
//     independently — this resolver never mixes providers WITHIN a single
//     statement call. (A company's income statement might resolve to SEC
//     while its balance sheet resolves to FMP; that's still one provider per
//     statement, never one provider per field.)
//   - First-available-wins: the moment a provider returns
//     status === "available", the resolver returns that result immediately
//     and does NOT call any later provider — even to double-check, even if
//     the later provider "would" also succeed. This is deliberate: Milestone
//     8A explicitly deferred between-provider conflict detection to a future
//     milestone. Calling a second provider after the first already succeeded
//     would produce a second copy of the same period's data with no schema
//     support for storing both (see Milestone 8A, Part 5) and no validator
//     support for treating it as anything but a duplicate (see Milestone 8A,
//     Part 3) — so this resolver simply never does it.
//   - If every provider is unavailable, the resolver returns an honest
//     combined "unavailable" ProviderResult whose unavailableReason names
//     every provider that was tried and why — never a fabricated value.
//
// This file does NOT validate, normalize, calculate, or store anything, and
// does NOT alter any provider's response — it only decides which provider's
// unmodified result to return.
// ============================================================================

import type { FinancialDataProvider, ProviderCompanyRef, ProviderResult, RawLineItem } from "./interfaces";
import type { PeriodType } from "../types/domain";

type StatementMethod = "getIncomeStatement" | "getBalanceSheet" | "getCashFlow";

export class ProviderResolver implements FinancialDataProvider {
  /** Priority order — index 0 is tried first for every statement call. */
  private readonly providers: FinancialDataProvider[];

  constructor(providers: FinancialDataProvider[]) {
    if (providers.length === 0) {
      // Fail loudly at construction, same defensive pattern as every adapter
      // in this codebase (FmpFinancialDataAdapter, SecEdgarAdapter) — a
      // resolver with no providers is a caller error, not a runtime "try to
      // muddle through" situation.
      throw new Error("ProviderResolver constructed with an empty provider list.");
    }
    this.providers = providers;
  }

  async getIncomeStatement(ref: ProviderCompanyRef, periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>> {
    return this.resolve("getIncomeStatement", ref, periodType);
  }

  async getBalanceSheet(ref: ProviderCompanyRef, periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>> {
    return this.resolve("getBalanceSheet", ref, periodType);
  }

  async getCashFlow(ref: ProviderCompanyRef, periodType: PeriodType): Promise<ProviderResult<RawLineItem[]>> {
    return this.resolve("getCashFlow", ref, periodType);
  }

  /** Shared fallback loop for all three statement types — ordering,
   *  attempting, and failure-composition logic lives here exactly once. */
  private async resolve(
    method: StatementMethod,
    ref: ProviderCompanyRef,
    periodType: PeriodType
  ): Promise<ProviderResult<RawLineItem[]>> {
    const attempts: string[] = [];

    for (const provider of this.providers) {
      const result = await provider[method](ref, periodType);
      if (result.status === "available") {
        // First-available-wins: return this provider's unmodified result
        // immediately. No later provider in the list is called.
        return result;
      }
      const providerLabel = result.source?.providerName ?? provider.constructor.name;
      attempts.push(`${providerLabel}: ${result.unavailableReason ?? `status='${result.status}'`}`);
    }

    // Every provider failed — return one honest, combined ProviderResult
    // naming each provider tried and why. Never fabricate a value here.
    return {
      status: "unavailable",
      data: null,
      source: null,
      unavailableReason:
        `All ${this.providers.length} provider(s) failed for ${ref.ticker} (${method}, ${periodType}): ` +
        attempts.join("; "),
    };
  }
}
