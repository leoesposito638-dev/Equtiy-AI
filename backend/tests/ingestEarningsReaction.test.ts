// ============================================================================
// Tests: ingestEarningsReaction persistence (Milestone 14E) — dedup/
// idempotency, "no fallback, no interpolation", and daily_prices-only
// sourcing, against a small in-memory fake Supabase client (same style as
// ingestEarnings.test.ts / ingestForwardValuation.test.ts): no real
// network/database call happens.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const dbClientMock = { getDbClient: vi.fn() };
vi.mock("../src/db/client", () => dbClientMock);

type Row = Record<string, any>;
type TableName = "earnings" | "daily_prices" | "calculated_metrics";

function makeFakeDb(seed: { earnings?: Row[]; daily_prices?: Row[]; calculated_metrics?: Row[] } = {}) {
  const state: Record<TableName, Row[]> = {
    earnings: [...(seed.earnings ?? [])],
    daily_prices: [...(seed.daily_prices ?? [])],
    calculated_metrics: [...(seed.calculated_metrics ?? [])],
  };
  let idCounter = 1;

  function from(table: TableName) {
    let mode: "select" | "insert" = "select";
    let payload: Row | null = null;
    const eqFilters: Row = {};
    const notNullFilters: string[] = [];
    let orderField: string | null = null;
    let orderAscending = true;
    let rangeFrom: number | null = null;
    let rangeTo: number | null = null;

    const builder: any = {
      select(_cols: string) {
        if (mode !== "insert") mode = "select";
        return builder;
      },
      eq(k: string, v: unknown) {
        eqFilters[k] = v;
        return builder;
      },
      not(k: string, op: string, v: unknown) {
        if (op === "is" && v === null) notNullFilters.push(k);
        return builder;
      },
      order(field: string, opts: { ascending: boolean }) {
        orderField = field;
        orderAscending = opts.ascending;
        return builder;
      },
      range(from: number, to: number) {
        rangeFrom = from;
        rangeTo = to;
        return builder;
      },
      insert(p: Row) {
        mode = "insert";
        payload = p;
        return builder;
      },
      then(resolve: (v: { data: any; error: any }) => void) {
        if (mode === "insert" && payload) {
          if (table === "calculated_metrics") {
            const dup = state.calculated_metrics.find(
              (r) =>
                r.company_id === payload!.company_id &&
                r.metric_name === payload!.metric_name &&
                r.period_end === payload!.period_end &&
                r.period_type === payload!.period_type &&
                r.calculation_version === payload!.calculation_version
            );
            if (dup) return resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
          }
          const row: Row = { id: `${table}-${idCounter++}`, ...payload };
          state[table].push(row);
          return resolve({ data: row, error: null });
        }
        let rows = state[table].filter((row) => Object.entries(eqFilters).every(([k, v]) => row[k] === v));
        rows = rows.filter((row) => notNullFilters.every((k) => row[k] !== null && row[k] !== undefined));
        if (orderField) {
          const f = orderField;
          rows = [...rows].sort((a, b) => (a[f] > b[f] ? 1 : a[f] < b[f] ? -1 : 0));
          if (!orderAscending) rows.reverse();
        }
        if (rangeFrom != null && rangeTo != null) rows = rows.slice(rangeFrom, rangeTo + 1);
        return resolve({ data: rows, error: null });
      },
    };
    return builder;
  }

  return { from, state };
}

let fakeDb: ReturnType<typeof makeFakeDb>;

function earningsRow(overrides: Partial<Row> = {}): Row {
  return {
    id: `earnings-${Math.random()}`,
    company_id: "company-1",
    period_end: "2026-08-26",
    report_date: "2026-08-26T20:05:00Z",
    eps_actual: 2.22,
    ...overrides,
  };
}

function priceRow(date: string, close: number): Row {
  return { id: `price-${date}`, company_id: "company-1", trade_date: date, close };
}

