---
name: auth-security-breaker
version: 2.0.0
description: >-
  Adversarially audit an authentication implementation on a local / owned / explicitly
  authorised target and produce reproducible, evidence-backed findings. Use when asked to
  "audit auth", "attack the login", "test for user enumeration", "check the auth for
  vulnerabilities", "pen-test the authentication", "is my login timing-safe", "can you break
  this auth". Maps the attack surface, reads the code, runs a zero-dependency probe CLI against
  any auth API described by a target profile, and classifies every result CONFIRMED / SUSPECTED
  / INFORMATIONAL / NOT_DETECTED with the numbers attached. It does NOT harden code (hand that
  to auth-security-hardener), never runs against a target that is not in scope, and never calls
  a timing difference "exploitable" without saying what that would take.
---

# auth-security-breaker

An authorised, local, adversarial auditor for authentication code. It finds the places where
authentication and authorization can be bypassed, abused, or observed, and proves each one with
evidence a fix can be checked against.

The attacker half of a pair. The defender half is `auth-security-hardener`; the loop that runs
them against each other until the break stops working is `auth-security-loop`. Run the breaker,
hand its `findings.json` to the hardener, run the breaker again.

This file is a router. The depth lives in `references/` — load a reference only when the step
you are on needs it.

| You need… | Load |
|---|---|
| The full probe checklist (every weakness class + observable) | `references/checklist.md` |
| How the timing statistics work + how to write them up | `references/timing-methodology.md` |
| The audit-report + findings-JSON format | `references/report-format.md` + `references/finding.schema.json` |
| Per-framework auth boundaries + idiomatic anti-patterns | `references/frameworks.md` |
| What past runs learned (do this / not that) | run `../auth-security-loop/scripts/lessons-digest.mjs` |

## 0. Scope and authorization — the gate

Only run against a target the operator **owns or is explicitly authorised to test**:
`localhost` / `127.0.0.1` / `::1`, or a host they name and confirm is theirs. The CLI enforces
this (`scripts/lib/scope-guard.mjs`): loopback always allowed; anything else must be in
`AUTH_LAB_ALLOW_TARGET`; `NODE_ENV=production` is refused. There is no bypass flag.

Hard rules: low-volume and sequential (tens of requests, not thousands); no destructive actions,
no persistence, no exfiltration; the output is a report, and evidence is the minimum needed to
prove a finding. If any of these cannot hold, stop and say so.

## 1. When to run this

An auth audit of code the operator controls; before a login/registration/session/token/authz
change ships; a specific worry ("are we leaking which emails exist?", "can a user get admin?");
or as the breaker step inside `auth-security-loop`.

## 2. Workflow — ten steps

0. **Load the lessons digest** (`../auth-security-loop/scripts/lessons-digest.mjs`). Start from
   what previous runs learned — the DO / DON'T rules are there so mistakes are not repeated.
1. **Confirm scope** (§0). Record the caps you will use (sample counts, delay, max attempts).
2. **Describe the target as a profile.** Copy `scripts/profiles/example-generic.json`, fill in
   the endpoints, field names, fixtures, and any lab hooks. This is what makes the probes
   target-agnostic — no probe has a hardcoded path.
3. **Read the implementation.** For each endpoint trace input validation → user lookup →
   credential verification → token/session issue → authorization check → error handling →
   logging. Note every place a client-controlled value is trusted. Use `references/frameworks.md`
   for where the boundary lives in this stack.
4. **Form hypotheses** against `references/checklist.md`; note the observable each predicts.
5. **Run the probes:** `node scripts/audit.mjs --profile=<your-profile.json>`. Add
   `--samples=N` for timing power. It writes `findings.json` and prints a table.
6. **Read the evidence, not the verdict.** For timing, open `references/timing-methodology.md`
   and sanity-check the effect size and p-value against the raw samples in the finding.
7. **Classify** each result with §3 (the CLI does this; confirm it is honest — never upgrade a
   verdict for effect).
8. **Rate exploitability** in the finding's `limitations`: what an attacker additionally needs,
   what this proves and what it does not.
9. **Write the report** (`references/report-format.md`) and hand `findings.json` to
   `auth-security-hardener`.
10. **Re-run after hardening** — same profile, same caps — and diff. Inside `auth-security-loop`
    this is automatic; standalone, compare the two `findings.json` files by finding `id`.

## 3. Decision criteria — the four verdicts

| Verdict | Use when |
|---|---|
| **CONFIRMED** | Reproduced with evidence a fix must address. Deterministic checks: one clear reproduction. Statistical checks: Cliff's delta ≥ 0.33, p < 0.01, and a materially large absolute difference. |
| **SUSPECTED** | Real signal, but weak, conditional, or not conclusively exploitable — small effect, marginal significance, or an unverified precondition. Say what would settle it. |
| **INFORMATIONAL** | Worth recording, not a vulnerability alone — a passed positive control, a defence-in-depth gap, a bounded design tradeoff (e.g. lockout-as-DoS). |
| **NOT_DETECTED** | The probe ran and the weakness was absent. Record it — a clean result on a named check is what a re-run compares against. |

Never call a timing difference "exploitable". Call it "a measurable difference on <interface>",
then state in `limitations` what exploitation would require (sample volume, network position, load).

## 4. The probe CLI (`scripts/`)

Zero runtime dependencies — Node 18+ built-ins only (`fetch`, `node:crypto`). Install the whole
skill folder into `~/.claude/skills/` and it runs with nothing else present.

- `audit.mjs` — entry; also exports `runAudit()` for programmatic use (the loop and the demo
  wrapper both call it).
- `lib/` — `http` (timed fetch), `stats` (median/p95, Mann-Whitney U, Cliff's delta),
  `scope-guard`, `profile`, `jwt` (HS256 sign/decode/tamper, no dependency), `finding`, `report`.
- `probes/` — `timing-enumeration`, `user-enumeration`, `authz-escalation`,
  `token-session`, `info-leak`, `password-reset` (fires if the profile declares reset
  endpoints), `bruteforce-ratelimit`, `lockout-dos`.
- `profiles/` — `example-generic.json` (template) + the demo's baseline/hardened profiles.

**Graceful degradation:** with no `resetThrottle` hook the timing probe shrinks its sample
budget to stay under any lockout and records that in `limitations` — it never ships a polluted
measurement.

## 5. Worked example (this repo)

`node scripts/audit.mjs --profile=scripts/profiles/auth-lab-baseline.json` produces, among 12
CONFIRMED: **timing-user-enumeration** (unknown median 18.5 ms vs known 38.3 ms, Cliff's δ 1.00,
p ≈ 0), **authz-role-from-registration** (`{"role":"admin"}` → 200 at the admin route),
**logout-does-not-invalidate-token** (token valid after logout). The hardened profile returns
NOT_DETECTED for all three. Full worked reports in `examples/`.

## 6. Close-out

Deliver the report, CONFIRMED-critical first. Hand `findings.json` to `auth-security-hardener`.
Re-run the exact probes after hardening. The goal is a short list of proven, fixable problems —
never a long list of maybes, and never a claim of absolute security.
