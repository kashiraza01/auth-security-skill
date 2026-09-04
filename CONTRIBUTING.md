# Contributing

Thanks for looking. This project is a security lab plus three Claude Code skills, so contributions land in one of two places: the **demo** (the MERN auth implementation and its tests) or the **skills** (the methodology, probes, and references that get copied into other people's projects).

Both are open. If you break the hardened stack, that's a contribution and I want the PR. The whole point of publishing the evidence is that someone can check it.

## Ground rules for security testing

Read this before you run anything.

- The breaker's probe CLI only runs against `localhost`, `127.0.0.1`, `::1`, or a host you have explicitly added to `AUTH_LAB_ALLOW_TARGET`. It refuses `NODE_ENV=production` and any target described as production. There is no bypass flag, and a PR that adds one will be closed.
- Probes stay low-volume and sequential. Tens of requests, not thousands. No destructive actions, no persistence, no exfiltration.
- Don't attach evidence from a system you don't own. If you found something against a third party, report it to them, not here.
- If you think you've found a real vulnerability in this repository's own code (not the deliberately vulnerable baseline), open a private security advisory on GitHub rather than a public issue.

## Setup

```bash
git clone <your fork>
cd auth-security-skill
npm install
npm run generate:secrets
```

Node 20 or newer. No database needed, an in-memory MongoDB boots automatically; the first test or audit run downloads a mongod binary (~130 MB) once. Docker is optional: `docker compose up -d` gives you a persistent Mongo, then set `MONGO_URI` in `demo/backend/.env`.

```bash
npm run dev          # API on :4000, UI on :3000/lab
npm run audit        # audits both stacks, writes docs/findings.json
```

## Running the tests

```bash
npm test                                       # everything: 35 backend + 10 package + 24 skill structural
npm run test -w @auth-lab/backend              # jest + supertest against both stacks
npm run test:skills                            # structural checks on all three skill folders
npm run bench -w @auth-lab/constant-time-auth  # the timing-mitigation benchmark
```

`npm test` must be green before a PR is ready. If you changed timing behaviour, run the audit too and paste the before/after numbers into the PR.

## Where things live

| Path | What it is |
|---|---|
| `skills/auth-security-breaker/` | The auditor. `SKILL.md` is a router; depth is in `references/`; the runnable probe CLI is in `scripts/`. |
| `skills/auth-security-hardener/` | The remediator. Checklist, remediation patterns, per-framework notes. |
| `skills/auth-security-loop/` | The orchestration, the referee (`scripts/loop.mjs`), and the lessons ledger. |
| `.claude/agents/auth-*.md` | The two subagents the loop dispatches. |
| `demo/backend/src/controllers/` | `baseline.*` (intentionally vulnerable) and `hardened.*` (the fixed pair). |
| `demo/backend/src/__tests__/` | Security regression tests. |
| `demo/security-tests/` | Thin wrapper that spawns the backend and calls the breaker's `runAudit()`. |
| `demo/frontend/` | The Next.js comparison UI. |
| `docs/` | Architecture, threat model, findings, hardening, security testing methodology. |

Each skill folder is self-contained on purpose. Someone can `cp -r` one into `~/.claude/skills/` and it works with nothing else installed. **Don't add a dependency to `skills/*/scripts/`** — the probe CLI is Node built-ins only (`fetch`, `node:crypto`), and that constraint is a feature.

## Adding a new security check

A check is worth adding if it has an observable an attacker could act on, and evidence a fix can be measured against. Work through it end to end:

1. **Write the probe.** New file in `skills/auth-security-breaker/scripts/probes/`. Read your endpoints and field names from the profile, never hardcode a path. Use `lib/http.js` for timed requests and `lib/stats.js` if you need medians, Cliff's delta, or Mann-Whitney U.
2. **Emit a finding** through `lib/finding.js` so it matches `references/finding.schema.json`. Give it a stable `id`, a severity, the evidence that proves it, and a `limitations` line saying what the result does not prove.
3. **Classify honestly.** CONFIRMED needs a clear reproduction, or for statistical checks: Cliff's delta ≥ 0.33, p < 0.01, and a materially large absolute difference. Anything weaker is SUSPECTED. Never upgrade a verdict for effect, and never call a timing difference "exploitable" without saying what exploitation would require.
4. **Add it to the checklist** in `skills/auth-security-breaker/references/checklist.md`.
5. **Give the baseline something to find.** If the check needs a weakness to detect, add it to `demo/backend/src/controllers/baseline.auth.controller.ts` with a comment saying what's wrong and why a reviewer would miss it.
6. **Fix it on the hardened side**, add the remediation pattern to `skills/auth-security-hardener/references/remediation-patterns.md`, and write a regression test in `demo/backend/src/__tests__/`.
7. **Run `npm run audit`.** The new check should be CONFIRMED on baseline and NOT_DETECTED on hardened. Paste both lines in the PR.

A probe that only ever returns NOT_DETECTED against the demo is fine if it's real, but say in the PR what implementation it does catch.

## Style

- TypeScript in `demo/`, plain `.mjs` with no dependencies in `skills/*/scripts/`.
- Comments explain *why*, especially in the baseline controllers, where the whole point is that the code looks reasonable.
- No mitigation gets described as absolute. Every fix states its residual risk. That rule applies to the skills' own documentation as much as the code.
- Numbers, not adjectives. "19.2 ms median delta, Cliff's delta 1.00" beats "significantly slower".

## Pull requests

Keep one concern per PR. A new probe, a fix, and a docs rewrite are three PRs.

Include: what changed, what you ran, and the numbers if it's a security change. If your PR alters an existing finding's verdict, say so explicitly, because that's the kind of change that quietly makes a lab lie.
