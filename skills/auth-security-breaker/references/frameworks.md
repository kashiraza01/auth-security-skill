# Where the auth boundary lives, per framework

For step 3 of the workflow: where to read, and the idiomatic anti-pattern to look for. The fix
side of each is in `auth-security-hardener/references/frameworks.md`.

## Express + Mongoose (Node)
- **Boundary:** route middleware (`app.use`, per-route guards), a `passport`/`jsonwebtoken`
  verify, controller functions.
- **Look for:** `User.findOne({ email: req.body.email })` (operator injection); `jwt.verify(t,
  secret)` with no `algorithms`; role read off `req.user.role` copied from the token; `if (!user)
  return` before `bcrypt.compare` (timing); `cors({ origin: true, credentials: true })`.

## Django / DRF (Python)
- **Boundary:** `authentication_classes` / `permission_classes`, `AbstractUser`,
  `django.contrib.auth`, DRF `SimpleJWT`.
- **Look for:** custom auth backends that trust a header; `IsAuthenticated` without an object-level
  permission; `AllowAny` on a sensitive view; SimpleJWT with a shared `SIGNING_KEY` and no
  rotation; enumeration via `User.objects.get()` raising a distinguishable 404.

## Rails / Devise (Ruby)
- **Boundary:** `before_action :authenticate_user!`, Devise modules, `has_secure_password`,
  Pundit/CanCanCan policies.
- **Look for:** `params.permit!` / mass-assignment reaching `role`; `paranoid = false` (Devise
  reveals whether an email exists on reset); `skip_before_action` on a sensitive controller;
  `authenticate_or_request_with_http_token` trusting an unverified token.

## Go (net/http + chi/gin)
- **Boundary:** middleware wrapping handlers, `golang-jwt` parse, a context-stored user.
- **Look for:** `jwt.Parse` without a keyfunc that checks `token.Method`; role from claims placed
  in context and trusted downstream; `err != nil` early-return before the password compare
  (timing); missing `subtle.ConstantTimeCompare` for tokens.

## Spring Security (Java)
- **Boundary:** `SecurityFilterChain`, `UserDetailsService`, method `@PreAuthorize`, a JWT filter.
- **Look for:** `permitAll()` on the wrong matcher; `@PreAuthorize("hasRole(#role)")` where `role`
  is request-bound; a `JwtDecoder` without issuer/audience validation; `UserDetails` authorities
  taken from the token rather than reloaded.

## Auth.js / NextAuth (Next.js)
- **Boundary:** `callbacks.jwt` / `callbacks.session`, the `authorize()` of a Credentials provider,
  `middleware.ts` matchers.
- **Look for:** `authorize()` returning a user without a constant-work compare; role written into
  the JWT in `callbacks.jwt` and then trusted server-side without a re-check; `middleware.ts`
  matcher that misses an API route; `trustHost`/redirect misconfig.

## Supabase
- **Boundary:** **Row Level Security policies** (the real authz), `auth.uid()`, the service-role key.
- **Look for:** tables with RLS disabled; a policy using a client-set column instead of
  `auth.uid()`; the **service-role key shipped to the client** (bypasses all RLS); enumeration via
  distinct `signUp` errors.

## Firebase Auth
- **Boundary:** **Security Rules**, custom claims, the Admin SDK.
- **Look for:** rules that trust a client-writable field for role; custom claims set from client
  input; `request.auth` assumed non-null; email-enumeration protection left off in the console.

---

**The one fix every stack gets wrong** is the login timing / constant-work path. Its idiomatic
form per stack is in the hardener's `frameworks.md`; the breaker's job is to *measure* it with
`timing-enumeration` regardless of stack — the probe only needs the profile's `login` endpoint.
