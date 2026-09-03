# Hardener checklist — what to review and the direction of the fix

Adapt to the actual architecture; not every item applies. Each ends in the default decision
(→ FIX / RECOMMEND / SKIP), which the review confirms case by case.

## Account enumeration
- **Login timing** — equal work on both paths: verify against a fixed dummy hash when the account
  is not found. Not a `sleep`. → FIX. (Full pattern in `remediation-patterns.md`.)
- **Login response** — one identical status + body for every failed login. → FIX.
- **Registration / password reset** — neutral response that does not confirm existence;
  rate-limit these endpoints. Neutral registration is a UX trade-off → RECOMMEND unless already chosen.
- **Operator injection in the identifier** — schema-validate so it must be a string. → FIX.

## Credential handling
- **Hashing** — Argon2id (m=19456, t=2, p=1) / scrypt / bcrypt cost ≥ 12; add upgrade-on-login
  for an existing weaker hash. → FIX or RECOMMEND by migration size.
- **Policy** — min length 12+, reject a common-password list + the user's own identifier. → FIX.
- **Leakage** — never log/return/embed the plaintext password; redact request bodies. → FIX.

## Brute force
- **IP rate limit** on the auth endpoints. → FIX.
- **Per-account lockout** after N failures (the control that survives a distributed source). → FIX.
- **Lockout-as-DoS** — bound the window; prefer backoff + step-up over a hard lock; scope by
  IP+account where possible. → RECOMMEND (design).

## Tokens / sessions
- **Access token** short-lived (minutes). → FIX if long-lived.
- **Signature** — strong secret required from config, fail to boot without it; separate
  access/refresh secrets; pin `algorithms` on verify; reject `alg:none` and asymmetric→symmetric
  confusion; check `iss`/`aud`. → FIX.
- **Revocation** — a server-side session/`jti` record checked every request, revoked on logout. No
  store at all and revocation is needed → RECOMMEND (new infra).
- **Password change / logout-all** — bump a per-user `tokenVersion` embedded in tokens and revoke
  all sessions. → FIX.
- **Refresh rotation** — rotate on every use; on replay of a rotated token, revoke the family. → FIX.
- **Cookie flags** — refresh token HttpOnly + SameSite=Strict + path-scoped + Secure(prod); access
  token in the body/memory, never a JS-readable cookie. → FIX.
- **Concurrent sessions** — cap or surface active sessions. → RECOMMEND.

## Authorization
- **Decision source** — from server-side state (DB/policy), not a token claim. → FIX.
- **Client-controlled privilege** — registration / profile update must not set role/permissions. → FIX.
- **Ownership** — every "act on resource X" checks X belongs to the caller. → FIX.

## Second-factor & federated (mostly RECOMMEND — design-level)
- **MFA/TOTP** — bounded replay window, high-entropy backup codes, no MFA-skipping side flow.
- **OAuth/OIDC** — enforce `state` + PKCE, strict `redirect_uri` allowlist, ID-token `aud`+`iss`.
- **Magic links / email verification** — single-use, TTL, not logged.
- **Session fixation** — rotate the session id on login / privilege change. → FIX where applicable.

## Password reset (if present)
- Single-use, short-TTL, CSPRNG token; invalidate on use + on password change; neutral response;
  rate-limited; build the link from a trusted host config, not the request Host header. → FIX.

## Transport / config
- **CORS** — explicit origin allowlist; credentials only for those. → FIX.
- **Headers** — helmet (or equivalent). → FIX.
- **Errors** — generic in production; detail logged server-side with a correlation id. → FIX.
- **Secrets** — out of source + repo; `.env.example` with blanks. → FIX / RECOMMEND.
- **SSRF** in reset/callback URLs — validate + allowlist. → FIX where applicable.
- **Dependencies** — flag auth-relevant advisories; upgrade → RECOMMEND if breaking.
