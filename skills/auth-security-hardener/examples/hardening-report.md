# Example — hardening report shape

From running the skill against `demo/backend/src/controllers/baseline.auth.controller.ts`
with the breaker report as input. The full, current version is `docs/hardening.md`.

---

# Authentication Hardening — demo/backend baseline stack — 2026-09-04

Reviewed against: auth-security-hardener §5.
Input findings: `docs/findings.md` (baseline run — 12 CONFIRMED).
Boundaries:
- authn: `middleware/authenticate.ts`, `services/token.service.ts`, `services/password.service.ts`
- authz: `middleware/authorize.ts`, per-route guards in `routes/*.routes.ts`

## Items

### Login timing / user enumeration
- Status: present — `baseline.auth.controller.ts:81` returns before the bcrypt call when the
  user is not found.
- Why it matters: response time is an oracle for "is this email registered" (see breaker
  finding `timing-user-enumeration`, 21.9 ms median delta).
- Decision: FIX.
- Change: `hardened.auth.controller.ts` `hardenedLogin` — look up user, pick real hash or
  `getDummyArgon2Hash()`, always run one `hardenedVerify()`, return one generic
  `401 "Invalid email or password"`. Dummy hash precomputed once in `password.service.ts`.
- Test: `__tests__/timing.test.ts` — median delta between known/unknown below a threshold,
  Cliff's delta negligible, over N samples.
- Residual risk: the user lookup itself still costs a few hundred microseconds that the
  "not found" path also pays (we still query). A local attacker with a very large sample
  count might see sub-millisecond structure. Constant work cuts the signal from ~22 ms to
  sub-millisecond; it does not zero it.

### Authorization decided from a token claim
- Status: present — `authorize.ts` `baselineRequireAdmin` reads `req.auth.tokenRole`, copied
  verbatim from the JWT by `authenticate.ts`.
- Why it matters: two paths to admin — register with `{"role":"admin"}`, or forge a token
  with the fallback secret (breaker findings `authz-role-from-registration`,
  `authz-token-forgery`).
- Decision: FIX.
- Change: `hardenedRequireRole(role)` loads the user from the DB and checks `user.role`;
  the token is identity-only. `hardenedRegister` never reads `role` from the body.
- Test: `__tests__/authz.test.ts` — register with `role:admin` → login → `GET /admin/users`
  → expect 403.
- Residual risk: an attacker who compromises the database or the admin-provisioning flow can
  still grant themselves the role. Authorization is only as trustworthy as the store it reads.

### No rate limit / lockout on login
- Status: absent.
- Why it matters: unlimited online password guessing / credential stuffing (breaker finding
  `no-login-throttling`).
- Decision: FIX.
- Change: `middleware/rateLimit.ts` (`express-rate-limit`, IP-scoped) on the hardened auth
  routes + `services/lockout.service.ts` (per-account, 5 failures → 15 min lock).
- Test: `__tests__/ratelimit.test.ts` — 6th wrong attempt on one account returns 429/locked;
  a different account is unaffected.
- Residual risk: the lockout is in-memory (single process). A multi-instance deployment needs
  a shared store (Redis) — flagged as RECOMMEND for production. Lockout also introduces a
  denial-of-service-against-one-account vector; the 15-minute window bounds it.

### Server-side session store for revocation
- Status: absent — baseline tokens are self-contained, nothing to revoke.
- Why it matters: logout and "logout everywhere" are no-ops; a stolen token lives to expiry
  (breaker findings `logout-does-not-invalidate-token`,
  `password-change-does-not-revoke-sessions`).
- Decision: FIX (this codebase already has MongoDB, so a `Session` collection is a local
  change, not new infra). For a system with **no** datastore at all this would be RECOMMEND.
- Change: `models/Session.ts` + `services/session.service.ts`; `authenticate` checks the
  `jti` every request; logout / logout-all / password-change revoke.
- Test: `__tests__/token-session.test.ts` — token rejected at `/me` after logout and after a
  password change.
- Residual risk: a valid session can still be used until it is explicitly revoked or expires;
  detection of "this session is suspicious" is out of scope here.

## Re-review
Checklist walked again against `hardened.auth.controller.ts`. All 12 breaker CONFIRMED
findings return NOT_DETECTED on re-run. One INFORMATIONAL remains
(`nosql-operator-in-email`): the zod schema rejects the non-string input, so it is noted but
not a vulnerability.

## Summary
| item | decision | test |
|---|---|---|
| login timing | FIX | timing.test.ts |
| authz from claim | FIX | authz.test.ts |
| rate limit / lockout | FIX | ratelimit.test.ts |
| session revocation | FIX | token-session.test.ts |
| refresh rotation + reuse detection | FIX | token-session.test.ts |
| argon2id + password policy | FIX | (covered by registration/login suites) |
| generic errors | FIX | error-handling covered in login.test.ts |
| strict CORS + helmet | FIX | routes wiring |
| redacted logging | FIX | audit-log.service.ts |
| multi-instance lockout store | RECOMMEND | — |
| neutral registration response | RECOMMEND → adopted | registration.test.ts |
