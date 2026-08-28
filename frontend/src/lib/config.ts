// ============================================================================
// Runtime configuration
// ============================================================================

export const API_BASE_URL: string | undefined = import.meta.env.VITE_API_BASE_URL || undefined;
export const DEMO_USER_ID: string = import.meta.env.VITE_DEMO_USER_ID || "demo-user";

/** True whenever there's no backend to actually call — the app runs entirely
 * on fixtures.ts in this mode, and every page surfaces that state visibly
 * rather than silently presenting fixtures as if they were live. */
export const DEMO_MODE = !API_BASE_URL;
