// ============================================================================
// Equity AI — Company identity (Milestone 16C, item 2). No external logo
// assets this milestone (no hosting/licensing decision made yet) — a
// deterministic initials avatar instead, matching Prototype 1.2's own
// CompanyLogo approach (docs/prototypes/prototype-1.2/
// equity-ai-prototype-1.2.jsx, single-letter initial + a solid color box).
// ============================================================================

/** A small, fixed, deterministically-indexed palette — never random, so the
 * same company always gets the same color across renders/sessions/devices. */
export const AVATAR_PALETTE = [
  "#2F5F8F", // slate blue
  "#7A4FB5", // violet
  "#B5544F", // brick
  "#4F8F6B", // sea green
  "#B5834F", // amber brown
  "#4F7AB5", // sky blue
  "#8F4F7A", // plum
  "#5F8F4F", // olive
] as const;

/** Company names beginning with a leading "The " (e.g. "The Charles Schwab
 * Corporation", "The Walt Disney Company") would otherwise all collapse to
 * the same uninformative "T" initial — stripped before taking the first
 * letter, same convention many avatar systems use for this exact reason. */
export function avatarInitial(name: string): string {
  const trimmed = name.trim().replace(/^the\s+/i, "");
  const source = trimmed.length > 0 ? trimmed : name.trim();
  return (source[0] ?? "?").toUpperCase();
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Keyed on ticker (stable and unique per company, unlike name which can
 * collide in principle) so the same company always lands on the same
 * palette entry. */
export function avatarColor(ticker: string): string {
  const index = hashString(ticker) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index]!;
}

/** For the companies with no real description (everyone outside the 16
 * FMP-entitled companies — see ingestCompanyDescriptions.ts): a single
 * deterministic sentence built ONLY from real stored fields (sector,
 * industry), never invented copy. Returns null — never a half-built
 * sentence — when either field is missing, so the caller can fall back to
 * showing nothing rather than "A company in ." or similar. */
export function fallbackDescription(sector: string | null | undefined, industry: string | null | undefined): string | null {
  if (!sector || !industry) return null;
  return `A ${sector} company in ${industry}.`;
}
