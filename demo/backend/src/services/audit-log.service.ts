/**
 * Security event logging.
 *
 * BASELINE  — logs the whole request body on a failed login. That body contains
 *             the plaintext password, so every failed attempt writes a credential
 *             to disk / stdout.
 *
 * HARDENED  — logs a fixed set of non-sensitive fields. No password, ever. Email
 *             is truncated. This is what a real audit trail should look like.
 */

type BaselineEvent = {
  event: string;
  [k: string]: unknown;
};

export function baselineLog(event: BaselineEvent): void {
  // eslint-disable-next-line no-console
  console.log(`[baseline-audit] ${event.event}`, JSON.stringify(event));
}

type HardenedEvent =
  | { event: "login_succeeded"; userId: string; ip: string }
  | { event: "login_failed"; emailFragment: string; ip: string; reason: string }
  | { event: "register_succeeded"; userId: string; ip: string }
  | { event: "logout"; userId: string; jti: string }
  | { event: "logout_all"; userId: string; revoked: number }
  | { event: "password_changed"; userId: string; sessionsRevoked: number }
  | { event: "account_locked"; emailFragment: string; ip: string }
  | { event: "rate_limited"; ip: string; path: string };

export function hardenedLog(event: HardenedEvent): void {
  // eslint-disable-next-line no-console
  console.log(`[audit] ${event.event}`, JSON.stringify(event));
}

/** "alice@example.com" -> "al***@example.com" */
export function maskEmail(email: unknown): string {
  if (typeof email !== "string" || !email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}
