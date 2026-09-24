import { describe, it, expect } from "vitest";
import { SNAPSHOT_META } from "./fixtures";

// Milestone 16B (1d): the snapshot banner must be able to say exactly how
// stale realDemoSnapshot.json is. SNAPSHOT_META is derived from the
// snapshot's own contents (never hand-typed), so this test also catches a
// snapshot regeneration that silently changes shape.
describe("SNAPSHOT_META", () => {
  it("exposes a real ISO timestamp from the snapshot's own generatedAt field", () => {
    expect(SNAPSHOT_META.generatedAt).toBeTruthy();
    expect(new Date(SNAPSHOT_META.generatedAt).toString()).not.toBe("Invalid Date");
  });

  it("derives a single calculation_version when every company's snapshot score shares one (current real state: v1.1)", () => {
    expect(SNAPSHOT_META.calculationVersion).toBe("v1.1");
  });
});
