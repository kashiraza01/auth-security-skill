---
name: auth-security-hardener
description: >-
  Review an authentication implementation against a defined checklist, explain why each issue
  matters, and implement targeted fixes without rewriting the architecture. Use when asked to
  "harden the auth", "fix the login security", "make authentication timing-safe", "review this
  auth code for security", "act on the audit findings", "secure the JWT / session handling",
  or when given an auth-security-breaker report to remediate. Inspects the real architecture
  first, decides FIX / RECOMMEND / SKIP per item, preserves behaviour and endpoint contracts,
  adds or updates a security test for every fix, and re-reviews. It does NOT invent
  vulnerabilities to look busy, does NOT swap frameworks or restructure modules, and does NOT
  claim a mitigation is absolute — every fix is described as "reduces risk by X", with the
  residual stated.
---

# auth-security-hardener

The defender half of the pair. Given an authentication implementation — and ideally an
`auth-security-breaker` report — it reviews the code against a checklist, fixes what needs
fixing in place, proves each fix with a test, and re-reviews.

Its discipline is restraint: the smallest change that closes the finding, no architectural
rewrites, no behaviour changes the callers can see, no "while I'm here" refactors.

---

## 1. When to run this

- After an `auth-security-breaker` audit, to remediate the CONFIRMED and SUSPECTED findings.
- On an auth implementation that has not been reviewed, as a first pass.
- Before shipping an auth change, as a checklist gate.

Do **not** run it as a licence to rewrite the auth layer. If the design is fundamentally
wrong (e.g. no server-side session state anywhere and the product needs revocation), say so
as a RECOMMEND with a migration sketch — do not silently re-architect.

---

## 2. Objectives

1. Identify the authentication and authorization boundaries in the code.
2. Review the implementation against the checklist (§5).
3. For each issue: explain **why it matters** with a concrete attack, then decide
   **FIX / RECOMMEND / SKIP** (§4).
4. Implement the FIX items in place, preserving behaviour and endpoint contracts.
5. Add or update a **security test** for every FIX so the fix is proven and stays fixed.
6. Re-review the result; report residual risk for each fix honestly.

---

## 3. Workflow — ten steps, in order

1. **Locate the boundaries.** Find where authentication happens (credential check, token
   issue, token verify) and where authorization happens (role/permission checks, ownership
   checks). List the files and functions. Everything else is out of scope.
2. **Inventory the surface.** Same endpoint list the breaker builds: register, login, refresh,
   logout, logout-all, password change/reset, "me", role-gated routes. Note contracts
   (status codes, response shapes) — these must not change.
3. **Review against the checklist (§5).** For each item: is it present, absent, or partial?
   Cite the line.
4. **For each issue, write the "why".** One concrete attack sentence. If you cannot name the
   attack, it is not a finding — drop it.
5. **Decide FIX / RECOMMEND / SKIP** per §4. Inspect the actual architecture before deciding
   — a recommendation that does not fit the design is noise.
6. **Implement FIX items.** Smallest change that closes it. Keep the public contract. Keep
   the diff readable. One concern per change.
7. **Add/adjust a security test** for each FIX. The test must fail against the old code and
   pass against the new. Prefer statistical assertions (thresholds, distributions) over
   brittle exact values for anything timing-related.
8. **Run the whole test suite.** Fixes must not break registration, login, refresh, logout,
   protected routes, or role checks. Fix regressions before continuing.
9. **Re-review.** Walk the checklist again against the changed code. Confirm each FIX is
   closed and note anything a fix newly exposed.
10. **Report.** Per item: issue → why → decision → change made (files) → test that proves it →
    **residual risk**. Nothing is described as "now secure" — only "this attack no longer
    works; here is what still could".

---

## 4. Decision criteria — FIX / RECOMMEND / SKIP

| Decision | Use when |
|---|---|
| **FIX** | Present in this codebase, has a concrete attack, and can be closed with a local change that keeps the contract. Do it now. |
| **RECOMMEND** | Real, but the fix needs a call the owner must make: new infrastructure (a Redis/session store where none exists), a product decision (neutral registration response vs. UX), a dependency upgrade with breaking changes, or a design change. Describe the fix and the trade-off; do not implement unilaterally. |
| **SKIP** | Not applicable to this architecture (e.g. CSRF hardening for a pure bearer-token API with no cookies), already handled, or the "fix" would add more risk/complexity than the issue. Say why you skipped it — a visible SKIP is part of the review. |

