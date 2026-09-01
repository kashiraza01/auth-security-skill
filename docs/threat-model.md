# Threat model

What this lab **is** designed to demonstrate and defend against, and — just as important —
what it is **not**.

## What the lab is

An educational comparison of an ordinary MERN authentication implementation against a
hardened one, plus two reusable Claude Code skills that audit and harden auth code. It runs
locally against an in-memory database. It is not a product and not a deployment.

## Assets (in the demo's world)

| Asset | Why it matters |
|---|---|
| User credentials (email + password) | account takeover |
| Session / access tokens | impersonation without the password |
| Role / permission assignment | privilege escalation |
| The set of registered email addresses | targeting list for stuffing / phishing |
| Server implementation detail (framework, versions, schema) | reconnaissance |

## Actors the hardened stack is built against

- **Unauthenticated attacker** hitting the auth endpoints directly: enumeration (timing +
  message + registration + NoSQL-operator input), online password guessing / credential
  stuffing, token forgery with a guessed/known secret, unsigned claim tampering, CORS abuse
  from a malicious origin.
- **Authenticated low-privilege user** trying to escalate: role-from-registration, editing
  or re-signing their own token, reaching an admin route.
- **Holder of a stolen token or refresh token**: using it after logout, after a password
  change, or replaying a rotated refresh token.

## Threats addressed → control

| Threat | Control in the hardened stack |
|---|---|
| User enumeration by response timing | constant-work login (dummy-hash verify) |
| User enumeration by error message / status | one generic `401` for every failed login |
| User enumeration at registration | neutral `202` response |
| NoSQL operator injection in the identifier | zod schema — `email` must be a string |
| Online password guessing | IP rate limit + per-account lockout (5 / 15 min) |
| Weak password storage | Argon2id (OWASP params); min-12 policy |
| Token forgery | required strong secret, separate access/refresh, `algorithms:['HS256']`, `iss`/`aud` |
| Privilege escalation via a claim | authorization is a DB lookup; `role` never from client input |
| Token valid after logout | `jti` ↔ `Session`, revoked on logout |
| Token valid after password change | `tokenVersion` bump + revoke-all |
| Refresh token replay | rotation + reuse detection (family wipe) |
| Session token stolen via XSS | refresh token `HttpOnly`; access token not in a cookie |
| Cross-site credentialed requests | `SameSite=Strict` refresh cookie; strict CORS allowlist |
| Recon via error bodies | generic errors in production + correlation id |
| Credentials in logs | redacted audit logging |
| Missing security headers | `helmet` |

## What the lab does NOT defend against / is out of scope

- **XSS, CSRF token endpoints, SQL/NoSQL injection elsewhere in an app.** The demo has one
  concern — authentication. `SameSite=Strict` + bearer-token access happens to neutralise
  classic CSRF here, but the lab is not a CSRF lab.
- **Network-level attacks:** TLS configuration, MITM, DNS. Run behind TLS in production
  (`secure` cookies switch on when `NODE_ENV=production`).
- **Infrastructure & secrets management:** secret rotation, a vault, key compromise, a
  compromised database, a malicious admin. The hardened stack limits blast radius
  (`tokenVersion`, session revocation) but assumes the datastore and the secret are
  trustworthy.
- **Distributed / high-volume attacks:** the auditor is explicitly low-volume and
  single-IP. Finding exact rate-limit thresholds, or mounting a real distributed
  brute-force, is a different exercise.
- **Timing attacks to the theoretical limit:** constant work reduces the login timing
  signal by orders of magnitude; it does not eliminate it (the user lookup and hash variance
  remain). See `hardening.md` #1 and `packages/constant-time-auth` § Security considerations.
- **Account recovery / password reset:** the demo has no reset flow. A real one is its own
  enumeration and token-handling surface.
- **MFA, device binding, risk-based auth, anomaly detection:** not modelled.
- **Denial of service**, including the DoS-against-one-account that per-account lockout
  introduces (bounded by the 15-minute window).
- **Supply-chain / dependency compromise.** Dependencies are version-constrained but not
  audited here.

## Responsible use

The `auth-security-breaker` skill and `demo/security-tests` are for **systems you own or are
explicitly authorised to test**. They default to `localhost` / `127.0.0.1` / `::1`, refuse a
target described as production, refuse `NODE_ENV=production`, and require an explicit
`AUTH_LAB_ALLOW_TARGET` allowlist entry for anything else. They perform no destructive
actions and no persistence. Do not point them at infrastructure you do not control.
