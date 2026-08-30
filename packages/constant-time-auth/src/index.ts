import crypto from "node:crypto";

/**
 * constant-time-auth
 * ------------------
 * Equalise the *computational work* of a credential check whether or not the
 * account exists, so login response time is not an account-existence oracle.
 *
 * What this is:  a small wrapper that guarantees exactly one password-hash
 *               verification runs on every call — against the real stored hash if
 *               you have one, against a fixed dummy hash of the same shape if you
 *               do not.
 *
 * What this is NOT:  a random-sleep timer. A fixed or random `sleep()` does not
 *               equalise the distributions (the real work still varies with hash
 *               cost and load) and is removable with enough samples. Jitter is
 *               offered here only as labelled defence-in-depth on top of the
 *               constant-work path, never as the mitigation.
 *
 * Residual risk:  the surrounding work (the user lookup, JSON parsing) still
 *               differs slightly between the two branches, and the hash function's
 *               own runtime has variance. This reduces the signal by orders of
 *               magnitude; it does not zero it. Pair it with a generic error
 *               response and rate limiting / lockout.
 */

export interface Hasher {
  /** produce a hash for `password` (used once, to build the dummy hash) */
  hash(password: string): Promise<string>;
  /** verify `password` against `storedHash`; must not throw on a bad hash */
  verify(storedHash: string, password: string): Promise<boolean>;
}

export interface JitterOptions {
  /**
   * Add a uniform random delay in [0, maxMs] AFTER the verify. Defence-in-depth
   * only — documented, opt-in, and never a substitute for the constant-work path.
   * Costs latency on every call; keep it small (a few ms) if you use it at all.
   */
  maxMs: number;
}

export interface CreateVerifierOptions {
  hasher: Hasher;
  /**
   * A precomputed dummy hash, same algorithm + parameters as your real hashes.
   * If omitted, one is generated lazily from `hasher.hash(<random>)` on first use
   * (or eagerly via `warmup()`).
   */
  dummyHash?: string;
  jitter?: JitterOptions | false;
}

export interface ConstantTimeVerifier {
  /**
   * Verify `password`. Runs exactly one `hasher.verify(...)` regardless of
   * whether `storedHash` is a real hash or null/undefined.
   *
   * Returns `true` only when `storedHash` is a real hash AND the password
   * matches. Never reveals which condition failed.
   */
  verify(storedHash: string | null | undefined, password: string): Promise<boolean>;
  /** Precompute the dummy hash so the first real call is not slower. */
  warmup(): Promise<void>;
  /** The dummy hash in use (after warmup / first call). */
  getDummyHash(): string | undefined;
}

export function createConstantTimeVerifier(opts: CreateVerifierOptions): ConstantTimeVerifier {
  const { hasher } = opts;
  let dummyHash: string | undefined = opts.dummyHash;
  let dummyPromise: Promise<string> | undefined;

  const jitterMax = opts.jitter ? opts.jitter.maxMs : 0;

  async function ensureDummy(): Promise<string> {
    if (dummyHash) return dummyHash;
    if (!dummyPromise) {
      const seed = "constant-time-auth::" + crypto.randomBytes(24).toString("hex");
      dummyPromise = hasher.hash(seed).then((h) => {
        dummyHash = h;
        return h;
      });
    }
    return dummyPromise;
  }

  async function maybeJitter(): Promise<void> {
    if (jitterMax <= 0) return;
    const ms = crypto.randomInt(0, Math.max(1, Math.floor(jitterMax) + 1));
    await new Promise((r) => setTimeout(r, ms));
  }

  return {
    async verify(storedHash, password): Promise<boolean> {
      const real = typeof storedHash === "string" && storedHash.length > 0;
      const hashToCheck = real ? (storedHash as string) : await ensureDummy();

      let matched = false;
      try {
        matched = await hasher.verify(hashToCheck, password);
      } catch {
        matched = false;
      }

      await maybeJitter();
      // `real && matched` — a dummy-hash "match" (astronomically unlikely) is
      // still not a real credential.
      return real && matched;
    },

    async warmup(): Promise<void> {
      await ensureDummy();
    },

    getDummyHash(): string | undefined {
      return dummyHash;
    },
  };
}

/**
 * Timing-safe comparison for opaque secrets you store or transmit verbatim —
 * password-reset tokens, email-verification codes, API keys, HMAC digests.
 * Length is compared first (and is not itself secret for fixed-length tokens);
 * the byte comparison is constant-time via crypto.timingSafeEqual.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still burn a comparison so a length mismatch is not faster to detect.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

export const _internal = { note: "see README.md § Security considerations" };