Do not FIX something the checklist lists but the architecture does not have. Do not SKIP
silently.

---

## 5. Checklist — what to review and the direction of the fix

**Account enumeration**
- *Login timing.* Do equal work on both paths: when the account is not found, still perform
  one password-hash verification against a fixed dummy hash before returning. Not a fixed
  `sleep()` as the primary defence (see §6). → typically FIX.
- *Login response.* One identical status + body for every failed login, regardless of reason.
  → FIX.
- *Registration / password reset.* Neutral response that does not confirm whether the address
  exists; rate-limit these endpoints. The neutral-registration response is a UX trade-off →
  RECOMMEND unless the owner has already chosen it.

**Credential handling**
- *Hashing.* Argon2id (OWASP: m=19456 KiB, t=2, p=1) or scrypt or bcrypt cost ≥ 12. If an
  older/weaker hash is in use, add transparent upgrade-on-login. → FIX or RECOMMEND depending
  on migration size.
- *Policy.* Minimum length 12+, reject a small common-password list and the user's own email
  local-part. → FIX.
- *Leakage.* Never log, return, or embed the plaintext password. Redact request bodies in
  logs. → FIX.

**Brute force**
- *IP rate limit* on the auth endpoints (e.g. `express-rate-limit`). → FIX.
- *Per-account lockout* after N failures for a cool-off window — this is the control that
  survives a distributed attack. → FIX.

**Tokens / sessions**
- *Access token* short-lived (minutes). → FIX if long-lived.
- *Signature.* Require a strong secret from config; fail to boot without it. Separate secrets
  for access vs refresh. Pin `algorithms` on verify. Check `iss` / `aud`. → FIX.
- *Revocation.* A server-side session/`jti` record checked on every request; revoke on
  logout. If there is no session store at all and the product needs revocation → RECOMMEND
  (new infra).
- *Password change / logout-all.* Bump a per-user `tokenVersion` embedded in tokens and
  revoke all sessions. → FIX.
- *Refresh rotation.* Rotate on every use; on replay of an already-rotated token, revoke the
  whole family. → FIX.
- *Cookie flags.* Refresh token in `HttpOnly` + `SameSite=Strict` + path-scoped +
  `Secure`(prod) cookie. Access token in the response body / memory, never a JS-readable
  cookie. → FIX.

**Authorization**
- *Decision source.* The authorization decision is made from server-side state (DB lookup),
  not from a token claim the client could have influenced. The token proves identity; the
  server decides permissions. → FIX.
- *Client-controlled privilege.* Registration / profile update must not set role or
  permissions. → FIX.
- *Ownership.* Every "act on resource X" checks that X belongs to the caller. → FIX.

**Transport / config**
- *CORS.* Explicit origin allowlist; credentials only for those origins; never reflect an
  arbitrary `Origin`. → FIX.
- *Headers.* `helmet` (or equivalent) on auth responses. → FIX.
- *Errors.* Generic body in production; detail logged server-side with a correlation id.
  → FIX.
- *Secrets.* Out of source and out of the repo; `.env.example` with blanks; documented.
  → FIX / RECOMMEND.
- *Dependencies.* Flag auth-relevant advisories; upgrading is → RECOMMEND if breaking.

**Password reset (if present)**
- Single-use, short-TTL, high-entropy token; invalidate on use and on password change;
  neutral response; rate-limited. → FIX.

---

## 6. Special guidance

### Timing / user enumeration — constant work, not fixed sleeps

