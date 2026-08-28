// ============================================================================
// Equity AI — Minimal auth stubs
// The brief explicitly excludes building real auth in this phase (§23 of
// the prototype brief / not listed as in-scope here either). These stubs
// define the SHAPE the rest of the API expects (req.userId) so routes are
// ready to wire into a real auth provider (Supabase Auth, Clerk, etc.)
// without changing route logic later.
// ============================================================================

import type { Request, Response, NextFunction } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const userId = req.header("x-user-id"); // TODO(production): replace with real session/JWT verification
  if (!userId) return res.status(401).json({ error: "Authentication required." });
  req.userId = userId;
  next();
}
