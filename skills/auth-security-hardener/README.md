# auth-security-hardener

A Claude Code skill that reviews an authentication implementation against a checklist,
explains why each issue matters, and implements **targeted, in-place fixes** — no
architectural rewrites — with a security test for every fix.

Pairs with [`auth-security-breaker`](../auth-security-breaker/). Run breaker → hand the
report here → run breaker again.

## Install

```bash
# from a clone of the repo:
cp -r skills/auth-security-hardener ~/.claude/skills/
# or project-scoped:
cp -r skills/auth-security-hardener .claude/skills/
```

Invoke by asking for what it does — "harden the auth", "act on the audit findings", "make
the login timing-safe", "review this auth code for security".

## What it does

1. Locates the authentication and authorization boundaries in the code.
2. Reviews against the checklist ([`SKILL.md`](./SKILL.md) §5) — present / absent / partial,
   with line references.
3. For each issue: one concrete attack sentence, then **FIX / RECOMMEND / SKIP**.
4. Implements the FIX items with the smallest change that keeps the public contract.
5. Adds/updates a security test per FIX (fails before, passes after).
6. Re-reviews and reports **residual risk** for every fix.

## Its discipline

- Smallest change that closes the finding. No framework swaps, no module restructuring, no
  "while I'm here".
- Public contract preserved — same routes, status codes, response shapes — unless a change is
  called out explicitly.
- One concern per change, one test per change.
- Nothing is described as "now secure". Each fix is "this attack no longer works; here is the
  residual".
- RECOMMEND (not silent implementation) for anything needing new infrastructure or an owner
  decision.

## The timing fix, specifically

The skill will **not** accept `await sleep(200)` as the fix for login timing / user
enumeration. The fix is **constant work**: verify against a fixed dummy hash when the account
is not found, one generic error either way. Jitter is allowed only as labelled
defence-in-depth. See `SKILL.md` §6 and `packages/constant-time-auth/`.

## Examples

- [`examples/hardening-report.md`](./examples/hardening-report.md) — the report shape.
- [`examples/constant-work-login.md`](./examples/constant-work-login.md) — before/after for
  the timing fix.

## Structure

- `SKILL.md` — the router (workflow, decision criteria, the two fixes people get wrong)
- `references/` — `checklist.md`, `remediation-patterns.md` (constant-work etc. with code), `frameworks.md` (per-stack idiom), `report-format.md`
- `examples/` — worked hardening report + the constant-work before/after

Standalone: `cp -r skills/auth-security-hardener ~/.claude/skills/` — self-contained, no repo dependency.
