import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../lib/http";
import { User } from "../models/User";
import { Session } from "../models/Session";
import { baselineHash, HASH_PARAMS } from "../services/password.service";
import { _resetLockouts, LOCKOUT_POLICY } from "../services/lockout.service";
import { env, BASELINE_ACCESS_SECRET } from "../config/env";

/**
 * Lab plumbing — not part of the auth surface under test. Reset, seed known
 * fixtures, expose non-secret config, and serve a small allowlist of source
 * files so the comparison UI can render the real code (never a hand-typed copy).
 *
 * Mounted only when LAB_ENDPOINTS !== "off". Never enable in a real deployment.
 */
export const labRouter = Router();

// Files the /source endpoint is allowed to return, relative to the repo root.
// A strict allowlist — no user-controlled path ever touches the filesystem.
const SOURCE_ALLOWLIST: Record<string, string> = {
  "baseline-login": "demo/backend/src/controllers/baseline.auth.controller.ts",
  "hardened-login": "demo/backend/src/controllers/hardened.auth.controller.ts",
  "baseline-authn": "demo/backend/src/middleware/authenticate.ts",
  "baseline-authz": "demo/backend/src/middleware/authorize.ts",
  "token-service": "demo/backend/src/services/token.service.ts",
  "password-service": "demo/backend/src/services/password.service.ts",
  "session-service": "demo/backend/src/services/session.service.ts",
  "baseline-routes": "demo/backend/src/routes/baseline.routes.ts",
  "hardened-routes": "demo/backend/src/routes/hardened.routes.ts",
};

const REPO_ROOT = path.resolve(__dirname, "../../../..");

labRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    res.json({
      status: "ok",
      db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      env: env.nodeEnv,
    });
  }),
);

labRouter.get(
  "/_lab/config",
  asyncHandler(async (_req, res) => {
    res.json({
      hashParams: HASH_PARAMS,
      lockoutPolicy: LOCKOUT_POLICY,
      hardenedAccessTtl: env.hardenedAccessTtl,
      hardenedRefreshTtl: env.hardenedRefreshTtl,
      // The single most important config fact for the token-forgery finding:
      jwtAccessSecretIsDefault: BASELINE_ACCESS_SECRET === "dev-secret",
    });
  }),
);

labRouter.get(
  "/_lab/source",
  asyncHandler(async (req, res) => {
    const key = String(req.query.file ?? "");
    const rel = SOURCE_ALLOWLIST[key];
    if (!rel) {
      res.status(404).json({ error: "unknown source key", available: Object.keys(SOURCE_ALLOWLIST) });
      return;
    }
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      res.status(404).json({ error: "source file missing on disk", rel });
      return;
    }
    res.json({ key, path: rel, content: fs.readFileSync(abs, "utf8") });
  }),
);

labRouter.post(
  "/_lab/reset",
  asyncHandler(async (_req, res) => {
    await User.deleteMany({});
    await Session.deleteMany({});
    _resetLockouts();
    res.json({ ok: true });
  }),
);

/**
 * Clear only the per-account lockout counters — no data wipe. The timing probe
 * calls this between samples so it measures the credential-verification path
 * itself, not a fast "account locked" rejection. (The bruteforce probe does NOT
 * call it — it wants to observe the lockout.)
 */
labRouter.post(
  "/_lab/reset-lockouts",
  asyncHandler(async (_req, res) => {
    _resetLockouts();
    res.json({ ok: true });
  }),
);

/**
 * Seed a deterministic set of accounts for quick manual poking.
 *
 * These are hashed the way the BASELINE stack hashes (bcrypt), so they log in
 * against /api/baseline/auth/login directly. To exercise the HARDENED stack,
 * register fresh accounts via POST /api/hardened/auth/register — that keeps the
 * hardened login's constant-work path all-Argon2id, which is what the timing
 * probe measures.
 */
labRouter.post(
  "/_lab/seed",
  asyncHandler(async (_req, res) => {
    await User.deleteMany({});
    await Session.deleteMany({});
    _resetLockouts();

    const fixtures = [
      { email: "alice@aegis.test", password: "correct horse battery staple", role: "user" as const },
      { email: "bob@aegis.test", password: "another-l0ng-passphrase-here", role: "user" as const },
      { email: "root@aegis.test", password: "s3ed-admin-passphrase-9021!", role: "admin" as const },
    ];

    for (const f of fixtures) {
      await User.create({
        email: f.email,
        passwordHash: await baselineHash(f.password),
        hashAlgo: "bcrypt",
        role: f.role,
        permissions: f.role === "admin" ? ["users:read", "users:write"] : [],
        createdVia: "seed",
      });
    }

    res.json({
      ok: true,
      note: "bcrypt-hashed — use with /api/baseline/auth/login. For /hardened, register your own.",
      fixtures: fixtures.map((f) => ({ email: f.email, password: f.password, role: f.role })),
      knownAbsentEmail: "nobody-" + Date.now() + "@aegis.test",
    });
  }),
);
