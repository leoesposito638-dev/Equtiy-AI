import { describe, it, expect } from "vitest";
import { GLOSSARY, GLOSSARY_ALIASES } from "./glossary";
import { GROWTH_METRIC_LABELS } from "./growthMetrics";
import { VALUATION_METRIC_LABELS } from "./valuationMetrics";

describe("GLOSSARY_ALIASES", () => {
  it("every alias points to a real glossary entry — no dangling key", () => {
    for (const [label, key] of Object.entries(GLOSSARY_ALIASES)) {
      expect(GLOSSARY[key], `alias "${label}" -> "${key}" has no GLOSSARY entry`).toBeDefined();
    }
  });

  it("resolves every real Growth Metrics label used on the Company page", () => {
    for (const label of Object.values(GROWTH_METRIC_LABELS)) {
      expect(GLOSSARY_ALIASES[label], `no alias for Growth Metrics label "${label}"`).toBeDefined();
    }
  });

  it("resolves every real Valuation label used on the Company page", () => {
    for (const label of Object.values(VALUATION_METRIC_LABELS)) {
      expect(GLOSSARY_ALIASES[label], `no alias for Valuation label "${label}"`).toBeDefined();
    }
  });

  it("resolves the Key Financials labels that have a real glossary term", () => {
    for (const label of ["Revenue", "EPS", "Net Margin", "Operating Margin", "ROE", "Free Cash Flow", "FCF Margin"]) {
      expect(GLOSSARY_ALIASES[label]).toBeDefined();
    }
  });

  it('never tooltips an ordinary, non-financial-terminology word (the prototype\'s own rule)', () => {
    for (const word of ["Overview", "Follow", "Back", "Analyze", "Search", "Alerts"]) {
      expect(GLOSSARY_ALIASES[word]).toBeUndefined();
    }
  });

  it("every GLOSSARY entry has non-empty term/whatIsIt/whyItMatters text", () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.term.length, `${key}.term is empty`).toBeGreaterThan(0);
      expect(entry.whatIsIt.length, `${key}.whatIsIt is empty`).toBeGreaterThan(0);
      expect(entry.whyItMatters.length, `${key}.whyItMatters is empty`).toBeGreaterThan(0);
    }
  });
});
