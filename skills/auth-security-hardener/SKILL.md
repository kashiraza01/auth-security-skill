---
name: auth-security-hardener
version: 2.0.0
description: >-
  Review an authentication implementation against a defined checklist, explain why each issue
  matters, and implement targeted fixes without rewriting the architecture. Use when asked to
  "harden the auth", "fix the login security", "make authentication timing-safe", "review this
  auth code for security", "act on the audit findings", "secure the JWT / session handling",
  "stop my login leaking which accounts exist", "make logout actually invalidate the token", "fix user
  enumeration", or when given an auth-security-breaker findings.json to remediate. Inspects the real architecture
  first, decides FIX / RECOMMEND / SKIP per item, preserves behaviour and endpoint contracts,
  adds or updates a security test for every fix, and re-reviews. It does NOT invent
  vulnerabilities, does NOT swap frameworks or restructure modules, and does NOT claim a
  mitigation is absolute — every fix states its residual risk.
---

# auth-security-hardener

The defender half of the pair. Given an auth implementation — and ideally an
`auth-security-breaker` `findings.json` — it reviews the code against a checklist, fixes what
needs fixing in place, proves each fix with a test, and re-reviews. Its discipline is restraint:
the smallest change that closes the finding, no architectural rewrites, contracts preserved.

The loop that drives breaker→hardener→breaker automatically is `auth-security-loop`.

This file is a router. Depth lives in `references/`.

| You need… | Load |
|---|---|
| The full review checklist + the direction of each fix | `references/checklist.md` |
| Remediation patterns (constant-work, authz split, rotation, …) with code | `references/remediation-patterns.md` |
| The idiomatic fix per framework | `references/frameworks.md` |
| The hardening-report format | `references/report-format.md` |
| The shared findings contract | `references/finding.schema.json` |
| What past runs learned | run `scripts/lessons-digest.mjs` |

## 1. When to run this

After a breaker audit, to remediate CONFIRMED + SUSPECTED findings; on an unreviewed auth
implementation as a first pass; before an auth change ships, as a gate; or as the hardener step
inside `auth-security-loop`. Do **not** treat it as a licence to rewrite the auth layer — a
fundamentally wrong design is a RECOMMEND with a migration sketch, not a silent re-architecture.

## 2. Workflow — ten steps

0. **Load the lessons digest** (`scripts/lessons-digest.mjs`). Apply the
   accumulated DO / DON'T rules — e.g. "DON'T fix login timing with a sleep".
1. **Locate the boundaries** — where authentication happens (credential check, token issue/verify)
   and where authorization happens (role/permission/ownership checks). List files + functions.
2. **Inventory the surface** — register, login, refresh, logout, logout-all, password
   change/reset, "me", role-gated routes. Note the response contracts; they must not change.
3. **Review against `references/checklist.md`** — present / absent / partial, with a line cite.
4. **Write the "why"** — one concrete attack sentence per issue. If you can't name the attack,
   it's not a finding; drop it.
5. **Decide FIX / RECOMMEND / SKIP** (§3), inspecting the actual architecture first.
6. **Implement FIX items** — smallest change that closes it, contract preserved, one concern per
   change. Use `references/remediation-patterns.md` and `references/frameworks.md` for the idiom.
7. **Add/adjust a security test** per FIX — fails before, passes after. Timing tests assert on a
   threshold + effect size with margin, never an exact ms.
8. **Run the whole suite.** Fixes must not break registration, login, refresh, logout, protected
   routes, or role checks. Fix regressions before continuing.
9. **Re-review** — walk the checklist again; confirm each FIX is closed and note anything a fix
   newly exposed.
10. **Report** (`references/report-format.md`): per item issue → why → decision → change → test →
    **residual risk**. Nothing is "now secure"; only "this attack no longer works; here is what
    still could". Hand the changed code back to the breaker for a re-run.

## 3. Decision criteria — FIX / RECOMMEND / SKIP

| Decision | Use when |
|---|---|
| **FIX** | Present here, has a concrete attack, closable with a local change that keeps the contract. Do it now. |
| **RECOMMEND** | Real, but the fix needs an owner call: new infrastructure (a session store where none exists), a product decision (neutral registration vs UX), a breaking dependency upgrade, or a design change. Describe the fix + the trade-off; do not implement unilaterally. |
| **SKIP** | Not applicable to this architecture (e.g. CSRF hardening for a pure bearer-token API with no cookies), already handled, or the "fix" adds more risk/complexity than the issue. Say why — a visible SKIP is part of the review. |

Do not FIX something the checklist lists but the architecture doesn't have. Do not SKIP silently.

## 4. The two fixes people get wrong (full treatment in `references/remediation-patterns.md`)

- **Login timing / enumeration.** The wrong fix is `sleep()` on the not-found branch — it doesn't
  equalise the distributions and is removable with samples. The right fix is **constant work**:
  always run one hash verification (against a fixed dummy hash when the user is absent) and return
  one generic error. Jitter is defence-in-depth only, never the mitigation. Residual: the user
  lookup + hash variance remain; the signal drops orders of magnitude, not to zero.
- **Authorization from a claim.** Keep four things separate — **authentication** (who you are),
  **token claims** (client-carried data, not authoritative), **authorization** (what you may do,
  computed server-side from trusted state every request), **enforcement** (the check in front of
  the operation). A role in a JWT is a claim, not an authorization.

## 5. Remediation methodology

One concern per change (two tests for "add rate limit" + "pin JWT alg"). Preserve the contract —
same routes, status codes, response shapes; if one genuinely must change, call it out and update
callers/tests. No opportunistic refactors. Test-first where practical. Statistical assertions for
timing.

## 6. Worked example (this repo)

`demo/backend/src/controllers/hardened.auth.controller.ts` is the result of this skill against
`baseline.auth.controller.ts` with the breaker's `findings.json` as input: constant-work login,
DB-backed `hardenedRequireRole`, `jti`↔`Session` revocation, `tokenVersion` on password change,
refresh rotation + reuse detection, strict CORS, helmet, sanitised errors. Re-run: all 12
baseline CONFIRMED → NOT_DETECTED. Full report in `examples/hardening-report.md`; the timing
before/after in `examples/constant-work-login.md`.

## 7. Close-out

Deliver the report with residual risk on every FIX. Hand the changed code to
`auth-security-breaker`. List remaining RECOMMENDs as the owner's open decisions — do not
implement them unilaterally. "The attack in finding X no longer works" is the claim; "the auth is
secure" is never the claim.
