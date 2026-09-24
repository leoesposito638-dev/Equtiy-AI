import { describe, it, expect } from "vitest";
import { NAV_SECTIONS } from "./Nav";

describe("NAV_SECTIONS (Milestone 16C item 5)", () => {
  it("groups into exactly RESEARCH, PORTFOLIO, MONITORING — no SETTINGS", () => {
    expect(NAV_SECTIONS.map((s) => s.label)).toEqual(["RESEARCH", "PORTFOLIO", "MONITORING"]);
  });

  it("RESEARCH contains Dashboard and Discover", () => {
    const research = NAV_SECTIONS.find((s) => s.label === "RESEARCH")!;
    expect(research.items.map((i) => i.label)).toEqual(["Dashboard", "Discover"]);
    expect(research.items.map((i) => i.to)).toEqual(["/", "/discover"]);
  });

  it("PORTFOLIO contains exactly My Companies", () => {
    const portfolio = NAV_SECTIONS.find((s) => s.label === "PORTFOLIO")!;
    expect(portfolio.items.map((i) => i.label)).toEqual(["My Companies"]);
    expect(portfolio.items.map((i) => i.to)).toEqual(["/companies"]);
  });

  it("MONITORING contains exactly Alerts", () => {
    const monitoring = NAV_SECTIONS.find((s) => s.label === "MONITORING")!;
    expect(monitoring.items.map((i) => i.label)).toEqual(["Alerts"]);
    expect(monitoring.items.map((i) => i.to)).toEqual(["/alerts"]);
  });

  it("every route matches an actual route registered in App.tsx", () => {
    const allRoutes = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.to));
    expect(allRoutes.sort()).toEqual(["/", "/alerts", "/companies", "/discover"]);
  });
});