The wrong fix is `await sleep(200)` on the "user not found" branch. It does not equalise the
distributions (the real path's time varies with hash cost and load), it is trivially
distinguished with enough samples, and it adds latency for every failed login.

The right fix: make both branches do **the same work**.

1. Look the user up.
2. Choose the hash to verify against: the real one if the user exists, a **fixed pre-computed
   dummy hash** (same algorithm and parameters) if not.
3. Always run exactly one `verify()`.
4. Return one identical generic error for "no such user" and "wrong password".

Optional, secondary: a small amount of **jitter** on top — but only as defence-in-depth, and
never described as the mitigation. See `packages/constant-time-auth` in this repo for a
`createConstantTimeVerifier` implementation and its benchmarks.

Residual risk to state: the two paths still differ by a DB-hit's worth of time and by
whatever the hash's own variance is; a local attacker with a very large sample count may
still see something. Constant work reduces the signal by orders of magnitude; it does not
zero it.

### Authorization — keep the four concepts separate

- **Authentication**: proving who the caller is. Output: a verified identity.
- **Token claims**: data the client carries. Convenient, *not* authoritative.
- **Authorization**: deciding what this identity may do. Must be computed server-side from
  trusted state, every request.
- **Enforcement**: the check actually sitting in front of the protected operation.

A role in a JWT is a claim, not an authorization. Re-derive the permission from the database
(or a trusted policy service) at enforcement time.

---

## 7. Remediation methodology

- **One concern per change.** "Add rate limit" and "pin JWT algorithm" are two changes, two
  tests.
- **Preserve the contract.** Same routes, same status codes, same response shapes. If a
  contract genuinely must change (e.g. login error text is now generic), call it out as a
  behaviour change and update the callers/tests.
- **No opportunistic refactors.** Renaming, reformatting, restructuring unrelated code hides
  the security change in the diff.
- **Test first where practical.** Write the failing security test, then make it pass.
- **Statistical tests for timing.** Assert on a threshold or a distribution comparison with a
  margin, never `expect(ms).toBe(exact)`.

---

## 8. Report format

```
# Authentication Hardening — <code> — <ISO timestamp>

Reviewed against: auth-security-hardener §5. Input findings: <breaker report or "none">.
Boundaries: <files/functions for authn and authz>

## Items

### <checklist item>
- Status: present / absent / partial  (<file:line>)
- Why it matters: <one concrete attack>
- Decision: FIX | RECOMMEND | SKIP  — <reason>
- Change: <files touched, one line each>  (FIX only)
- Test: <test name/path that fails-before / passes-after>  (FIX only)
- Residual risk: <what still could go wrong / what this does not cover>

## Re-review
<checklist walked again; each FIX confirmed closed; anything newly exposed>

## Summary
| item | decision | test |
```

---

## 9. Worked example (this repo)

`demo/backend/src/controllers/hardened.auth.controller.ts` is the result of running this
skill against `baseline.auth.controller.ts` with the breaker report as input. Representative
items:

- **Login timing → FIX.** `hardenedLogin` looks the user up, then always runs one Argon2id
  `verify()` — against the real hash or `getDummyArgon2Hash()` — and returns one generic
  `401 "Invalid email or password"`. Test: `timing.test.ts` asserts the median delta between
  known/unknown is below a small threshold with a bounded Cliff's delta. Residual: a
  DB-lookup's worth of time still differs; large local sample counts may still see a hair.
- **Authorization from token claim → FIX.** `hardenedRequireRole` loads the user from the DB
  and checks `user.role`; the token is identity only. `register` ignores any client `role`.
  Test: `authz.test.ts` registers with `role:admin`, logs in, expects `403` on the admin
  route.
- **Logout → FIX.** Each token carries a `jti` bound to a `Session` row; `hardenedLogout`
  revokes it; `authenticate` checks it every request. Test: `token-session.test.ts` — token
  rejected at `/me` after logout.
- **Neutral registration response → RECOMMEND, then adopted.** `hardenedRegister` returns a
  fixed `202` whether or not the email was new. Trade-off noted: the user is not told "that
  email is taken". The owner accepted it for this lab.

---

## 10. Close-out

- Deliver the report with residual risk on every FIX.
- Hand the changed code back to `auth-security-breaker` for a re-run.
- If RECOMMEND items remain, list them as the owner's open decisions — do not implement them
  unilaterally.
- "The attack in finding X no longer works" is the claim. "The auth is secure" is never the
  claim.
