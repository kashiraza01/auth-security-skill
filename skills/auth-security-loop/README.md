# auth-security-loop

The self-evaluating adversarial loop. It dispatches an attacker subagent (`auth-security-breaker`)
and a defender subagent (`auth-security-hardener`) against the same auth codebase — break, fix,
re-break — and stops only when the break no longer succeeds. A deterministic referee decides
convergence, so "it converged" is computed, not claimed. Every finding whose state changes is
written back to a DO/DON'T ledger both skills read next time, so the skills compound.

## Install (standalone)

```bash
cp -r skills/auth-security-loop     ~/.claude/skills/
cp -r skills/auth-security-breaker  ~/.claude/skills/
cp -r skills/auth-security-hardener ~/.claude/skills/
cp -r .claude/agents/auth-breaker.md .claude/agents/auth-hardener.md ~/.claude/agents/
```

The loop needs its two subagents (`.claude/agents/auth-breaker.md`, `auth-hardener.md`) and the
two skills they run.

## Use

Ask for it: "harden this auth until it's clean", "run the break-fix loop", "keep attacking and
fixing until it holds". See [`SKILL.md`](./SKILL.md) for the loop, the hard rules, and the
referee's exit codes; [`examples/loop-run.md`](./examples/loop-run.md) for a real run.

## Scripts

| Script | Job |
|---|---|
| `scripts/loop.mjs` | the referee — diff each iteration vs the last, decide CONVERGED / REGRESSION / STALLED / CAP / CONTINUE, enforce the cap, write `loop-report.json` |
| `scripts/lessons-digest.mjs` | emit the accumulated DO / DON'T rules (breaker + hardener load this at step 0) |
| `scripts/record-lesson.mjs` | append a validated lesson (rejects missing DO/DON'T, refuses duplicates) |

Zero dependencies — Node 18+ built-ins only.

## The hard rules

Never weaken a probe to force a pass · never edit the auditor and the implementation in the same
iteration · a regression stops the loop immediately · the referee decides convergence, not the
agent · every state change writes a lesson. Full text in `SKILL.md`.
