// ============================================================================
// Tests: db/paginate.ts — fetchAllPaginated (Milestone 14D.1 Part 2)
// A fake "table" of in-memory rows stands in for Supabase; buildQuery
// slices it the same way a real .range(from, to) call would (inclusive
// bounds, matching PostgREST's own semantics).
// ============================================================================

import { describe, it, expect, vi } from "vitest";
import { fetchAllPaginated } from "../src/db/paginate";

function fakeTable<T>(rows: T[]) {
  return (from: number, to: number) => {
    const slice = rows.slice(from, to + 1); // .range(from, to) is inclusive
    return Promise.resolve({ data: slice, error: null });
  };
}

describe("fetchAllPaginated", () => {
  it("returns everything in one page when the table is smaller than pageSize", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const result = await fetchAllPaginated(fakeTable(rows), 1000);
    expect(result).toHaveLength(5);
    expect(result).toEqual(rows);
  });

  it("pages through a table larger than pageSize, concatenating every page in order", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const result = await fetchAllPaginated(fakeTable(rows), 1000);
    expect(result).toHaveLength(2500);
    expect(result.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  it("reproduces the exact live incident: a 4220-row result is not truncated to 1000", async () => {
    const rows = Array.from({ length: 4220 }, (_, i) => ({ id: i }));
    const result = await fetchAllPaginated(fakeTable(rows), 1000);
    expect(result).toHaveLength(4220);
  });

  it("boundary: a result exactly pageSize long still terminates (does not fetch a spurious empty extra page)", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const buildQuery = vi.fn(fakeTable(rows));
    const result = await fetchAllPaginated(buildQuery, 1000);
    expect(result).toHaveLength(1000);
    expect(buildQuery).toHaveBeenCalledTimes(2); // page 1: 1000 rows (full) -> page 2: 0 rows (stop)
  });

  it("boundary: pageSize + 1 rows requires exactly two pages", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ id: i }));
    const buildQuery = vi.fn(fakeTable(rows));
    const result = await fetchAllPaginated(buildQuery, 1000);
    expect(result).toHaveLength(1001);
    expect(buildQuery).toHaveBeenCalledTimes(2);
  });

  it("an empty table returns an empty array after exactly one page", async () => {
    const buildQuery = vi.fn(fakeTable<{ id: number }>([]));
    const result = await fetchAllPaginated(buildQuery, 1000);
    expect(result).toEqual([]);
    expect(buildQuery).toHaveBeenCalledTimes(1);
  });

  it("throws on the first page that errors, never returning a partial result", async () => {
    const buildQuery = vi.fn().mockResolvedValue({ data: null, error: { message: "connection reset" } });
    await expect(fetchAllPaginated(buildQuery, 1000)).rejects.toThrow("connection reset");
  });

  it("respects a custom pageSize", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: i }));
    const buildQuery = vi.fn(fakeTable(rows));
    const result = await fetchAllPaginated(buildQuery, 10);
    expect(result).toHaveLength(25);
    expect(buildQuery).toHaveBeenCalledTimes(3); // 10 + 10 + 5
  });

  it("passes the correct inclusive [from, to] range on each page", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: i }));
    const calls: Array<[number, number]> = [];
    const buildQuery = (from: number, to: number) => {
      calls.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    };
    await fetchAllPaginated(buildQuery, 5);
    expect(calls).toEqual([
      [0, 4],
      [5, 9],
      [10, 14],
    ]);
  });
});
