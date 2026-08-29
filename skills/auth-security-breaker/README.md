# auth-security-breaker

A Claude Code skill that adversarially audits an authentication implementation on a
**local / owned / authorised** target and returns reproducible, evidence-backed findings.

Pairs with [`auth-security-hardener`](../auth-security-hardener/). Run breaker → hand the
report to hardener → run breaker again to confirm.

## Install

Copy the folder into your skills directory:

```bash
cp -r skills/auth-security-breaker ~/.claude/skills/
# or, project-scoped:
cp -r skills/auth-security-breaker .claude/skills/
```

Then invoke it by asking for what it does — "audit the auth on localhost:4000", "test my
login for user enumeration", "act as the breaker against the demo".

## What it does

1. Confirms the target is in scope (loopback / explicit allowlist / not production).
2. Maps the auth endpoints and reads the implementation.
3. Builds one safe probe per hypothesised weakness.
4. Runs them sequentially, low-volume, with warm-up discard and enough samples for the
   statistics to mean something.
5. Classifies each result **CONFIRMED / SUSPECTED / INFORMATIONAL / NOT_DETECTED** with the
   numbers attached.
6. On a re-run, marks each finding `fixed` / `still-present` / `partially-addressed` /
   `regression`.

See [`SKILL.md`](./SKILL.md) for the full workflow, checklist, decision criteria, and report
format.

## Scope rules (non-negotiable)

- Only `localhost` / `127.0.0.1` / `::1` / a host on an explicit operator-set allowlist.
- Refuses `NODE_ENV=production` or a target described as production.
- Sequential, low-volume, no destructive actions, no persistence, no exfiltration.
- Output is a report. Evidence is the minimum needed to prove a finding.

## Reference implementation

`demo/security-tests/` in this repo is this skill's workflow written as code — the harness
(`stats.ts`, `scope-guard.ts`), the probes, and the report writer. Use it directly
(`npm run audit`) or as a model for a probe in another language.

## Examples

See [`examples/sample-audit.md`](./examples/sample-audit.md) for a full report shape and
[`examples/timing-probe.md`](./examples/timing-probe.md) for how the timing analysis is done
and written up.
