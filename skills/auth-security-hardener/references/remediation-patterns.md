# Remediation patterns

The recurring fixes, with the reasoning and the shape of the change. Framework-specific idioms are
in `frameworks.md`; the worked before/after for the demo is in `../examples/`.

## 1. Constant-work login (timing / user enumeration)

**Wrong:** `if (!user) { await sleep(200); return fail(); }`. A fixed/random sleep does not
equalise the distributions (the real path's time still varies with hash cost + load) and is
removable with enough samples.

**Right:** do the same work on both paths — always run one hash verification, against a fixed **dummy hash** when the account is not found.

```
user = lookup(identifier)
hashToCheck = user ? user.passwordHash : FIXED_DUMMY_HASH   // same algo + params
ok = verify(hashToCheck, password)                          // always exactly one verify
if (!user || !ok) { recordFailure(identifier); return genericError() }  // one 401 for both
```

Precompute `FIXED_DUMMY_HASH` once at boot (same algorithm and cost as real hashes; rotate it when
you rotate params). Optional small jitter is defence-in-depth, labelled as such, never the
mitigation. `packages/constant-time-auth` in this repo is the extractable version.

**Residual to state:** the lookup still runs on both paths and the hash's own runtime varies; the
signal drops orders of magnitude, not to zero. Pair with the generic error + rate limit + lockout.

## 2. Authorization from trusted state, not a claim

Keep four concepts separate: **authentication** (verified identity) → **token claims** (client
data, convenient, not authoritative) → **authorization** (permissions computed server-side from
trusted state, every request) → **enforcement** (the guard in front of the operation).

```
// authenticate: token proves WHO. Put identity on the request, nothing more.
req.auth = { userId: verified.sub, jti: verified.jti }
// authorize: re-derive WHAT from the database.
requireRole(role) => (req) => { user = db.get(req.auth.userId); if (user.role !== role) return 403 }
```

Registration/profile-update must never write `role`/`permissions` from client input.

## 3. Strong, pinned JWTs

Require the secret from config and fail to boot without it; separate access + refresh secrets;
`verify(token, secret, { algorithms: ['HS256'] })`; check `iss`/`aud`; short access TTL. Reject
`alg:none` and asymmetric→symmetric confusion (never feed an RS256 public key in where an HS256
secret is expected — pin the algorithm and the key type).

## 4. Server-side revocation + tokenVersion

Give each token a `jti` bound to a session record checked on every request; revoke on logout.
Embed a per-user `tokenVersion`; bump it on password change / logout-all and reject any token
whose version is stale. This is what makes "log me out everywhere" and "I changed my password
after a compromise" actually mean something.

## 5. Refresh rotation + reuse detection

Rotate the refresh token on every use (revoke the old `jti`, issue a new one). On seeing an
already-rotated refresh token replayed, treat it as theft and revoke the whole family for the user.

## 6. Rate limit + per-account lockout

Two controls, two jobs: an IP-scoped rate limit slows a noisy source; a per-account failure
counter + temporary lock stops a distributed attack on one account. Keep the lock window short and
note the DoS-against-one-account trade-off (`lockout-dos` in the breaker surfaces it).

## 7. Cookies, CORS, headers, errors, logging

Refresh token: `HttpOnly` + `SameSite=Strict` + path-scoped + `Secure` in prod; access token in
the response body / memory only. CORS: an explicit origin allowlist, credentials only for those.
`helmet` (or equivalent). Generic error bodies in production with a correlation id; the detail
logged server-side. Never log the plaintext password; redact request bodies; mask identifiers.

## 8. Password reset (if present)

CSPRNG token (128+ bits), single-use, short TTL, invalidated on use and on password change;
neutral request response; rate-limited; build the reset link from a trusted host config, not the
request `Host` header (host-header poisoning).
