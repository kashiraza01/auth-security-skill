/**
 * Password hashing for both stacks.
 *
 * BASELINE  — bcrypt (bcryptjs, pure JS) at cost factor 8. Fast, and because it
 *             is pure-JS it runs on the main event loop with very consistent
 *             timing — which makes the login timing side-channel easy to measure.
 *
 * HARDENED  — Argon2id with OWASP-recommended parameters. Crucially, the hardened
 *             login path ALWAYS runs one verify() — against the real hash if the
 *             user exists, against a fixed dummy hash if not — so an unknown email
 *             and a known email cost the same. See constant-time-auth in packages/.
 */

import bcrypt from "bcryptjs";
import { Algorithm, hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

const BASELINE_BCRYPT_COST = 8;

// OWASP Argon2id: m=19456 KiB, t=2, p=1
const ARGON2_OPTS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Precomputed once at module load: a valid Argon2id hash of a random string.
 *  Used as the comparison target when the account does not exist. */
let dummyArgon2Hash: string | null = null;
export async function getDummyArgon2Hash(): Promise<string> {
  if (!dummyArgon2Hash) {
    dummyArgon2Hash = await argon2Hash(
      "constant-work-placeholder-" + Math.random().toString(36),
      ARGON2_OPTS,
    );
  }
  return dummyArgon2Hash;
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------
export async function baselineHash(password: string): Promise<string> {
  return bcrypt.hash(password, BASELINE_BCRYPT_COST);
}

export async function baselineCompare(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// Hardened
// ---------------------------------------------------------------------------
export async function hardenedHash(password: string): Promise<string> {
  return argon2Hash(password, ARGON2_OPTS);
}

export async function hardenedVerify(hash: string, password: string): Promise<boolean> {
  try {
    // verify() reads the cost parameters from the PHC hash string itself.
    return await argon2Verify(hash, password);
  } catch {
    return false;
  }
}

export const HASH_PARAMS = {
  baseline: { algo: "bcrypt", cost: BASELINE_BCRYPT_COST },
  hardened: { algo: "argon2id", ...ARGON2_OPTS },
} as const;
