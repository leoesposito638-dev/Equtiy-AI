// ============================================================================
// Design tokens — same visual identity established in the V1 prototype.
// Kept as one source of truth so every component pulls from here rather
// than re-declaring colors.
// ============================================================================

export const C = {
  bg: "#F4F5F7",
  surface: "#FFFFFF",
  surfaceSunken: "#FAFAFB",
  border: "#E6E8EC",
  text: "#15181E",
  textSoft: "#5B6270",
  textFaint: "#9AA1AC",
  accent: "#26314D",
  accentSoft: "#EEF1F6",
  positive: "#1E7A4C",
  positiveSoft: "#E7F4ED",
  negative: "#B3402C",
  negativeSoft: "#FBECE9",
  amber: "#9C7A2E",
  amberSoft: "#F6EFE1",
} as const;

export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const CATEGORY_LABELS: Record<string, string> = {
  GROWTH: "Growth",
  PROFITABILITY: "Profitability",
  FINANCIAL_HEALTH: "Financial Health",
  VALUATION: "Valuation",
  CAPITAL_ALLOCATION: "Capital Allocation",
  COMPETITIVE_ADVANTAGE: "Competitive Advantage",
  MANAGEMENT: "Management",
  EARNINGS_MOMENTUM: "Earnings Momentum",
};
export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

// Milestone 16B: "Improving" was a score-TIER name (65-79) being read as a
// TREND word — a score of 78.4 that fell 0.5 points still said "Improving"
// right next to a down arrow. These are score-level tiers only; whether the
// company is actually improving is a separate, version-aware question (see
// scoreDisplay.ts's isComparableChange()) and is never implied here.
export function statusFor(score: number): "Excellent" | "Strong" | "Fair" | "Weak" {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Strong";
  if (score >= 65) return "Fair";
  return "Weak";
}
export function statusColor(status: string): string {
  if (status === "Excellent" || status === "Strong") return C.positive;
  if (status === "Fair") return C.textSoft;
  return C.negative;
}
export function severityColor(sev: string): string {
  if (sev === "CRITICAL" || sev === "HIGH") return C.negative;
  if (sev === "MEDIUM") return C.amber;
  return C.textSoft;
}
export function severityFromImportance(score: number): "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 85) return "CRITICAL";
  if (score >= 65) return "HIGH";
  if (score >= 45) return "MEDIUM";
  if (score >= 25) return "LOW";
  return "INFO";
}
