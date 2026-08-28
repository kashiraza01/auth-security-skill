/**
 * Per-account failed-login throttling. HARDENED stack only.
 *
 * In-memory on purpose — a real deployment would use Redis so the counter is
 * shared across instances, but the lab runs one process and the semantics are
 * identical. This is deliberately separate from the IP-based express-rate-limit
 * on the route: rate-limit slows a noisy source, lockout protects a targeted
 * account even from a distributed source.
 */

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000; // failures older than this don't count
const LOCK_MS = 15 * 60 * 1000; // how long a locked account stays locked

interface Entry {
  failures: number[]; // timestamps
  lockedUntil: number | null;
}

const table = new Map<string, Entry>();

function key(email: string): string {
  return email.trim().toLowerCase();
}

export function isLocked(email: string): { locked: boolean; retryAfterSec: number } {
  const e = table.get(key(email));
  if (!e || !e.lockedUntil) return { locked: false, retryAfterSec: 0 };
  if (Date.now() >= e.lockedUntil) {
    e.lockedUntil = null;
    e.failures = [];
    return { locked: false, retryAfterSec: 0 };
  }
  return { locked: true, retryAfterSec: Math.ceil((e.lockedUntil - Date.now()) / 1000) };
}

/** Call on a failed attempt. Returns whether this failure just triggered a lock. */
export function recordFailure(email: string): { nowLocked: boolean } {
  const k = key(email);
  const e = table.get(k) ?? { failures: [], lockedUntil: null };
  const cutoff = Date.now() - WINDOW_MS;
  e.failures = e.failures.filter((t) => t > cutoff);
  e.failures.push(Date.now());
  let nowLocked = false;
  if (e.failures.length >= MAX_FAILURES) {
    e.lockedUntil = Date.now() + LOCK_MS;
    nowLocked = true;
  }
  table.set(k, e);
  return { nowLocked };
}

/** Call on a successful login. */
export function recordSuccess(email: string): void {
  table.delete(key(email));
}

/** Test / lab helper. */
export function _resetLockouts(): void {
  table.clear();
}

export const LOCKOUT_POLICY = { MAX_FAILURES, WINDOW_MS, LOCK_MS };
