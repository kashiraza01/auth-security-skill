---
name: auth-security-breaker
description: >-
  Adversarially audit an authentication implementation on a local / owned / explicitly
  authorised target and produce reproducible, evidence-backed findings. Use when asked to
  "audit auth", "attack the login", "test for user enumeration", "check the auth for
  vulnerabilities", "pen-test the authentication", "is my login timing-safe", "can you break
  this auth". Maps the auth attack surface, inspects the code, builds safe local probes,
  runs them with enough samples to be statistically honest, and classifies every result
  CONFIRMED / SUSPECTED / INFORMATIONAL / NOT_DETECTED. It does NOT harden code (hand that to
  auth-security-hardener), never runs against a target that is not in scope, and never
  claims a timing difference is "exploitable" without saying what that would take.
---

# auth-security-breaker

An authorised, local, adversarial auditor for authentication code. Its job is to find the
places where authentication and authorization can be bypassed, abused, or observed, and to
prove each one with evidence a fix can be checked against.

It is the attacker half of a pair. The defender half is `auth-security-hardener`. Run the
breaker first, hand its report to the hardener, then run the breaker again to confirm the
fixes.

---

## 0. Scope and authorization — read before doing anything

This skill only runs against a target the operator **owns or is explicitly authorised to
test**. In practice that means:

- `localhost`, `127.0.0.1`, `::1`, or a container/VM the operator controls;
- a staging or test environment the operator names and confirms is theirs;
- never a third-party service, never production of anything that serves real users, never a
  host discovered by scanning.

Hard rules:

1. If the target host is not loopback and not on an explicit allowlist the operator set,
   **stop and ask**. Do not proceed on assumption.
2. Refuse if `NODE_ENV=production` or the target is described as production.
3. No flooding. Probes are sequential and low-volume by default (tens of requests, not
   thousands), with a fixed gap between them. State the caps in the report.
4. No destructive actions — no mass account creation, no data deletion, no lockout of real
   users, no config changes. A password-change probe on a throwaway fixture account is
   fine; touching a real account is not.
5. The output is a report. This skill never "leaves a shell", persists access, or exfiltrates
   data. Evidence is the minimum needed to prove the finding (status codes, timings,
   response fragments), not dumps.

If any of these can't be satisfied, say so and stop.

---

## 1. When to run this

- Someone asks for an authentication audit / review / pen-test of code they control.
- A login, registration, session, token, or authorization change is about to ship.
- A specific worry: "is our login leaking which emails are registered?", "can a user get
  admin?", "does logout actually work?"
- Regression: after `auth-security-hardener` has changed something, to confirm the finding
  is gone and nothing else broke.

Do **not** use it to attack anything the operator hasn't shown they own.

---

## 2. Objectives

1. Enumerate the authentication and authorization attack surface from the code and the running
   service.
2. For each class of weakness in the checklist (§5), decide whether it is present.
3. Prove each present weakness with a reproducible probe and recorded evidence.
4. Rate exploitability and impact honestly, including what an attacker would additionally
   need.
5. Produce remediation direction for each finding, aligned with the hardener's checklist.
6. Re-run after remediation and report what changed.

---

## 3. Workflow — ten steps, in order

1. **Confirm scope.** Identify the target URL and the code location. Run the §0 checks.
   Record the caps you will use (sample counts, delay, max attempts).
2. **Map the attack surface.** List every auth-relevant endpoint (register, login, refresh,
   logout, logout-all, password change/reset, "me", any admin/role-gated route) with method,
   auth requirement, and what it returns. Read the route table, not just guess.
3. **Read the implementation.** For each endpoint trace: input validation → user lookup →
   credential verification → token/session issue → authorization check → error handling →
   logging. Note where a value from the client is trusted.
