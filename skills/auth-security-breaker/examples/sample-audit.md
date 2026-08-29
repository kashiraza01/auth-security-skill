# Example — full audit report shape

This is the shape of the report the skill produces. Numbers are from a real run of
`demo/security-tests` against `demo/backend`'s baseline stack (see `docs/findings.md` for the
complete, current version).

---

# Authentication Audit — http://localhost:4000/api/baseline/auth — 2026-09-04T05:30:15Z

Scope: loopback only. Caps: 60 timing samples/group (9 warm-up discarded), 12 ms gap;
bruteforce ≤ 12 sequential attempts.
Environment: Node v24.20.0, win32 x64, local HTTP.
Code reviewed: `demo/backend/src/controllers/baseline.auth.controller.ts` @ HEAD

## Findings

### timing-user-enumeration — Login timing reveals whether an account exists
- Verdict: CONFIRMED
- Severity: medium
- What was observed: login for a known account with a wrong password is a median 21.9 ms
  slower than for an unknown account.
- Evidence:
  - unknown account: n=60, median 18.35 ms, p95 19.95 ms
  - known account + wrong password: n=60, median 40.25 ms, p95 47.41 ms
  - median delta 21.9 ms; Cliff's delta 1.00 (large — complete separation);
    Mann-Whitney U z=-9.45, p ≈ 0
- Why it matters: the response time is an oracle for "does this email have an account",
  usable to build a list of valid accounts for credential stuffing or phishing.
- Exploitability: needs many samples per address and a stable network position; trivial on
  loopback, harder but not impossible across a network.
- Remediation: constant-work login — verify against a fixed dummy hash when the user is not
  found; one generic error for both cases. (`auth-security-hardener` §5 / §6.)
- Limitations: 60 samples/group over loopback. A CONFIRMED verdict means the signal exists
  on this interface, not that it is trivially exploitable over the internet.

### authz-role-from-registration — Client-chosen role at registration grants admin access
- Verdict: CONFIRMED
- Severity: critical
- What was observed: an account created with `{"role":"admin"}` in the register body calls
  `GET /api/baseline/admin/users` and receives 200.
- Evidence: register → 201; `GET /admin/users` with that token → 200, returns all users.
- Why it matters: full privilege escalation with no exploit needed — just a field in a JSON
  body.
- Exploitability: immediate. Any anonymous user can self-register as admin.
- Remediation: never read role/permissions from the registration body; assign server-side.
- Limitations: deterministic; one request is conclusive.

### logout-does-not-invalidate-token — Access token still works after logout
- Verdict: CONFIRMED
- Severity: high
- What was observed: after `POST /logout`, the same bearer token returns 200 from `/me`.
- Evidence: login → 200; logout → 200; `GET /me` with the same token → 200.
- Why it matters: a user (or a helpdesk) hitting "log me out everywhere" after a suspected
  compromise does nothing; the stolen token is valid for its full 7-day life.
- Remediation: per-token `jti` bound to a server-side session; revoke on logout.
- Limitations: deterministic.

## Summary
| id | verdict | severity | one-line |
|---|---|---|---|
| authz-role-from-registration | CONFIRMED | critical | role from register body → admin |
| authz-token-forgery | CONFIRMED | critical | fallback secret "dev-secret" → forge admin token |
| logout-does-not-invalidate-token | CONFIRMED | high | token valid after logout |
| no-login-throttling | CONFIRMED | high | no rate limit, no lockout |
| nosql-operator-in-email | CONFIRMED | high | `{"$ne":null}` reaches the query |
| password-change-does-not-revoke-sessions | CONFIRMED | high | old tokens survive password change |
| permissive-cors | CONFIRMED | high | reflects any Origin + credentials |
| refresh-token-reuse | CONFIRMED | high | rotated refresh token replayable |
| session-cookie-flags | CONFIRMED | high | token cookies not HttpOnly |
| message-user-enumeration | CONFIRMED | medium | error text differs by account existence |
| timing-user-enumeration | CONFIRMED | medium | 21.9 ms median delta |
| verbose-error-responses | CONFIRMED | medium | stack traces / Mongo errors in body |
| authz-unsigned-claim-tamper | NOT_DETECTED | info | edited-but-unsigned token rejected (good) |
