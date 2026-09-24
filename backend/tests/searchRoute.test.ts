// ============================================================================
// Tests: GET /search route (Milestone 16C item 4) — the filter-injection
// fix. Exercises the real Express router against a fake Supabase client
// that RECORDS exactly what filter values reach .ilike(), so these tests
// prove the code path structurally can't re-interpret a malicious query as
// PostgREST filter syntax: every call is a single-column .ilike() with the
// raw, untouched query string as its value — never a hand-built comma-
// joined .or() string that PostgREST could parse into extra clauses.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

interface IlikeCall {
  table: string;
  column: string;
  pattern: string;
}

function makeFakeDb(rows: Array<{ id: string; name: string; ticker: string; exchange: string; sector: string }>) {
  const ilikeCalls: IlikeCall[] = [];

  function from(table: string) {
    let column: string | undefined;
    let pattern: string | undefined;

    const builder: any = {
      select() {
        return builder;
      },
      ilike(col: string, pat: string) {
        column = col;
        pattern = pat;
        ilikeCalls.push({ table, column: col, pattern: pat });
        return builder;
      },
      eq() {
        return builder;
      },
      in() {
        return builder;
      },
      limit() {
        return builder;
      },
      then(resolve: (v: { data: any; error: any }) => void) {
        if (!column || pattern === undefined) return resolve({ data: [], error: null });
        // Simulate a real ILIKE %pattern%: match rows whose column contains
        // the literal (case-insensitive) substring, wildcards and all —
        // this is exactly the point: a comma/paren/dot in the query is just
        // a literal character to match, never special syntax.
        const needle = pattern.replace(/^%|%$/g, "").toLowerCase();
        const matches = rows.filter((r) => String((r as any)[column!]).toLowerCase().includes(needle));
        return resolve({ data: matches, error: null });
      },
    };
    return builder;
  }

  return { from, ilikeCalls };
}

let fakeDb: ReturnType<typeof makeFakeDb>;
let app: express.Express;

async function get(path: string) {
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    server.close();
  }
}

const ROWS = [
  { id: "1", name: "NVIDIA Corporation", ticker: "NVDA", exchange: "NASDAQ", sector: "Technology" },
  { id: "2", name: "Adobe Inc.", ticker: "ADBE", exchange: "NASDAQ", sector: "Technology" },
];

beforeEach(async () => {
  vi.resetModules();
  fakeDb = makeFakeDb(ROWS);
  dbClientMock.getDbClient.mockReturnValue(fakeDb);
  const searchRouter = (await import("../src/api/routes/search")).default;
  app = express();
  app.use("/search", searchRouter);
});

describe("GET /search — happy path", () => {
  it("finds a company by a substring of its name", async () => {
    const { status, body } = await get("/search?q=NVIDIA");
    expect(status).toBe(200);
    expect(body.data.map((r: any) => r.ticker)).toEqual(["NVDA"]);
  });

  it("finds a company by ticker and ranks an exact ticker match first", async () => {
    const { body } = await get("/search?q=NVDA");
    expect(body.data[0].ticker).toBe("NVDA");
  });

  it("returns an empty array for an empty query, never all companies", async () => {
    const { body } = await get("/search?q=");
    expect(body.data).toEqual([]);
  });
});

describe("GET /search — filter-injection fix (Milestone 16C item 4)", () => {
  it.each([
    ["a comma", "NVDA,ticker.eq.ADBE"],
    ["parentheses", "NVDA)or(ticker.eq.ADBE"],
    ["a dot", "NVDA.ticker.eq.ADBE"],
    ["a percent sign", "NV%DA"],
  ])("a query containing %s is treated as a literal substring, never PostgREST filter syntax", async (_label, maliciousQuery) => {
    const { status } = await get(`/search?q=${encodeURIComponent(maliciousQuery)}`);
    expect(status).toBe(200); // never a 500 from a malformed filter string

    // The critical assertion: every .ilike() call carries the query as a
    // single, whole, untouched value — proving it was never split on the
    // comma/dot/paren into multiple clauses, which is what would happen if
    // this string were still being built into a hand-rolled .or() filter.
    expect(fakeDb.ilikeCalls.length).toBeGreaterThan(0);
    for (const call of fakeDb.ilikeCalls) {
      expect(call.pattern).toBe(`%${maliciousQuery}%`);
      expect(["name", "ticker"]).toContain(call.column);
    }
  });

  it("a comma-containing query does not silently match every row (the actual exploit shape: q='x,ticker.neq.impossible')", async () => {
    const { body } = await get("/search?q=" + encodeURIComponent("nonexistent,ticker.neq.impossible-value"));
    expect(body.data).toEqual([]); // no row's name/ticker literally contains that whole string
  });
});
