# Hardening — what changed and what remains

Output of the `auth-security-hardener` workflow against `baseline.auth.controller.ts`, using
`findings.md` as input. Same endpoints, same request/response shapes; the differences are all
in how the work is done.

Format per item: **vulnerability → detection → fix → code change → test → residual risk.**

---

## 1. Login timing / user enumeration

- **Vulnerability:** unknown-account login returns before the password hash runs
  (`baseline.auth.controller.ts` — `if (!user) return`), so known-account responses are a
  median 19.9 ms slower.
- **Detection:** `timing-enumeration` probe — 60 samples/group, median + p95, Cliff's delta,
  Mann-Whitney U.
- **Fix:** constant work. Look the user up, then **always** run exactly one Argon2id
  `verify()` — against the real hash, or against a fixed dummy hash if the user is not found —
  and return one generic error either way.
- **Code:** `hardened.auth.controller.ts::hardenedLogin`; `password.service.ts::getDummyArgon2Hash`
  (one Argon2id hash computed at module load and cached). Extractable form:
  `packages/constant-time-auth`.
- **Test:** `__tests__/timing.test.ts` — hardened median delta and Cliff's delta stay below
  small thresholds over 50 samples; `docs/findings.json` re-run shows Δ ≈ 0.7 ms, Cliff's δ
  0.09, p 0.41.
- **Residual risk:** the `User.findOne` still runs on both paths and Argon2's own runtime
  varies with load. Constant work cut the signal from ~20 ms to sub-millisecond; it did not
  zero it. A local attacker with a very large sample count may still resolve sub-ms
  structure. Paired with the generic error (below) and lockout.

## 2. Login error message differs by account existence

- **Vulnerability:** `"No account found with that email address"` vs `"Incorrect password"`.
- **Fix:** one string, `"Invalid email or password"`, for every failed login — unknown
  account, wrong password, malformed body, all of it.
- **Code:** `hardenedLogin` throws `HttpError(401, "Invalid email or password")` on every
  failure branch.
- **Test:** `__tests__/login.test.ts` — "returns the SAME generic error for wrong password
  and unknown email".
- **Residual risk:** none for this vector. Enumeration can still leak through registration
  and password-reset responses — handled at #9 and out of scope respectively (no reset flow
  in the demo).

## 3. Authorization decided from a token claim

- **Vulnerability:** `baselineRequireAdmin` reads `req.auth.tokenRole`, copied verbatim from
  the JWT. Two escalation paths: register with `role:admin`; forge a token with the fallback
  secret.
- **Fix:** the token proves identity only. `hardenedRequireRole(role)` loads the user from
  the database and checks `user.role` on every request. `hardenedRegister` never reads `role`
  from the body.
- **Code:** `middleware/authorize.ts::hardenedRequireRole`, `middleware/authenticate.ts::hardenedAuthenticate`
  (sets `req.auth = { userId, jti }` — no role), `hardenedRegister`.
- **Test:** `__tests__/authz.test.ts` — register with `role:admin` → login → `403` at the
  admin route; forged/tampered tokens → `401`; a genuinely promoted user → `200`.
- **Residual risk:** authorization is only as trustworthy as the store it reads. An attacker
  who compromises the database or the admin-provisioning path can still grant themselves the
  role.

## 4. JWT signing — weak fallback secret, no algorithm pin

- **Vulnerability:** `JWT_ACCESS_SECRET || "dev-secret"`; `jwt.verify` with no `algorithms`
  option; access and refresh share the secret.
- **Fix:** dedicated `HARDENED_JWT_ACCESS_SECRET` / `HARDENED_JWT_REFRESH_SECRET`, both
  required (throw on boot if missing / < 32 chars / equal). `jwt.verify` pinned to
  `algorithms: ["HS256"]` with `issuer` + `audience` checked. Access TTL 15 min.
- **Code:** `config/env.ts::getHardenedSecrets`, `services/token.service.ts::hardenedVerifyAccess`.
- **Test:** `authz.test.ts` — forged token rejected; `regression.test.ts` — hardened flow
  still issues and verifies tokens.
- **Residual risk:** a leaked secret still forges tokens — secret management (rotation, a
  vault) is out of the code's control. `tokenVersion` + session revocation (below) limit the
  blast radius of a leak that is later detected.

## 5. No rate limit / lockout

- **Vulnerability:** login answers as fast as you can call it, forever.
- **Fix:** `express-rate-limit` (IP-scoped, generous — the coarse net) on the hardened auth
  routes **plus** `lockout.service` (per-account, 5 failures in 15 min → 15-min lock — the
  targeted brake that survives a distributed source).
- **Code:** `middleware/rateLimit.ts`, `services/lockout.service.ts`, wired in
  `routes/hardened.routes.ts` and `hardenedLogin`.
- **Test:** `__tests__/ratelimit.test.ts` — 6th wrong attempt on one account → `429`; a
  different account is unaffected.