describe("ingestEarningsReaction — happy path", () => {
  beforeEach(() => {
    fakeDb = makeFakeDb({
      earnings: [earningsRow()],
      daily_prices: [priceRow("2026-08-25", 213.0), priceRow("2026-08-26", 220.0), priceRow("2026-08-27", 228.0)],
    });
    dbClientMock.getDbClient.mockReturnValue(fakeDb);
  });

  it("computes and stores a value for a historical earnings row with both prices present", async () => {
    const { ingestEarningsReaction, EARNINGS_REACTION_METRIC_NAME, EARNINGS_REACTION_CALCULATION_VERSION } = await import(
      "../src/ingestion/ingestEarningsReaction"
    );
    const outcome = await ingestEarningsReaction("company-1");

    expect(outcome.historicalEarningsRows).toBe(1);
    expect(outcome.computed).toBe(1);
    expect(outcome.stored).toBe(1);
    expect(outcome.unavailable).toBe(0);

    expect(fakeDb.state.calculated_metrics).toHaveLength(1);
    const stored = fakeDb.state.calculated_metrics[0]!;
    expect(stored.metric_name).toBe(EARNINGS_REACTION_METRIC_NAME);
    expect(stored.period_end).toBe("2026-08-26"); // matches earnings.period_end, NOT report_date's own value here (same in this fixture, tested separately below)
    expect(stored.period_type).toBe("QUARTER");
    expect(stored.calculation_version).toBe(EARNINGS_REACTION_CALCULATION_VERSION);
    expect(stored.value).toBeCloseTo((228.0 / 213.0 - 1) * 100, 10);
    expect(typeof stored.input_data_hash).toBe("string");
    expect(stored.input_data_hash.length).toBeGreaterThan(0);
  });

  it("period_end follows earnings.period_end, distinct from report_date, when they differ", async () => {
    fakeDb = makeFakeDb({
      earnings: [earningsRow({ period_end: "2026-06-30", report_date: "2026-08-26T20:05:00Z" })],
      daily_prices: [priceRow("2026-08-25", 213.0), priceRow("2026-08-27", 228.0)],
    });
    dbClientMock.getDbClient.mockReturnValue(fakeDb);
    const { ingestEarningsReaction } = await import("../src/ingestion/ingestEarningsReaction");
    await ingestEarningsReaction("company-1");
    expect(fakeDb.state.calculated_metrics[0]!.period_end).toBe("2026-06-30");
  });
});

describe("ingestEarningsReaction — never fabricates, no fallback, no interpolation", () => {
  it("an upcoming (eps_actual null) earnings row is excluded entirely — never considered for reaction", async () => {
    fakeDb = makeFakeDb({
      earnings: [earningsRow({ eps_actual: null, period_end: "2026-11-18", report_date: "2026-11-18T20:00:00Z" })],
      daily_prices: [priceRow("2026-11-17", 200), priceRow("2026-11-19", 205)],
    });
    dbClientMock.getDbClient.mockReturnValue(fakeDb);
    const { ingestEarningsReaction } = await import("../src/ingestion/ingestEarningsReaction");
    const outcome = await ingestEarningsReaction("company-1");
    expect(outcome.historicalEarningsRows).toBe(0);
    expect(outcome.computed).toBe(0);
    expect(fakeDb.state.calculated_metrics).toHaveLength(0);
  });

  it("a missing prev or next price produces an unavailable outcome with a reason, no row stored, no fallback price used", async () => {
    fakeDb = makeFakeDb({
      earnings: [earningsRow()],
      daily_prices: [priceRow("2026-08-27", 228.0)], // no prev price at all
    });
    dbClientMock.getDbClient.mockReturnValue(fakeDb);
    const { ingestEarningsReaction } = await import("../src/ingestion/ingestEarningsReaction");
    const outcome = await ingestEarningsReaction("company-1");

    expect(outcome.computed).toBe(1);
    expect(outcome.stored).toBe(0);
    expect(outcome.unavailable).toBe(1);
    expect(outcome.unavailableReasons).toHaveLength(1);
    expect(outcome.unavailableReasons[0]!.reason).toContain("before report_date");
    expect(fakeDb.state.calculated_metrics).toHaveLength(0);
  });
});

describe("ingestEarningsReaction — idempotency / no duplicate rows", () => {
  it("re-running for the same company produces zero new calculated_metrics rows, same stored count", async () => {
    fakeDb = makeFakeDb({
      earnings: [earningsRow()],
      daily_prices: [priceRow("2026-08-25", 213.0), priceRow("2026-08-27", 228.0)],
    });
    dbClientMock.getDbClient.mockReturnValue(fakeDb);
    const { ingestEarningsReaction } = await import("../src/ingestion/ingestEarningsReaction");

    const outcome1 = await ingestEarningsReaction("company-1");
    expect(outcome1.stored).toBe(1);
    const after1 = fakeDb.state.calculated_metrics.length;

    const outcome2 = await ingestEarningsReaction("company-1");
    expect(fakeDb.state.calculated_metrics).toHaveLength(after1);
    expect(outcome2.stored).toBe(0);
    expect(outcome2.skippedExisting).toBe(1);
  });
});
