# Architecture

## Repository

```
auth-security-skill/
├── skills/
│   ├── auth-security-breaker/     SKILL.md + README + examples + tests
│   └── auth-security-hardener/    SKILL.md + README + examples + tests
├── demo/
│   ├── backend/                   Express + TS + Mongoose  (one app, two stacks)
│   ├── frontend/                  Next.js 15 comparison UI
│   └── security-tests/            standalone adversarial auditor → docs/findings.json
├── packages/
│   └── constant-time-auth/        extractable timing-equalisation module
└── docs/                          architecture · threat-model · findings · hardening · security-testing · npm-evaluation
```

## The demo backend — one app, two stacks

```mermaid
flowchart TD
  C[client / auditor / UI] --> APP[Express app]
  APP --> LAB["/api/_lab/*  reset · seed · promote · config · source"]
  APP --> B["/api/baseline/auth/*"]
  APP --> H["/api/hardened/auth/*"]

  subgraph B_STACK[baseline stack — intentionally vulnerable]
    B --> BC[baseline.auth.controller]
    BC --> BA[baselineAuthenticate<br/>no alg pin · trusts token role]
    BC --> BZ[baselineRequireAdmin<br/>reads req.auth.tokenRole]
    BC --> PW1[bcrypt cost 8]
    BC --> TK1[JWT · 7d · fallback secret · no jti]
  end

  subgraph H_STACK[hardened stack]
    H --> HRL[rate limit + per-account lockout]
    HRL --> HC[hardened.auth.controller]
    HC --> HA[hardenedAuthenticate<br/>HS256 pinned · jti · tokenVersion]
    HC --> HZ["hardenedRequireRole(role)<br/>DB lookup, not a claim"]
    HC --> PW2[Argon2id · constant-work verify]
    HC --> TK2[JWT · 15m access · jti ↔ Session · rotated refresh]
    HC --> SES[(Session collection<br/>revocation)]
  end

  BC --> DB[(MongoDB<br/>in-memory by default)]
  HC --> DB
  SES --> DB
```

Both route trees are mounted in the **same process** against the **same `User` collection**.
The only differences are the middleware and services each controller calls. This mirrors the
`idor-lab-checks` pattern (paired vulnerable/secure routes) and keeps the comparison honest —
same runtime, same data, same request shapes.

`MONGO_URI` unset → an ephemeral in-memory MongoDB boots automatically (zero setup). Set it
(e.g. to the bundled `docker-compose` Mongo) for persistence.

## The audit flow

```mermaid
flowchart LR
  BL[baseline stack] --> BRK[auth-security-breaker<br/>demo/security-tests]
  BRK --> F1[findings.md<br/>12 CONFIRMED]
  F1 --> HRD[auth-security-hardener]
  HRD --> HS[hardened stack]
  HS --> RT[security tests<br/>demo/backend __tests__]
  RT --> BRK2[breaker re-run]
  BRK2 --> F2[findings.json<br/>0 CONFIRMED · 12 fixed]
```

## The auditor (`demo/security-tests/`)

```
run.ts ── parse args, scope-guard the target, spawn the backend if none is running
  │
  ├── buildContext(stack)  reset → seed/register fixtures → read /_lab/config
  │
  └── for each probe:
        harness/http.ts    timed fetch wrapper
        harness/stats.ts   median · p95 · Mann-Whitney U · Cliff's delta
        probes/
          timing-enumeration   interleaved samples, warm-up discard, effect size
          user-enumeration     status/message/shape diff + NoSQL operator input
          authz-escalation     role-from-register · token re-sign · unsigned tamper
          bruteforce-ratelimit ≤12 sequential attempts, single IP
          token-session        logout · password change · logout-all · refresh reuse
          info-leak            error verbosity · cookie flags · CORS reflection
  │
  └── report.ts  → docs/findings.json + console table + "FIXED BY HARDENING" diff
```

`harness/scope-guard.ts` refuses any target that is not loopback or on an explicit
`AUTH_LAB_ALLOW_TARGET` allowlist, and refuses `NODE_ENV=production`.

## The comparison UI (`demo/frontend/`)

Next.js 15 App Router. `/lab` renders the "Without Security Skill / With Security Skill" split
for each check: real source (served read-only from `/api/_lab/source`), the finding for each
side, and a terminal panel that streams a **live** audit run — every number on screen comes
from an executed probe, never a constant.

## Data model

| collection | used by | purpose |
|---|---|---|
| `users` | both | `email`, `passwordHash`, `hashAlgo`, `role`, `permissions`, `tokenVersion`, `createdVia` |
| `sessions` | hardened only | `userId`, `jti`, `status`, `expiresAt`, `revokedReason` — the revocation list |

Per-account lockout state (`lockout.service.ts`) is in-memory by design — see
`hardening.md` RECOMMEND #1.
