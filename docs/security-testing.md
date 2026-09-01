# Security testing — methodology

How `demo/security-tests/` (the `auth-security-breaker` skill in code form) decides what it
decides, and how to run it.

## Running it

```bash
# from the repo root — spawns its own backend if none is running on :4000
npm run audit

# or against a backend you started yourself
npm run dev:backend                     # terminal 1
npm run audit -w @auth-lab/security-tests -- --no-spawn   # terminal 2

# one stack only, more timing samples
npm run audit -w @auth-lab/security-tests -- --stack=baseline --samples=120
```

Output: `docs/findings.json` (full, machine-readable) + a console table with a
"FIXED BY HARDENING" diff.

## Scope enforcement

`harness/scope-guard.ts` runs before anything else:

- `localhost`, `127.0.0.1`, `::1` — always allowed.
- Anything else — allowed **only** if its host or origin is in `AUTH_LAB_ALLOW_TARGET`
  (comma-separated).
- `NODE_ENV=production` — refused outright.
- Non-http(s) protocols — refused.

There is no flag to bypass this. Point it somewhere out of scope and it exits with code 2.

## Verdicts

| Verdict | Meaning |
|---|---|
| `CONFIRMED` | Reproduced with evidence a fix must address. |
| `SUSPECTED` | Real signal, not conclusive — small effect, marginal significance, or an unverified precondition. |
| `INFORMATIONAL` | Noted, not a vulnerability alone — a passed positive control, a defence-in-depth gap. |
| `NOT_DETECTED` | The probe ran and the weakness was absent. |

Verdicts are never upgraded for effect. A timing difference is reported as "measurable on
this interface", never "exploitable".

## Timing analysis

The one check that is routinely misused. The method:

1. **Compare** unknown email vs known email + wrong password — both failed logins, differing
   only in whether the record exists.
2. **Interleave** the two request types so slow drift (GC, CPU scaling, other load) affects
   both groups equally and cancels.
3. **Discard warm-up** — the first ~15% of samples (JIT, first-connection cost).
4. **≥ 40 samples per group** (default 60). More is better.
5. **Fixed 12 ms gap** between requests — never be the load.
6. **Reset per-account lockout** between samples so every "known" sample measures the
   credential path, not a fast "locked" rejection.

Then:

- **Median** and **p95**, not mean alone (HTTP timings are right-skewed).
- **Cliff's delta** — distribution-free effect size in [-1, 1]. Thresholds (Romano et al.):
  < 0.147 negligible, < 0.33 small, < 0.474 medium, else large.
- **Mann-Whitney U** with a normal approximation — significance without assuming normality.

**CONFIRMED** requires: Cliff's delta ≥ 0.33, p < 0.01, and a materially large absolute
median delta (≥ 3 ms). **SUSPECTED**: p < 0.05 and |Cliff's delta| ≥ 0.147. Otherwise
**NOT_DETECTED**.

Every timing finding carries a **Limitations** line: sample count, environment, and that a
CONFIRMED verdict means the signal exists on the loopback interface — not that it is
exploitable over the internet, which additionally needs a large sample budget and a stable
network position.

## Threshold checks (rate limit / lockout)

Capped at ≤ 15 sequential attempts from one IP. Absence of any throttle in that many
attempts is conclusive for "no throttle". Finding the exact threshold and the reset window
is a deeper engagement and is called out as a limitation.

## Deterministic checks

Signature verification, claim trust, CORS reflection, cookie flags, and error verbosity are
deterministic — one well-formed request each is conclusive. No repetition needed.

## Authorization checks

Always asserted at the **API boundary** — the probe calls the protected endpoint and reads
the status code. Frontend behaviour (a hidden button, a disabled field) is never treated as
evidence.

## The in-process regression suite

`demo/backend/src/__tests__/` re-checks each fix with jest + supertest against an in-memory
MongoDB:

| suite | proves |
|---|---|
| `registration.test.ts` | weak vs strong policy; role-from-body vs ignored; neutral duplicate response |
| `login.test.ts` | happy path both stacks; baseline message oracle; hardened one generic error |
| `timing.test.ts` | baseline known-account slower (Cliff's δ > 0.5); hardened effect size negligible |
| `authz.test.ts` | baseline role-from-register + token forgery; hardened `403`; DB-backed role |
| `ratelimit.test.ts` | baseline no throttle; hardened per-account lock after 5; lock is per-account |
| `token-session.test.ts` | baseline token survives logout + password change; hardened revokes; refresh reuse rejected |
| `regression.test.ts` | both stacks' full flow + response contract intact; no stack trace in hardened errors |

In-process timings are noisier than the socket-level auditor — the regression test asserts on
**effect size** (Cliff's delta) with a generous absolute bound; `npm run audit` is the
authoritative timing measurement.

## Never fabricate

If a probe could not run, it is reported as `INFORMATIONAL` with the reason. Every number in
`findings.json` and `findings.md` is a number that was measured on the run that produced that
file.
