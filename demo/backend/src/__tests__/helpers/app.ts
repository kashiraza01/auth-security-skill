import type { Express } from "express";

/**
 * Build the app with strong JWT secrets in the environment so the hardened stack
 * can boot inside tests. Call before importing anything that reads config.
 */
export function withTestSecrets(): void {
  // Only the hardened stack's dedicated secrets are set. JWT_ACCESS_SECRET is
  // left unset on purpose so the baseline tests exercise its weak-default path,
  // exactly as the audit does.
  process.env.HARDENED_JWT_ACCESS_SECRET =
    process.env.HARDENED_JWT_ACCESS_SECRET ?? "test-hardened-access-secret-".padEnd(48, "x");
  process.env.HARDENED_JWT_REFRESH_SECRET =
    process.env.HARDENED_JWT_REFRESH_SECRET ?? "test-hardened-refresh-secret-".padEnd(48, "y");
  process.env.NODE_ENV = "test";
  process.env.HARDENED_ACCESS_TTL = process.env.HARDENED_ACCESS_TTL ?? "2"; // 2s so expiry tests are fast
}

export async function buildApp(): Promise<Express> {
  withTestSecrets();
  const { createApp } = await import("../../app");
  return createApp();
}
