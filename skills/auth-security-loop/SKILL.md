---
name: auth-security-loop
version: 1.0.0
description: >-
  Self-evaluating adversarial loop for authentication security. Dispatches an attacker subagent
  and a defender subagent against the same auth codebase — break, fix, re-break — and stops only
  when the break no longer succeeds. Use when asked to "harden this auth until it's clean", "run
  the break-fix loop", "self-improve the auth security", "keep attacking and fixing until it
  holds", or to remediate an auth implementation end to end without hand-holding each round. A
  deterministic referee script decides convergence, regression, and stall — so "it converged" is
  computed, not claimed. Every state change is written back to a DO/DON'T lessons ledger the
  breaker and hardener load on their next run, so the skills compound. It does NOT weaken probes
  to force a pass, never edits the auditor and the implementation in the same iteration, and stops
  immediately on a regression.
---

# auth-security-loop

The orchestrator over `auth-security-breaker` (attack) and `auth-security-hardener` (defend). It
runs them against each other until the audit comes back clean, and it makes the skills better as
it goes: each finding whose state changes becomes a lesson both skills read next time.

## The subagents

- `.claude/agents/auth-breaker.md` — runs the breaker skill. Read + run the probe CLI; does not
  edit application code.
- `.claude/agents/auth-hardener.md` — runs the hardener skill. Edits application code + tests;
  does not touch the auditor.

Atlas (or whoever drives this skill) is the orchestrator; the two agents are the hands.

## The loop

```
iteration 0:  dispatch auth-breaker  -> findings.json ; loop.mjs advance  (baseline snapshot)
repeat (cap N, default 4):
  1. read the referee: which findings are CONFIRMED + SUSPECTED and not yet fixed
  2. dispatch auth-hardener with exactly those findings  -> code + test changes
  3. dispatch auth-breaker again — SAME profile, SAME caps  -> new findings.json
  4. loop.mjs advance --findings=... --stack=<hardened>   (the referee computes the diff)
  5. record a lesson for every finding whose state changed (record-lesson.mjs)
  6. act on the referee's exit code:
        CONVERGED  -> stop, success. Hand back the implementation + convergence report.
        REGRESSION -> STOP NOW. A clean finding broke again. Report it; do not silently re-fix.
        STALLED    -> stop. An iteration changed nothing; escalate the remainder to a human.
        CAP        -> stop. Report what still remains.
        CONTINUE   -> go to step 1.
```

## Hard rules (non-negotiable)

1. **Never weaken a probe to make a finding pass.** The breaker's probes and caps are fixed for
   the duration of a loop. Changing them to get a green is cheating and is a stop condition.
2. **Never edit the auditor and the implementation in the same iteration.** One or the other, so
   every diff is attributable.
3. **A regression stops the loop immediately.** A previously-clean finding coming back CONFIRMED
   is reported, not quietly patched over.
4. **The referee decides convergence, not the agent.** `loop.mjs` reads the findings and returns
   the verdict + exit code. Do not declare "converged" from prose.
5. **Every state change writes a lesson.** `record-lesson.mjs` (validated, no duplicates). Skipping
   this defeats the point — the compounding is the feature.

## Running it (this repo)

```bash
# iteration 0 — baseline
npm run audit -w @auth-lab/security-tests -- --stack=hardened
node skills/auth-security-loop/scripts/loop.mjs advance \
  --findings=docs/findings.json --stack=hardened --max=4

# after each hardener change, re-audit and advance again
npm run audit -w @auth-lab/security-tests -- --stack=hardened
node skills/auth-security-loop/scripts/loop.mjs advance --findings=docs/findings.json --stack=hardened
# then, per changed finding:
node skills/auth-security-loop/scripts/record-lesson.mjs --finding=<id> --iteration=<n> \
  --transition="still-present -> fixed" --worked="..." --do="..." --dont="..."
```

`loop.mjs status` shows where the loop is. State lives in `loop-report.json`.

## Scripts

- `loop.mjs` — the referee: ingest a findings.json, diff vs the previous iteration, decide
  CONVERGED / REGRESSION / STALLED / CAP / CONTINUE, enforce the cap, write `loop-report.json`.
- `lessons-digest.mjs` — emit the accumulated DO / DON'T rules (breaker + hardener load this at
  step 0).
- `record-lesson.mjs` — append a validated lesson (rejects missing DO/DON'T, refuses duplicates).

## Worked example

`examples/loop-run.md` walks a real run: a hardened control is deliberately re-broken, the loop
detects the regression on the next iteration, the hardener closes it, the referee reports
CONVERGED, and a lesson is written.
