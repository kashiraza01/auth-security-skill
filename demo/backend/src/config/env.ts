/**
 * Environment loading for BOTH stacks.
 *
 * The two stacks read config differently on purpose — that difference is itself
 * one of the lessons:
 *
 *   BASELINE  — tolerant. Missing JWT secret? Fall back to a hardcoded string.
 *               Missing CORS origin? Reflect whatever the browser sends.
 *   HARDENED  — strict. Missing or weak secret => refuse to boot.
 */

import fs from "node:fs";
import path from "node:path";

// Minimal .env loader (avoids a dependency; only used for local dev).
function loadDotEnv(): void {
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: (process.env.NODE_ENV ?? "development") === "production",
  mongoUri: process.env.MONGO_URI ?? "",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",

  // Raw secrets — may be undefined. Each stack decides what to do about that.
  //  - JWT_ACCESS_SECRET / JWT_REFRESH_SECRET      -> the BASELINE stack
  //  - HARDENED_JWT_ACCESS_SECRET / ..._REFRESH_.. -> the HARDENED stack
  jwtAccessSecretRaw: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecretRaw: process.env.JWT_REFRESH_SECRET,
  hardenedAccessSecretRaw: process.env.HARDENED_JWT_ACCESS_SECRET,
  hardenedRefreshSecretRaw: process.env.HARDENED_JWT_REFRESH_SECRET,

  hardenedAccessTtl: Number(process.env.HARDENED_ACCESS_TTL ?? 900), // 15 min
  hardenedRefreshTtl: Number(process.env.HARDENED_REFRESH_TTL ?? 1_209_600), // 14 days
};

/**
 * BASELINE secret resolution — the anti-pattern.
 * If the operator forgot to set a secret, the app still "works" by signing with a
 * constant that lives in this file. Anyone reading the source can forge tokens.
 * And the refresh secret falls back to the access secret — one key for both.
 */
export const BASELINE_ACCESS_SECRET = env.jwtAccessSecretRaw || "dev-secret";
export const BASELINE_REFRESH_SECRET =
  env.jwtRefreshSecretRaw || env.jwtAccessSecretRaw || "dev-secret";

/**
 * HARDENED secret resolution — fail closed. Its own dedicated variables so that
 * setting them (via `npm run generate:secrets`) fixes the hardened stack without
 * silently also fixing the baseline — the baseline's weak-default behaviour is a
 * finding we want to keep demonstrable.
 */
export function getHardenedSecrets(): { access: string; refresh: string } {
  const access = env.hardenedAccessSecretRaw;
  const refresh = env.hardenedRefreshSecretRaw;
  if (!access || !refresh) {
    throw new Error(
      "[hardened] HARDENED_JWT_ACCESS_SECRET and HARDENED_JWT_REFRESH_SECRET are required. " +
        "Run `npm run generate:secrets`.",
    );
  }
  if (access.length < 32 || refresh.length < 32) {
    throw new Error("[hardened] JWT secrets must be at least 32 characters.");
  }
  if (access === refresh) {
    throw new Error("[hardened] access and refresh secrets must differ.");
  }
  return { access, refresh };
}

export const HARDENED_JWT_ISSUER = "auth-security-skill";
export const HARDENED_JWT_AUDIENCE = "auth-security-skill:web";
