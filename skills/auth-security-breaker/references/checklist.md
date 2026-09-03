# Breaker checklist — what to probe

Adapt to the actual architecture; not every item applies to every design. Each item lists the
**observable** (how the breaker sees it) and which probe covers it (or "code review" if it is not
auto-probed). Probes live in `../scripts/probes/`.

## Account existence / enumeration
- **Login timing** — unknown account vs known account + wrong password (response-time
  distribution). → `timing-enumeration`
- **Login response content** — status code, error string, body shape differ by existence.
  → `user-enumeration`
- **Registration** — reveals "email already taken"? (status/message/timing) → `info-leak` (dup),
  code review for timing
- **Password reset request** — reveals whether the address exists? → `password-reset` (if profile
  declares `resetRequest`)
- **Operator injection in the identifier** — non-string identifier reaching the query
  (NoSQL `$ne`, SQL, LDAP). → `user-enumeration`

## Credential handling
- **Hash algorithm + parameters** — bcrypt cost, Argon2 m/t/p, or weaker/none (from a hash sample
  or the code). → code review
- **Password policy** — minimum length, obvious-password rejection, username-in-password.
  → code review
- **Plaintext leakage** — password logged, returned, or in an error. → code review + `info-leak`

## Brute force / automation resistance
- **IP rate limit** on the auth endpoints — after how many, what response. → `bruteforce-ratelimit`
- **Per-account lockout** — survives a distributed source. → `bruteforce-ratelimit`
- **Lockout as denial-of-service** — can an attacker lock a victim out? → `lockout-dos`
- **CAPTCHA / step-up** after repeated failure. → code review

## Tokens / sessions
- **Access-token lifetime** — is it long-lived? → code review
- **Signature** — algorithm pinned on verify? secret strength / hardcoded fallback? same secret
  for access + refresh? → `authz-escalation` (forgery), code review
- **alg confusion** — `alg:none` accepted; **asymmetric→symmetric confusion** (RS256 public key
  used as an HS256 secret). → code review (needs an RS256 target to probe live)
- **Claims checked** — `iss` / `aud` / `exp` validated. → code review
- **Server-side revocation** — a session/jti list, or a self-contained irrevocable token?
  → `token-session`
- **Logout** — token still valid afterwards? → `token-session`
- **Password change / logout-all** — prior tokens invalidated? → `token-session`
- **Refresh rotation + reuse detection** — replayed rotated token rejected? → `token-session`
- **Refresh storage** — HttpOnly, SameSite, Secure, path scope. → `info-leak`
- **Concurrent-session limits** — unbounded parallel sessions per user. → code review

## Authorization
- **Decision source** — from a token claim, or server-side state? → `authz-escalation`
- **Client-controlled privilege** — role/permissions settable at registration or profile update.
  → `authz-escalation`
- **Unsigned claim tamper** — edited payload without re-signing (positive control). → `authz-escalation`
- **IDOR-adjacent** — can user A act on user B's session/token/id. → code review

## Second-factor & federated flows (code review unless a live provider is wired)
- **MFA/TOTP** — enrolment integrity, replay window, backup-code entropy, MFA bypass on a
  secondary flow (password reset that skips MFA).
- **OAuth / OIDC** — `state` + PKCE present and checked; strict `redirect_uri` allowlist;
  ID-token `aud` + `iss` validated; mix-up / cross-provider confusion.
- **Magic links** — single-use, TTL, not logged, not guessable.
- **Email verification** — required before privileged actions; token single-use.
- **WebAuthn** — challenge freshness, origin + RP-ID binding, user-verification flag.
- **Session fixation** — session id rotated on privilege change / login. → `token-session` where a
  pre-login session id is observable.

## Password reset (if present)
- Single-use, short-TTL, high-entropy token; invalidated on use and on password change; neutral
  response; rate-limited; **no host-header poisoning** in the reset link. → `password-reset` +
  code review

## Transport / configuration
- **CORS** — origin reflected? credentials allowed for untrusted origins? → `info-leak`
- **Security headers** (helmet-equivalent) on auth responses. → code review
- **Error verbosity** — stack traces, framework versions, DB driver errors. → `info-leak`
- **Secrets** — in source, in the repo, in client-visible config. → code review + `authz-escalation`
- **SSRF** via reset/callback URLs. → code review
- **Dependency advisories** — auth-relevant CVEs (`npm audit`, `pip-audit`, etc.). → code review
