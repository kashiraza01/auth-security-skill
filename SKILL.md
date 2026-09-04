---
name: auth-security-lab
version: 1.0.0
description: >-
  Entry point for the authentication security skillset: auth-security-breaker (audits an auth
  implementation and produces evidence-backed findings), auth-security-hardener (fixes what the
  audit found, one test per fix), and auth-security-loop (runs the two against each other until
  the audit comes back clean, refereed by a script rather than by the agent's own judgement).
  Use this file to decide which of the three to run, in what order, and how to install them.
  Read it when asked to "audit auth", "harden the login", "run the break-fix loop", "set up the
  auth security skills", "which security skill should I use", "is my login leaking account
  existence", or when you have landed in this repository and need to know what it contains.
  All three are scoped to localhost or an explicitly authorised target and refuse production.
---

# auth-security-lab

Three skills that work on authentication code. One attacks it, one fixes it, one runs the first
two against each other until the attack stops working. This file is the map: which one to run,
in what order, and what each is allowed to touch.

It lives at the repository root and is meant to be read, not installed. The three installable
skills are the folders under `skills/`.

Each skill folder under `skills/` is self-contained. No `npm install`, no runtime dependencies,
Node 18+ built-ins only. You can install one, two, or all three.

## Setup

```bash
./scripts/install-skills.sh              # all three + the loop's two subagents, into ~/.claude
./scripts/install-skills.sh --project    # into ./.claude of the current project instead
./scripts/install-skills.sh breaker      # just the auditor
./scripts/install-skills.sh --force      # overwrite an existing install
```

Or copy by hand:

```bash
cp -r skills/auth-security-breaker  ~/.claude/skills/
cp -r skills/auth-security-hardener ~/.claude/skills/
cp -r skills/auth-security-loop     ~/.claude/skills/
cp -r .claude/agents/auth-*.md      ~/.claude/agents/    # only needed for the loop
```

Restart Claude Code after installing. The skills trigger on intent, so ask for the outcome
rather than naming the file: *"audit the auth on localhost:4000"*, *"act on the breaker's
findings"*, *"run the break-fix loop until it holds"*.

## Which one to run

| Situation | Skill | Why |
|---|---|---|
| You want to know what's wrong, and change nothing | `auth-security-breaker` | Read-only against your code, HTTP requests to a loopback or allowlisted target. Safest starting point. |
| You have findings (from the breaker or from a review) and want them fixed | `auth-security-hardener` | Edits auth source in place and adds a test per fix. Review the diff like any PR. |
| You want it audited, fixed, and re-audited without driving each round | `auth-security-loop` | Dispatches the other two as subagents and stops on a computed verdict. |
| You are about to ship an auth change | `auth-security-breaker`, then the hardener on what it finds | Cheapest order. Don't harden what isn't broken. |

The pair is designed to be run in sequence. The breaker writes `findings.json`; the hardener
reads that exact file and fixes only what's in it; the breaker re-runs with the **same profile
and the same caps** and the diff is the result. Changing the probes between runs invalidates
the comparison, and doing it to get a green is the one thing this skillset treats as cheating.

## 1. auth-security-breaker (attack)

Maps the auth attack surface, reads the implementation, then runs a zero-dependency probe CLI
against any auth API described by a JSON target profile.

Eight probe groups: timing enumeration, user enumeration, authorization escalation,
token/session handling, information leakage, brute-force and rate limiting, lockout-as-DoS, and
password reset. Every result is classified **CONFIRMED / SUSPECTED / INFORMATIONAL /
NOT_DETECTED** with the numbers attached. Timing analysis uses repeated measurement, medians,
Cliff's delta for effect size, and Mann-Whitney U for significance, and every timing finding
carries a limitations line saying what the result does not prove.

```bash
cp skills/auth-security-breaker/scripts/profiles/example-generic.json ./mine.json
# fill in your endpoints, field names, and fixtures
node skills/auth-security-breaker/scripts/audit.mjs --profile=./mine.json
```

No probe has a hardcoded path. The profile is what makes them work against Express, Fastify,
NestJS, Django, or anything else that speaks HTTP.

**Touches:** reads your code, makes low-volume sequential HTTP requests, writes `findings.json`.
No edits to your source.

Full workflow: [`skills/auth-security-breaker/SKILL.md`](skills/auth-security-breaker/SKILL.md)

## 2. auth-security-hardener (defend)

Takes the findings, inspects the real architecture, and decides **FIX / RECOMMEND / SKIP** per
item rather than applying a template. FIX items are implemented in place with the smallest
change that preserves the endpoint contract, one concern per change, and a security test for
each. Nothing gets described as "now secure" — every fix states its residual risk, and
RECOMMEND items are handed back as the owner's decision instead of being implemented
unilaterally.

**Touches:** edits your auth source and adds tests. Review the diff.

Full workflow: [`skills/auth-security-hardener/SKILL.md`](skills/auth-security-hardener/SKILL.md)

## 3. auth-security-loop (the loop engine)

The orchestrator. It dispatches `auth-breaker` and `auth-hardener` as subagents against the same
codebase and keeps going until the break no longer works.

```
iteration 0:  breaker runs -> findings.json -> loop.mjs advance   (baseline snapshot)
repeat (cap N, default 4):
  1. read the referee: which findings are CONFIRMED + SUSPECTED and not yet fixed
  2. dispatch the hardener with exactly those findings   -> code + test changes
  3. dispatch the breaker again, SAME profile, SAME caps -> new findings.json
  4. loop.mjs advance --findings=... --stack=<name>      (the referee computes the diff)
  5. record a lesson for every finding whose state changed
  6. act on the referee's exit code:
       CONVERGED  -> stop. Hand back the implementation and the convergence report.
       REGRESSION -> stop immediately. A clean finding broke again. Report it, don't re-fix it.
       STALLED    -> stop. An iteration changed nothing; escalate the remainder to a human.
       CAP        -> stop. Report what remains.
       CONTINUE   -> go to step 1.
```

**The referee decides convergence, not the agent.** `scripts/loop.mjs` reads the findings file,
diffs it against the previous iteration, and returns a verdict plus an exit code. "It converged"
is a computed result, and an agent claiming convergence in prose without it does not count.

Five rules the loop does not bend:

1. Never weaken a probe to make a finding pass. Probes and caps are fixed for the duration.
2. Never edit the auditor and the implementation in the same iteration, so every diff is attributable.
3. A regression stops the loop immediately and gets reported rather than quietly patched.
4. The referee decides convergence.
5. Every state change writes a lesson to the ledger.

That last one is why the skills get better with use. `record-lesson.mjs` appends a validated
DO/DON'T entry for each finding whose state changed, and both the breaker and the hardener load
the digest at step 0 of their next run.

**Touches:** everything the other two touch, plus it runs your server and shell locally.

Full workflow: [`skills/auth-security-loop/SKILL.md`](skills/auth-security-loop/SKILL.md)

## Scope and authorization

Non-negotiable, enforced in code by `skills/auth-security-breaker/scripts/lib/scope-guard.mjs`:

- Targets are limited to `localhost` / `127.0.0.1` / `::1`, or a host listed in the
  `AUTH_LAB_ALLOW_TARGET` environment variable.
- `NODE_ENV=production`, or a target described as production, is refused.
- Probes run low-volume and sequential. Tens of requests, not thousands.
- No destructive actions, no persistence, no exfiltration. The output is a report.
- There is no bypass flag.

If any of those cannot hold for the target in front of you, stop and say so rather than
proceeding.

## Trying it on the bundled lab first

This repository ships a demo so you can see what a real run looks like before pointing the
skills at your own code. One Express app, two auth stacks, same database:

```bash
npm install
npm run generate:secrets
npm run audit          # audits both stacks, writes docs/findings.json, prints the diff
```

Expect **12 CONFIRMED** on `/api/baseline/auth/*` and **0 CONFIRMED** on
`/api/hardened/auth/*`. Written up in [`docs/findings.md`](docs/findings.md), with each fix and
its residual risk in [`docs/hardening.md`](docs/hardening.md).

## Repository map

| Path | What it is |
|---|---|
| `skills/auth-security-breaker/` | The auditor. `SKILL.md` router, `references/`, and the probe CLI in `scripts/`. |
| `skills/auth-security-hardener/` | The remediator. Checklist, remediation patterns, per-framework notes. |
| `skills/auth-security-loop/` | The loop engine: `scripts/loop.mjs` referee, lessons ledger. |
| `.claude/agents/auth-*.md` | The two subagents the loop dispatches. |
| `demo/backend/` | One Express app, two auth stacks, 35 security regression tests. |
| `demo/frontend/` | Next.js comparison UI at `/lab`, wired to a live audit run. |
| `demo/security-tests/` | Thin wrapper that spawns the backend and calls the breaker's `runAudit()`. |
| `packages/constant-time-auth/` | The login-timing mitigation, extracted. |
| `docs/` | architecture · threat-model · findings · hardening · security-testing |

## What this skillset will not tell you

It reports what its probes found on the interface they measured. It does not prove absence of
vulnerabilities, does not cover XSS/CSRF as topics in their own right, network and TLS
configuration, secrets and infrastructure compromise, distributed high-volume attacks, MFA, or
account recovery. A CONFIRMED timing verdict means a measurable difference exists on that
interface, not that it is exploitable across a network. Full boundaries in
[`docs/threat-model.md`](docs/threat-model.md).
