// ============================================================================
// Tests: supabaseScoringRepo.storeFundamentalScore — persistence correctness
// (Milestone 12C). Mocks the Supabase client with a small in-memory fake that
// mirrors the exact chain storeFundamentalScore now issues: a select/eq/eq/
// order/limit lookup before writing fundamental_scores, a select/eq/eq/in
// lookup before writing category_scores, then either .insert(payload) or
// .update(payload).eq("id", x) — no real network/database call happens.
//
// These tests exist specifically to lock in the fix for the bug discovered
// at the end of Milestone 12B: storeFundamentalScore() used to insert a
// category_scores row unconditionally for every category (including
// zero-coverage ones) with no existence check, fabricating placeholder rows
// and duplicating real ones on every re-run.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CategoryScore, FundamentalScore } from "../src/types/domain";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

type Row = Record<string, any>;
type TableName = "fundamental_scores" | "category_scores";

/** Small in-memory fake mirroring the subset of the Supabase query builder
 *  storeFundamentalScore actually uses: select().eq().eq()[.in()][.order().limit()],
 *  insert(payload), update(payload).eq("id", x) — each chain is awaited
 *  directly (no terminal .single()), matching the real code. */
function makeFakeDb(initial: { fundamental_scores?: Row[]; category_scores?: Row[] } = {}) {
  const state: Record<TableName, Row[]> = {
    fundamental_scores: [...(initial.fundamental_scores ?? [])],
    category_scores: [...(initial.category_scores ?? [])],
  };
  const inserts: Record<TableName, Row[]> = { fundamental_scores: [], category_scores: [] };
  const updates: Record<TableName, Row[]> = { fundamental_scores: [], category_scores: [] };
  let idCounter = 1;

  function from(table: TableName) {
    let mode: "select" | "insert" | "update" = "select";
    let payload: Row | null = null;
    const eqFilters: Row = {};
    let inField: string | null = null;
    let inValues: any[] = [];
    let orderField: string | null = null;
    let orderAscending = true;
    let limitN: number | null = null;

    function matches(row: Row): boolean {
      for (const [k, v] of Object.entries(eqFilters)) if (row[k] !== v) return false;
      if (inField && !inValues.includes(row[inField])) return false;
      return true;
    }

    function execute(): { data: any; error: null } {
      if (mode === "insert") {
        const row: Row = { id: `${table}-${idCounter++}`, ...payload };
        state[table].push(row);
        inserts[table].push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        const rows = state[table].filter(matches);
        for (const r of rows) Object.assign(r, payload);
        updates[table].push(...rows);
        return { data: rows, error: null };
      }
      let rows = state[table].filter(matches);
      if (orderField) {
        const field = orderField;
        rows = [...rows].sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0));
        if (!orderAscending) rows.reverse();
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows, error: null };
    }

    const builder: any = {
      select() {
        mode = "select";
        return builder;
      },
      insert(p: Row) {
        mode = "insert";
        payload = p;
        return builder;
      },
      update(p: Row) {
        mode = "update";
        payload = p;
        return builder;
      },
      eq(field: string, value: any) {
        eqFilters[field] = value;
        return builder;
      },
      in(field: string, values: any[]) {
        inField = field;
        inValues = values;
        return builder;
      },
      order(field: string, opts: { ascending: boolean }) {
        orderField = field;
        orderAscending = opts.ascending;
        return builder;
      },
      limit(n: number) {
        limitN = n;
        return builder;
      },
      then(resolve: any, reject: any) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };
    return builder;
  }

  return { from, state, inserts, updates };
}

async function buildRepoWith(fakeDb: ReturnType<typeof makeFakeDb>) {
  dbClientMock.getDbClient.mockReturnValue(fakeDb);
  const { buildSupabaseScoringRepo } = await import("../src/scoring/supabaseScoringRepo");
  return buildSupabaseScoringRepo();
}