4. **Form hypotheses.** From the reading, list the specific weaknesses you expect and the
   observable each would produce (e.g. "unknown-email path skips the hash → known-email
   responses are slower").
5. **Build safe probes.** One per hypothesis. Deterministic checks need one request;
   timing/threshold checks need repeated measurement. Never exceed the caps from step 1.
6. **Execute against the target.** Sequential. Fixed delay between requests. Capture status,
   body (trimmed), relevant headers, and wall-clock time per request.
7. **Analyse.** For timing: discard warm-up samples, compare medians (not means), report an
   effect size (Cliff's delta) and a non-parametric significance test (Mann-Whitney U). For
   everything else: compare the observed response against the hypothesis.
8. **Classify and write up** each finding using §4 and the report format in §6. Include the
   numbers, not adjectives.
9. **Rate exploitability** (§7): what conditions an attacker needs, what this proves and what
   it does not.
10. **Re-run after hardening.** Same probes, same caps. Mark each finding
    `fixed` / `still-present` / `partially-addressed`, and flag any regression the probes now
    trip that they did not before.

---

## 4. Decision criteria — the four verdicts

| Verdict | Use when |
|---|---|
| **CONFIRMED** | The probe reproduced the weakness with evidence a fix must address. Deterministic checks: one clear reproduction. Statistical checks: large effect size (Cliff's delta ≥ 0.33), significant (p < 0.01), and a materially large absolute difference. |
| **SUSPECTED** | There is a real signal but it is weak, conditional, or not conclusively exploitable — small effect size, marginal significance, or it depends on a config you could not verify. Say what would settle it. |
| **INFORMATIONAL** | Worth recording but not a vulnerability on its own — a positive control that passed, a defence-in-depth gap, a behaviour that is only a problem in combination with something not present here. |
| **NOT_DETECTED** | The probe ran and the weakness was absent. Record it — a clean result on a named check is evidence too, and it is what a re-run needs to compare against. |

Never upgrade a verdict for effect. Never call a timing difference "exploitable" — call it
"a measurable difference on <interface>", then state in Limitations what exploitation would
require (sample volume, network position, load).

---

## 5. Checklist — what to probe

Adapt to the actual architecture; not every item applies to every design. For each, the
observable is in parentheses.

**Account existence / enumeration**
- Login timing: unknown account vs known account + wrong password (response-time distribution).
- Login response content: status code, error string, body shape differ by account existence.
- Registration: does it reveal "email already taken"? (status/message)
- Password reset: does it reveal whether the address exists? (status/message/timing)
- Non-string / operator inputs in the identifier field (NoSQL/LDAP operator reaching the query).

**Credential handling**
- Password hash algorithm and parameters (from a hash sample or the code): bcrypt cost,
  Argon2 m/t/p, or something weaker/none.
- Password policy: minimum length, obvious-password rejection.
- Is the plaintext password ever logged, returned, or put in an error?

**Brute force / automation resistance**
- Rate limit on the auth endpoints (per IP). After how many attempts, what response.
- Per-account lockout (survives a distributed source). After how many failures, for how long.
- Any CAPTCHA / step-up after repeated failure.

**Tokens / sessions**
- Token type and lifetime; is the access token long-lived?
- Signature: algorithm pinned on verify? Secret strength; is there a hardcoded fallback?
  Same secret for access and refresh?
- Are `iss` / `aud` / `exp` checked?
- Server-side session record / revocation list, or is the token self-contained and
  irrevocable?
- Logout: does the token still work afterwards?
- Password change / "logout all": are prior tokens invalidated?
- Refresh tokens: rotated on use? Is a replayed (already-rotated) refresh token rejected?
- Refresh token storage: `HttpOnly`, `SameSite`, `Secure`, path scope.

**Authorization**
- Where is the authorization decision made — from a token claim, or from server-side state?
- Can the client influence its own role/permissions (registration body, profile update,
  a claim the server copies without re-checking)?
- Forged/edited token: re-sign with a guessed/known secret; edit a claim without re-signing.
- IDOR-adjacent: can user A act on user B's session/token/account id?

**Transport / configuration**
- CORS: is the origin reflected? Are credentials allowed for untrusted origins?
- Security headers (helmet-equivalent) on the auth responses.
- Error responses: stack traces, framework versions, DB driver errors.
- Secrets in source, in the repo, in client-visible config.
- Dependency versions with known auth-relevant CVEs.

---

## 6. Report format

Write one Markdown report. Header, then one block per finding, then a summary table.

```
# Authentication Audit — <target> — <ISO timestamp>

Scope: <what was in scope, the caps used>
Environment: <runtime, OS, "local HTTP" etc>
Code reviewed: <paths / commit>

## Findings

### <id> — <one-line title>
- Verdict: CONFIRMED | SUSPECTED | INFORMATIONAL | NOT_DETECTED
- Severity: critical | high | medium | low | info
- What was observed: <plain statement, with the numbers>
- Evidence:
  <status codes / medians+p95 / effect size + p / response fragments — data, not adjectives>
- Why it matters: <the attack it enables, concretely>
- Exploitability: <what an attacker additionally needs>
- Remediation: <direction, aligned with auth-security-hardener §checklist>
- Limitations: <sample size, environment, what this does NOT prove>

## Summary
| id | verdict | severity | one-line |
```

For a re-run, add a `Change:` line to each finding (`fixed` / `still-present` /
`partially-addressed` / `regression`) and keep the previous numbers alongside the new ones.

---

## 7. Testing methodology notes

- **Timing.** HTTP timings are right-skewed and noisy. Always: warm up and discard the first
  handful of samples; take ≥ 40 per group (more is better); interleave the two request types
  so slow drift cancels; report **median** and **p95**, not mean alone; report **Cliff's
  delta** (effect size, distribution-free) and **Mann-Whitney U** (significance, no normality
  assumption). A CONFIRMED verdict means "measurable on this interface", never "exploitable
  over the internet" — put the exploitation bar in Limitations.
- **Thresholds (rate limit / lockout).** Cap the attempt count low. Absence of any throttle
  in N sequential attempts is conclusive for "no throttle"; finding the exact threshold and
  reset window is a deeper engagement — say so.
- **Authorization.** Always assert at the API boundary — call the protected endpoint and read
  the status. Frontend behaviour (a hidden button) is not evidence.
- **Determinism.** Signature-verification, claim-trust, CORS, cookie-flags and error-verbosity
  checks are deterministic — one well-formed request each is enough.
- **Never fabricate.** If a probe could not run, say so and mark it INFORMATIONAL. Numbers in
  the report are numbers that were measured.

---

## 8. Worked example (this repo)

Target `http://localhost:4000`, stacks `/api/baseline/auth` and `/api/hardened/auth`.
`demo/security-tests/` is a concrete implementation of this skill's workflow. A baseline run
produced, among others:

- **timing-user-enumeration — CONFIRMED (medium).** Unknown-account login median 18.4 ms;
  known-account + wrong-password median 40.3 ms; median delta 21.9 ms; Cliff's delta 1.00
  (complete separation); Mann-Whitney p ≈ 0. Cause: the unknown-account path returns before
  the bcrypt comparison. Limitations: 60 samples/group over loopback; internet exploitation
  needs many more samples and a stable network position.
- **authz-role-from-registration — CONFIRMED (critical).** An account created with
  `{"role":"admin"}` in the register body calls `GET /admin/users` and gets 200.
- **logout-does-not-invalidate-token — CONFIRMED (high).** After `POST /logout`, the same
  bearer token still returns 200 from `/me`.

The same probes against `/api/hardened/auth` returned NOT_DETECTED for all three.

---

## 9. Close-out

- Deliver the report. Rank CONFIRMED-critical first.
- Hand the CONFIRMED and SUSPECTED findings to `auth-security-hardener`.
- After the hardener has worked, run the **exact same probes** again and produce the re-run
  report with `Change:` lines.
- The goal is a short list of proven, fixable problems — not a long list of maybes.
