// ============================================================================
// Tests: inMemoryRepo.ts's GROWTH rule config must not contradict the live
// scoring configuration (schema/004_seed_scoring_config.sql) — Milestone 4A,
// requirement 7. Schema is the source of truth; this pins the demo config to
// it via the public InMemoryStore API (not exported internals) so this test
// would catch any future re-introduction of the mismatch.
// ============================================================================

import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/localDev/inMemoryRepo";

// Mirrors schema/004_seed_scoring_config.sql's GROWTH v1.0 rows exactly.
const SCHEMA_GROWTH_MIN_DATA_POINTS: Record<string, number> = {
  revenue_growth_yoy: 2,
  revenue_cagr_3y: 4,
  eps_growth_yoy: 2,
  eps_cagr: 4,
  growth_acceleration: 3,
};

describe("inMemoryRepo GROWTH rules vs schema/004_seed_scoring_config.sql", () => {
  it("minimum_data_points for every GROWTH rule matches the live schema exactly", async () => {
    const store = new InMemoryStore();
    const repo = store.buildRepoFor("NVDA");
    const rules = await repo.getActiveRules("v1.0");
    const growthRules = rules.filter((r) => Object.keys(SCHEMA_GROWTH_MIN_DATA_POINTS).includes(r.metricName));

    expect(growthRules).toHaveLength(5);
    for (const rule of growthRules) {
      expect(rule.minimumDataPoints).toBe(SCHEMA_GROWTH_MIN_DATA_POINTS[rule.metricName]);
    }
  });

  it("revenue_growth_yoy's single-value demo history (length 1) now correctly fails its own minimum_data_points gate", async () => {
    // This is the concrete, previously-hidden consequence of the fix: the
    // demo's revenue_growth_yoy history has always been length 1
    // (toMetricInputs()'s `single()` helper), which satisfied the old,
    // wrong minPoints=1 default but never should have. Confirms the fix is
    // real, not just a config number matching on paper.
    const store = new InMemoryStore();
    const repo = store.buildRepoFor("NVDA");
    const rules = await repo.getActiveRules("v1.0");
    const rule = rules.find((r) => r.metricName === "revenue_growth_yoy")!;
    const inputs = await repo.getMetricInputs("NVDA", ["revenue_growth_yoy"]);
    const input = inputs.get("revenue_growth_yoy")!;
    const dataPoints = input.history.filter((v) => v !== null).length;
    expect(dataPoints).toBeLessThan(rule.minimumDataPoints);
  });
});
