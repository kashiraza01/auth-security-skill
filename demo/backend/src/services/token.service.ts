import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {
  BASELINE_ACCESS_SECRET,
  BASELINE_REFRESH_SECRET,
  getHardenedSecrets,
  HARDENED_JWT_AUDIENCE,
  HARDENED_JWT_ISSUER,
  env,
} from "../config/env";

export interface BaselineClaims {
  sub: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface HardenedAccessClaims {
  sub: string;
  role: string;
  tokenVersion: number;
  jti: string;
  type: "access";
}

// ---------------------------------------------------------------------------
// BASELINE tokens
//   - 7 day access token (no refresh rotation, no server record)
//   - role + permissions baked into the token and later trusted for authz
//   - signed with a secret that falls back to a constant in the source
//   - verified WITHOUT pinning the algorithm
// ---------------------------------------------------------------------------
export function baselineSignAccess(claims: BaselineClaims): string {
  return jwt.sign(claims, BASELINE_ACCESS_SECRET, { expiresIn: "7d" });
}

export function baselineSignRefresh(claims: Pick<BaselineClaims, "sub">): string {
  // Same secret family, just a longer expiry. Nothing is stored server-side.
  return jwt.sign(claims, BASELINE_REFRESH_SECRET, { expiresIn: "30d" });
}

export function baselineVerifyAccess(token: string): BaselineClaims & jwt.JwtPayload {
  // No `algorithms` option => jsonwebtoken accepts any algorithm compatible with
  // the key type. Combined with the guessable fallback secret this means tokens
  // are trivially forgeable.
  return jwt.verify(token, BASELINE_ACCESS_SECRET) as BaselineClaims & jwt.JwtPayload;
}

// ---------------------------------------------------------------------------
// HARDENED tokens
//   - short-lived access token, opaque-ish (identity only)
//   - jti ties the token to a server-side Session row
//   - tokenVersion lets a password change invalidate everything at once
//   - HS256 pinned on verify, issuer + audience checked
// ---------------------------------------------------------------------------
export function hardenedNewJti(): string {
  return crypto.randomUUID();
}

export function hardenedSignAccess(input: {
  sub: string;
  role: string;
  tokenVersion: number;
  jti: string;
}): string {
  const { access } = getHardenedSecrets();
  const payload: HardenedAccessClaims = { ...input, type: "access" };
  return jwt.sign(payload, access, {
    algorithm: "HS256",
    expiresIn: env.hardenedAccessTtl,
    issuer: HARDENED_JWT_ISSUER,
    audience: HARDENED_JWT_AUDIENCE,
  });
}

export function hardenedSignRefresh(input: { sub: string; jti: string; tokenVersion: number }): string {
  const { refresh } = getHardenedSecrets();
  return jwt.sign({ ...input, type: "refresh" }, refresh, {
    algorithm: "HS256",
    expiresIn: env.hardenedRefreshTtl,
    issuer: HARDENED_JWT_ISSUER,
    audience: HARDENED_JWT_AUDIENCE,
  });
}

export function hardenedVerifyAccess(token: string): HardenedAccessClaims & jwt.JwtPayload {
  const { access } = getHardenedSecrets();
  const decoded = jwt.verify(token, access, {
    algorithms: ["HS256"],
    issuer: HARDENED_JWT_ISSUER,
    audience: HARDENED_JWT_AUDIENCE,
  }) as HardenedAccessClaims & jwt.JwtPayload;
  if (decoded.type !== "access") throw new Error("wrong token type");
  return decoded;
}

export function hardenedVerifyRefresh(token: string): jwt.JwtPayload & {
  sub: string;
  jti: string;
  tokenVersion: number;
  type: string;
} {
  const { refresh } = getHardenedSecrets();
  const decoded = jwt.verify(token, refresh, {
    algorithms: ["HS256"],
    issuer: HARDENED_JWT_ISSUER,
    audience: HARDENED_JWT_AUDIENCE,
  }) as jwt.JwtPayload & { sub: string; jti: string; tokenVersion: number; type: string };
  if (decoded.type !== "refresh") throw new Error("wrong token type");
  return decoded;
}
