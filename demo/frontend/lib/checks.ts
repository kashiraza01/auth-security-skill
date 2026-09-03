/**
 * The checks shown in the comparison UI. Each maps to a breaker finding id and to
 * the source files that are relevant on each side. Source is fetched live from
 * /api/source (which reads the real files); findings come from a live audit run.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Check {
  /** matches a Finding.id from the auditor */
  findingId: string;
  title: string;
  severity: Severity;
  /** one-line plain description of the weakness */
  blurb: string;
  /** source keys understood by /api/source (see lab.routes.ts SOURCE_ALLOWLIST) */
  baselineSource: string;
  hardenedSource: string;
  /** the fix, in a sentence */
  fix: string;
}

export const CHECKS: Check[] = [
  {
    findingId: "timing-user-enumeration",
    title: "Login timing enumeration",
    severity: "medium",
    blurb:
      "Unknown-account logins return before the password hash runs, so known accounts are measurably slower.",
    baselineSource: "baseline-login",
    hardenedSource: "hardened-login",
    fix: "Constant work — always run one hash verify, against a dummy hash if the user is not found.",
  },
  {
    findingId: "message-user-enumeration",
    title: "Login error message oracle",
    severity: "medium",
    blurb: '"No account found" vs "Incorrect password" — a plain account-existence oracle.',
    baselineSource: "baseline-login",
    hardenedSource: "hardened-login",
    fix: "One identical error for every failed login.",
  },
  {
    findingId: "authz-role-from-registration",
    title: "Role from the registration body",
    severity: "critical",
    blurb: 'Registering with {"role":"admin"} makes you an admin.',
    baselineSource: "baseline-login",
    hardenedSource: "hardened-login",
    fix: "Assign role server-side; never read it from client input.",
  },
  {
    findingId: "authz-token-forgery",
    title: "Token forgery / trusted claims",
    severity: "critical",
    blurb:
      "Authorization reads the role claim from the token; the signing secret falls back to a constant in the source.",
    baselineSource: "baseline-authz",
    hardenedSource: "baseline-authz",
    fix: "Strong required secret, HS256 pinned; authorization is a DB lookup, not a claim.",
  },
  {
    findingId: "no-login-throttling",
    title: "No rate limit or lockout",
    severity: "high",
    blurb: "The login endpoint answers as fast as you can call it, forever.",
    baselineSource: "baseline-routes",
    hardenedSource: "hardened-routes",
    fix: "IP rate limit + per-account lockout after N failures.",
  },
  {
    findingId: "logout-does-not-invalidate-token",
    title: "Logout doesn't end the session",
    severity: "high",
    blurb: "After logout the same token still works — nothing is revoked server-side.",
    baselineSource: "session-service",
    hardenedSource: "session-service",
    fix: "Per-token jti bound to a Session row, revoked on logout.",
  },
  {
    findingId: "refresh-token-reuse",
    title: "Refresh token replay",
    severity: "high",
    blurb: "A rotated refresh token can be presented again and still works.",
    baselineSource: "baseline-login",
    hardenedSource: "hardened-login",
    fix: "Rotate on every use; on replay of a rotated token, wipe the whole family.",
  },
  {
    findingId: "session-cookie-flags",
    title: "JS-readable session cookies",
    severity: "high",
    blurb: "Token cookies lack HttpOnly and SameSite — any XSS lifts the session.",
    baselineSource: "baseline-login",
    hardenedSource: "hardened-login",
    fix: "Refresh token HttpOnly + SameSite=Strict + path-scoped; access token in memory.",
  },
  {
    findingId: "permissive-cors",
    title: "Reflective CORS with credentials",
    severity: "high",
    blurb: "Any Origin is echoed back with Allow-Credentials: true.",
    baselineSource: "baseline-routes",
    hardenedSource: "hardened-routes",
    fix: "Explicit origin allowlist; credentials only for allowlisted origins.",
  },
  {
    findingId: "verbose-error-responses",
    title: "Stack traces in error bodies",
    severity: "medium",
    blurb: "A duplicate registration returns the raw Mongo error and a stack trace.",
    baselineSource: "baseline-login",
    hardenedSource: "hardened-login",
    fix: "Generic body in production; detail logged server-side with a correlation id.",
  },
  {
    findingId: "nosql-operator-in-identifier",
    title: "Query operator in the email field",
    severity: "high",
    blurb: '{"email":{"$ne":null}} reaches the database query.',
    baselineSource: "baseline-login",
    hardenedSource: "hardened-login",
    fix: "Validate the body — email must be a string.",
  },
  {
    findingId: "password-change-does-not-revoke-sessions",
    title: "Password change keeps old tokens alive",
    severity: "high",
    blurb: "Tokens minted before a password change still work afterwards.",
    baselineSource: "hardened-login",
    hardenedSource: "hardened-login",
    fix: "Bump a per-user tokenVersion and revoke all sessions.",
  },
];

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};
