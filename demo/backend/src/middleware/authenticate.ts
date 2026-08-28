import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http";
import { baselineVerifyAccess } from "../services/token.service";
import { hardenedVerifyAccess } from "../services/token.service";
import { isSessionActive } from "../services/session.service";
import { User } from "../models/User";

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  return h.slice(7).trim();
}

/**
 * BASELINE authenticate.
 *  - verifies the JWT with no algorithm pin and the (possibly fallback) secret
 *  - copies role + permissions straight out of the token onto req.auth
 *  - no check that the session/token was ever revoked
 */
export function baselineAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = bearer(req);
  if (!token) {
    next(new HttpError(401, "Missing token"));
    return;
  }
  try {
    const claims = baselineVerifyAccess(token);
    req.auth = {
      userId: String(claims.sub),
      tokenRole: claims.role,
      tokenPermissions: claims.permissions ?? [],
    };
    next();
  } catch (err) {
    // Baseline even leaks *why* verification failed.
    next(new HttpError(401, `Invalid token: ${(err as Error).message}`));
  }
}

/**
 * HARDENED authenticate.
 *  - HS256 pinned, issuer + audience checked (inside hardenedVerifyAccess)
 *  - the jti must map to an active server-side Session
 *  - the token's tokenVersion must still match the user's current tokenVersion
 *  - identity only on req.auth; role is resolved later, from the DB
 */
export async function hardenedAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearer(req);
  if (!token) {
    next(new HttpError(401, "Authentication required"));
    return;
  }
  try {
    const claims = hardenedVerifyAccess(token);

    if (!claims.jti || !(await isSessionActive(claims.jti))) {
      next(new HttpError(401, "Session is no longer valid"));
      return;
    }

    const user = await User.findById(claims.sub).lean();
    if (!user || user.tokenVersion !== claims.tokenVersion) {
      next(new HttpError(401, "Session is no longer valid"));
      return;
    }

    req.auth = { userId: String(claims.sub), jti: claims.jti };
    next();
  } catch {
    // Generic — no detail about which check failed.
    next(new HttpError(401, "Authentication required"));
  }
}
