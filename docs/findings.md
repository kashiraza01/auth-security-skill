# Findings — baseline audit

Produced by `npm run audit` (`demo/security-tests/`) against `demo/backend`'s
`/api/baseline/auth/*` on Node v24.20.0 / win32 x64, local HTTP. Regenerate any time — the
JSON form is `docs/findings.json` (git-ignored; contains machine-specific paths in evidence).

**12 CONFIRMED on the baseline stack. 0 CONFIRMED on the hardened stack.** Every baseline
CONFIRMED returns NOT_DETECTED when the same probe runs against `/api/hardened/auth/*`.

Verdicts: **CONFIRMED** (reproduced, a fix must address it) · **SUSPECTED** (signal, not
conclusive) · **INFORMATIONAL** (noted, not a vuln alone) · **NOT_DETECTED** (probe ran,
absent).

---

## CONFIRMED — baseline

### 1. `authz-role-from-registration` — critical
An account registered with `{"role":"admin"}` in the body calls `GET /api/baseline/admin/users`
and receives **200**. The server persisted a privilege level the client chose.
*Impact:* full privilege escalation, no exploit required. *Fix:* assign role server-side; never
read it from the registration body.

### 2. `authz-token-forgery` — critical
`JWT_ACCESS_SECRET` is unset, so the baseline signs with the hardcoded fallback `"dev-secret"`.
A token re-signed with `"dev-secret"` and `role: "admin"` is accepted at the admin route (**200**).
*Impact:* anyone who reads the source mints admin tokens. *Fix:* require a strong secret from
config, fail to boot without it, separate access/refresh secrets, pin `algorithms` on verify.

### 3. `logout-does-not-invalidate-token` — high
After `POST /logout`, the same bearer token still returns **200** from `/me`. Logout only
clears the client cookie; the 7-day token stays valid. *Fix:* per-token `jti` bound to a
server-side session, revoked on logout.

### 4. `no-login-throttling` — high
12 rapid wrong-password attempts on one account: `401 ×12`, never a `429`, never a lockout.
Nothing slows online password guessing or credential stuffing. *Fix:* IP rate limit **and**
per-account lockout.

### 5. `nosql-operator-in-email` — high
Body `{"email": {"$ne": null}, "password": "…"}` makes `User.findOne({ email })` match an
existing user — the response is the "known account, wrong password" branch
(`401 "Incorrect password"`), not the "unknown account" branch. The operator reached the
query. *Fix:* validate the body against a schema so `email` must be a string.

### 6. `password-change-does-not-revoke-sessions` — high
Password changed via `/change-password` (which also never asks for the current password);
a token minted before the change still returns **200** at `/me`. A stolen token survives the
user's response to a compromise. *Fix:* bump a per-user `tokenVersion` and revoke all
sessions on password change.

### 7. `permissive-cors` — high
`Origin: https://evil.example` is echoed in `Access-Control-Allow-Origin` **and**
`Access-Control-Allow-Credentials: true`. Any site a logged-in user visits can drive this API
as them. *Fix:* explicit origin allowlist; credentials only for allowlisted origins.

### 8. `refresh-token-reuse` — high
After a successful refresh (rotation), presenting the **old** refresh token again still
returns **200**. No rotation / reuse detection — a stolen refresh token is durable. *Fix:*
rotate on every use, store the `jti`, and on replay of a rotated token revoke the whole
family.

### 9. `session-cookie-flags` — high
`access_token` and `refresh_token` cookies are set **without `HttpOnly`** and **without
`SameSite`**. Any XSS on the origin reads the session; missing `SameSite` allows cross-site
use. *Fix:* refresh token in `HttpOnly` + `SameSite=Strict` + path-scoped cookie; access
token in the response body only.

### 10. `message-user-enumeration` — medium
`login` returns `401 "No account found with that email address"` for an unknown email and
`401 "Incorrect password"` for a known email with a wrong password. A direct account-existence
oracle, no timing needed. *Fix:* one identical response for every failed login.

### 11. `timing-user-enumeration` — medium
| cohort | n | median | p95 |
|---|---|---|---|
| unknown account | 60 | **18.5 ms** | 20.1 ms |
| known account, wrong password | 60 | **38.3 ms** | 42.4 ms |

Median delta **19.9 ms**; Cliff's delta **1.00** (large — complete separation); Mann-Whitney
**p ≈ 0**. The unknown-account path returns before the bcrypt comparison. *Fix:* constant-work
login — verify against a fixed dummy hash when the user is not found. *Limitations:* 60
samples/group over loopback; internet exploitation needs many more samples and a stable
network position. CONFIRMED means the signal exists on this interface, not that it is
trivially exploitable across the internet.

### 12. `verbose-error-responses` — medium
A duplicate registration returns **500** with the raw Mongo error
(`E11000 duplicate key error collection: … index: email_1 …`) **and a stack trace** in the
JSON body. Hands an attacker the framework, versions, and schema. *Fix:* generic body in
production; log detail server-side with a correlation id.

---

## NOT_DETECTED — baseline (positive controls)

### `authz-unsigned-claim-tamper`
A token whose payload was edited to `role:admin` **without re-signing** is rejected (**401**).
Signature verification is mandatory — good. Minor note: the baseline error text
`"Invalid token: invalid signature"` still leaks *why* verification failed; the hardened
stack returns a generic `"Authentication required"`.

---

## Hardened stack — same probes

| finding | baseline | hardened |
|---|---|---|
| authz-role-from-registration | CONFIRMED | NOT_DETECTED (403 at admin route) |
| authz-token-forgery | CONFIRMED | NOT_DETECTED (401 — strong secret, HS256 pinned) |
| logout-does-not-invalidate-token | CONFIRMED | NOT_DETECTED (401 at /me after logout) |
| no-login-throttling | CONFIRMED | NOT_DETECTED (429 + lock after 5 attempts) |
| nosql-operator-in-email | CONFIRMED | INFORMATIONAL (zod rejects non-string; no oracle) |
| password-change-does-not-revoke-sessions | CONFIRMED | NOT_DETECTED (401 after change) |
| permissive-cors | CONFIRMED | NOT_DETECTED (untrusted origin not reflected) |
| refresh-token-reuse | CONFIRMED | NOT_DETECTED (replay → 401, rotation + reuse detection) |
| session-cookie-flags | CONFIRMED | NOT_DETECTED (HttpOnly + SameSite=Strict + path-scoped) |
| message-user-enumeration | CONFIRMED | NOT_DETECTED (one generic 401) |
| timing-user-enumeration | CONFIRMED (Δ 19.9 ms) | NOT_DETECTED (Δ 0.7 ms, Cliff's δ 0.09, p 0.41) |
| verbose-error-responses | CONFIRMED | NOT_DETECTED (generic 202) |

See [`hardening.md`](./hardening.md) for how each fix was made and its residual risk.