- **Residual risk:** the lockout is in-memory (single process). **RECOMMEND** for a
  multi-instance deployment: move it to a shared store (Redis). Lockout also creates a
  denial-of-service-against-one-account vector; the 15-minute window bounds it.

## 6. Logout does not invalidate the token

- **Vulnerability:** nothing server-side to revoke; the token lives to expiry.
- **Fix:** every token pair carries a `jti` bound to a `Session` row.
  `hardenedAuthenticate` checks the session is `active` every request. `hardenedLogout`
  revokes the `jti`.
- **Code:** `models/Session.ts`, `services/session.service.ts`, `hardenedAuthenticate`,
  `hardenedLogout`.
- **Test:** `__tests__/token-session.test.ts` — token → `401` at `/me` after logout.
- **Residual risk:** a valid session is usable until explicitly revoked or expired; there is
  no anomaly detection ("this session looks stolen").

## 7. Password change / logout-all does not revoke sessions

- **Fix:** `change-password` requires the current password, then bumps `user.tokenVersion`
  and calls `revokeAllForUser`. `authenticate` rejects any token whose `tokenVersion` is
  stale. `logout-all` does the same without the password change.
- **Code:** `hardenedChangePassword`, `hardenedLogoutAll`, `hardenedAuthenticate`
  (tokenVersion check).
- **Test:** `token-session.test.ts` — pre-change token → `401` after change; `logout-all`
  kills every session for the user.
- **Residual risk:** none for this vector.

## 8. Refresh token — no rotation, no reuse detection

- **Fix:** `hardenedRefresh` verifies the refresh JWT, checks the `jti` is still active,
  revokes it, and issues a fresh pair. If a **rotated** (already-revoked) refresh token is
  presented, it revokes the entire session family for that user and returns `401`.
- **Code:** `hardenedRefresh`, `session.service.ts::revokeAllForUser`.
- **Test:** `token-session.test.ts` — a rotated refresh token replayed → `401`.
- **Residual risk:** a stolen refresh token used **before** the legitimate client rotates is
  still valid until then; reuse detection catches the *second* use, not the first.

## 9. Registration reveals whether an email exists

- **Fix:** `hardenedRegister` returns a fixed `202` with the same message whether or not the
  account was created (it only creates when the email is new).
- **Code:** `hardenedRegister`.
- **Test:** `__tests__/registration.test.ts` — two registrations of the same email return
  identical status and message.
- **Decision:** this was a **RECOMMEND** (it is a UX trade-off — the user is not told "that
  email is taken") that the owner adopted for the lab. A product with email verification
  would handle this differently.
- **Residual risk:** timing of the registration response could still differ (create vs
  no-op). Not currently measured; the endpoint is rate-limited.

## 10. Permissive CORS

- **Fix:** `cors({ origin: [FRONTEND_URL], credentials: true })` — an exact allowlist, never
  a reflector.
- **Code:** `routes/hardened.routes.ts`.
- **Test:** `info-leak` probe — untrusted origin is not reflected.
- **Residual risk:** none, given the allowlist is maintained.

## 11. No security headers

- **Fix:** `helmet()` on the hardened router.
- **Residual risk:** `helmet` defaults are a baseline; a real deployment tunes CSP etc.

## 12. Verbose error responses

- **Fix:** `hardenedErrorHandler` — `HttpError` with `expose: true` passes its message
  through; everything else becomes a generic `500` with a correlation id, detail logged
  server-side (and shown only when `NODE_ENV !== "production"`).
- **Code:** `middleware/error.ts`.
- **Test:** `regression.test.ts` — a duplicate registration body contains no `/src/`,
  `node_modules`, `at Object`, or `E11000`.
- **Residual risk:** none for this vector.

## 13. Plaintext password in logs

- **Fix:** `audit-log.service.ts::hardenedLog` takes a fixed set of non-sensitive fields;
  email is masked (`al***@example.com`); the password is never passed in.
- **Residual risk:** none for this vector.

## 14. Weak password hashing and policy

- **Fix:** Argon2id (m=19456, t=2, p=1) via `@node-rs/argon2` replaces bcrypt cost 8.
  Policy: min 12 chars, reject a small common-password list and the email local-part.
- **Code:** `password.service.ts`, `validation/schemas.ts::checkPasswordPolicy`.
- **Residual risk:** the common-password list is tiny (illustrative). A real deployment uses
  a large breached-password list (e.g. HIBP k-anonymity) — **RECOMMEND**.

---

## Open RECOMMENDs (owner decisions, not implemented)

1. Move per-account lockout to a shared store (Redis) for multi-instance deployments.
2. Replace the illustrative common-password list with a real breached-password check.
3. If registration enumeration matters, also equalise the registration response timing.
4. Secret management: rotation policy and a vault, rather than `.env`.
