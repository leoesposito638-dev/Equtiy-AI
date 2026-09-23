// ============================================================================
// Equity AI — Supabase pagination helper (Milestone 14D.1 Part 2)
//
// PostgREST caps any unbounded .select() response at 1000 rows by default.
// This was first caught live during Milestone 14D, in a throwaway
// verification script: an unpaginated .select("*").in("company_id", ids)
// silently truncated a real 4220-row result to 1000, making it look like
// only 4/16 companies had daily_prices data. A live full-codebase audit
// (Milestone 14D.1) then confirmed the same shape of bug exists, unfixed,
// at multiple call sites — both production (companies.ts API routes,
// supabaseBenchmarkRepo.ts's cross-company metric fan-out,
// ingestForwardValuation.ts's estimates lookup, ingestDailyPrices.ts's
// upsert-return count) and in several committed verification scripts —
// and that raw_financial_data, financial_metrics, calculated_metrics and
// daily_prices already each individually exceed 1000 total rows in the
// live database (2322 / 2274 / 1669 / 4208 respectively, as of Milestone
// 14D.1), so any unbounded whole-table or cross-company fan-out select
// against them silently truncates TODAY, not just as a future risk.
//
// Any query whose result could plausibly exceed 1000 rows — a whole-table
// select, a fan-out across many companies, or a per-company series that
// accumulates rows over time — must page through with .range(), never
// rely on a single unbounded .select(). This helper is the one place that
// pattern is implemented, so every call site shares the same (tested)
// pagination logic instead of each hand-rolling its own loop.
// ============================================================================

export const SUPABASE_MAX_PAGE_SIZE = 1000;

export interface PagedQueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Runs `buildQuery(from, to)` repeatedly, sliding a `.range(from, to)`
 * window forward `pageSize` rows at a time, and concatenates every page
 * into a single array. Stops as soon as a page returns fewer than
 * `pageSize` rows (including zero), which is the correct end-of-data
 * signal for a PostgREST range query — never relies on a `count` header.
 *
 * Callers must pass a FACTORY, not a single already-built query object:
 * a Supabase query builder can only be awaited once, so a fresh query
 * has to be constructed for each page's `.range(from, to)`.
 *
 * Throws on the first page that errors, surfacing that page's message —
 * never returns a partial result silently.
 */
export async function fetchAllPaginated<T>(
  buildQuery: (from: number, to: number) => PromiseLike<PagedQueryResult<T>>,
  pageSize: number = SUPABASE_MAX_PAGE_SIZE
): Promise<T[]> {
  if (pageSize <= 0) throw new Error(`fetchAllPaginated: pageSize must be positive, got ${pageSize}.`);

  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
