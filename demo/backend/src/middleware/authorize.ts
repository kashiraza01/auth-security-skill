import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http";
import { User } from "../models/User";

/**
 * BASELINE authorize — trusts the token.
 *
 * The role check reads `req.auth.tokenRole`, which the baseline authenticate
 * middleware copied verbatim from the JWT. Nothing re-validates it against the
 * database. So:
 *   - registering with { "role": "admin" } is enough, and
 *   - forging / editing a token (the fallback secret is in the source) is enough.
 */
export function baselineRequireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.tokenRole === "admin") {
    next();
    return;
  }
  next(new HttpError(403, `Admin only (your role: ${req.auth?.tokenRole ?? "none"})`));
}

/**
 * HARDENED authorize — trusts the database.
 *
 * The token proves *who* you are (identity), nothing more. The authorization
 * decision is made here, from the persisted user record, every request.
 */
export function hardenedRequireRole(role: "admin" | "user") {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = req.auth?.userId;
    if (!userId) {
      next(new HttpError(401, "Authentication required"));
      return;
    }
    const user = await User.findById(userId).select("role").lean();
    if (!user) {
      next(new HttpError(401, "Authentication required"));
      return;
    }
    if (role === "admin" && user.role !== "admin") {
      next(new HttpError(403, "Forbidden"));
      return;
    }
    next();
  };
}