function categoryScore(overrides: Partial<CategoryScore> = {}): CategoryScore {
  return {
    companyId: "company-a",
    categoryId: "cat-growth",
    categoryKey: "GROWTH",
    score: 72.5,
    confidence: 0.6,
    coverage: 0.5,
    calculationVersion: "v1.0",
    calculatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function fundamentalScore(overrides: Partial<FundamentalScore> = {}): FundamentalScore {
  return {
    companyId: "company-a",
    score: 65,
    confidence: 0.2,
    dataCoverage: 0.3,
    calculationVersion: "v1.0",
    previousScore: null,
    scoreChange: null,
    calculatedAt: "2026-09-01T00:00:00.000Z",
    categoryScores: [categoryScore()],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("supabaseScoringRepo.storeFundamentalScore — persistence correctness (Milestone 12C)", () => {
  it("1: a category with real coverage is persisted as a category_scores row", async () => {
    const db = makeFakeDb();
    const repo = await buildRepoWith(db);
    await repo.storeFundamentalScore(fundamentalScore());
    expect(db.state.category_scores).toHaveLength(1);
    expect(db.state.category_scores[0]).toMatchObject({
      company_id: "company-a",
      category_id: "cat-growth",
      score: 72.5,
      confidence: 0.6,
      coverage: 0.5,
      calculation_version: "v1.0",
    });
  });

  it("2: a zero-coverage category is NOT persisted as a category_scores row", async () => {
    const db = makeFakeDb();
    const repo = await buildRepoWith(db);
    await repo.storeFundamentalScore(
      fundamentalScore({
        categoryScores: [
          categoryScore({ categoryId: "cat-growth", coverage: 0.5 }),
          categoryScore({ categoryId: "cat-valuation", categoryKey: "VALUATION", score: 0, confidence: 0, coverage: 0 }),
        ],
      })
    );
    expect(db.state.category_scores).toHaveLength(1);
    expect(db.state.category_scores[0]!.category_id).toBe("cat-growth");
    expect(db.inserts.category_scores.some((r) => r.category_id === "cat-valuation")).toBe(false);
  });

  it("3: re-running with identical inputs does not duplicate rows (idempotent)", async () => {
    const db = makeFakeDb();
    const repo = await buildRepoWith(db);
    const result = fundamentalScore();
    await repo.storeFundamentalScore(result);
    await repo.storeFundamentalScore(result);
    expect(db.state.fundamental_scores).toHaveLength(1);
    expect(db.state.category_scores).toHaveLength(1);
    expect(db.inserts.fundamental_scores).toHaveLength(1);
    expect(db.inserts.category_scores).toHaveLength(1);
    expect(db.updates.fundamental_scores).toHaveLength(1);
    expect(db.updates.category_scores).toHaveLength(1);
  });

  it("4: a changed score updates the existing row in place rather than duplicating", async () => {
    const db = makeFakeDb();
    const repo = await buildRepoWith(db);
    await repo.storeFundamentalScore(fundamentalScore({ score: 65, categoryScores: [categoryScore({ score: 72.5 })] }));
    await repo.storeFundamentalScore(fundamentalScore({ score: 80, categoryScores: [categoryScore({ score: 91 })] }));
    expect(db.state.fundamental_scores).toHaveLength(1);
    expect(db.state.fundamental_scores[0]!.score).toBe(80);
    expect(db.state.category_scores).toHaveLength(1);
    expect(db.state.category_scores[0]!.score).toBe(91);
  });

  it("5: two different categories for the same company are persisted as two separate rows", async () => {
    const db = makeFakeDb();
    const repo = await buildRepoWith(db);
    await repo.storeFundamentalScore(
      fundamentalScore({
        categoryScores: [
          categoryScore({ categoryId: "cat-growth", categoryKey: "GROWTH" }),
          categoryScore({ categoryId: "cat-profitability", categoryKey: "PROFITABILITY", score: 40 }),
        ],
      })
    );
    expect(db.state.category_scores).toHaveLength(2);
    const byCategory = new Map(db.state.category_scores.map((r) => [r.category_id, r]));
    expect(byCategory.get("cat-growth")?.score).toBe(72.5);
    expect(byCategory.get("cat-profitability")?.score).toBe(40);
  });

  it("6: two different companies' scores stay separate — writing one does not affect the other", async () => {
    const db = makeFakeDb();
    const repo = await buildRepoWith(db);
    await repo.storeFundamentalScore(fundamentalScore({ companyId: "company-a" }));
    await repo.storeFundamentalScore(
      fundamentalScore({ companyId: "company-b", categoryScores: [categoryScore({ companyId: "company-b", score: 10 })] })
    );
    expect(db.state.fundamental_scores).toHaveLength(2);
    expect(db.state.category_scores).toHaveLength(2);
    // Re-running company A must not touch company B's rows.
    await repo.storeFundamentalScore(fundamentalScore({ companyId: "company-a", score: 99 }));
    expect(db.state.fundamental_scores).toHaveLength(2);
    const companyB = db.state.fundamental_scores.find((r) => r.company_id === "company-b");
    expect(companyB?.score).toBe(65);
  });

  it("7: fundamental_scores persistence is idempotent across changing category coverage", async () => {
    const db = makeFakeDb();
    const repo = await buildRepoWith(db);
    // First run: only GROWTH contributes.
    await repo.storeFundamentalScore(fundamentalScore({ score: 50, categoryScores: [categoryScore()] }));
    // Second run: GROWTH + PROFITABILITY now contribute (simulating new data landing).
    await repo.storeFundamentalScore(
      fundamentalScore({
        score: 60,
        categoryScores: [categoryScore(), categoryScore({ categoryId: "cat-profitability", categoryKey: "PROFITABILITY", score: 30 })],
      })
    );
    expect(db.state.fundamental_scores).toHaveLength(1);
    expect(db.state.fundamental_scores[0]!.score).toBe(60);
    expect(db.state.category_scores).toHaveLength(2);
  });

  it("8: existing (pre-12C) real-coverage persistence behavior is unchanged — correct fields, no unrelated writes", async () => {
    const db = makeFakeDb();
    const repo = await buildRepoWith(db);
    const result = fundamentalScore({
      companyId: "company-a",
      score: 55.2,
      confidence: 0.187,
      dataCoverage: 0.25,
      previousScore: 50,
      scoreChange: 5.2,
      categoryScores: [categoryScore({ categoryId: "cat-growth", categoryKey: "GROWTH", score: 72.5, confidence: 0.6, coverage: 0.5 })],
    });
    await repo.storeFundamentalScore(result);

    expect(db.state.fundamental_scores).toHaveLength(1);
    expect(db.state.fundamental_scores[0]).toMatchObject({
      company_id: "company-a",
      score: 55.2,
      confidence: 0.187,
      data_coverage: 0.25,
      calculation_version: "v1.0",
      previous_score: 50,
      score_change: 5.2,
    });

    expect(db.state.category_scores).toHaveLength(1);
    expect(db.state.category_scores[0]).toMatchObject({
      company_id: "company-a",
      category_id: "cat-growth",
      score: 72.5,
      confidence: 0.6,
      coverage: 0.5,
      calculation_version: "v1.0",
    });

    // score/confidence/coverage stay within their documented ranges.
    for (const row of db.state.category_scores) {
      expect(row.score).toBeGreaterThanOrEqual(0);
      expect(row.score).toBeLessThanOrEqual(100);
      expect(row.confidence).toBeGreaterThanOrEqual(0);
      expect(row.confidence).toBeLessThanOrEqual(1);
      expect(row.coverage).toBeGreaterThanOrEqual(0);
      expect(row.coverage).toBeLessThanOrEqual(1);
    }
  });
});
