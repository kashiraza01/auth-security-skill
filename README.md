# 🛡️ Auth Security Skills Lab — Day 7

> Full README is written in Phase 10, once the demo, skills, and audit results exist.
> This is a placeholder so the repo is navigable during the build.

Two Claude Code skills — one that **attacks** an authentication implementation and one
that **hardens** it — run against the same MERN auth codebase, with real test evidence
showing exactly what changed.

- `skills/auth-security-breaker/` — adversarial local auditor
- `skills/auth-security-hardener/` — checklist-driven remediator
- `demo/backend/` — one Express app, paired `/api/baseline/auth/*` (intentionally vulnerable) and `/api/hardened/auth/*`
- `demo/security-tests/` — standalone auditor → `docs/findings.json`
- `demo/frontend/` — Next.js 15 comparison UI
- `packages/constant-time-auth/` — timing-equalisation helper (evaluation in `docs/npm-evaluation.md`)
- `docs/` — architecture, threat model, findings, hardening, security-testing

**This is an educational security lab.** The auditing skill and test suite are for
systems you own or are explicitly authorised to test. See `docs/threat-model.md`.
