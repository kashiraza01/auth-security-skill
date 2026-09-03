# The idiomatic fix, per framework

Pairs with `auth-security-breaker/references/frameworks.md` (where to look). Here: how the fix
looks in each stack. The constant-work login is shown everywhere because it's the one people get
wrong everywhere.

## Express + Mongoose (Node) — this repo
```js
const dummy = await argon2.hash(crypto.randomBytes(24).toString("hex")); // once at boot
const user = await User.findOne({ email });                              // email validated as string
const ok = await argon2.verify(user ? user.passwordHash : dummy, password);
if (!user || !ok) { recordFailure(email); throw new HttpError(401, "Invalid email or password"); }
jwt.verify(token, ACCESS_SECRET, { algorithms: ["HS256"], issuer, audience });   // pinned
requireRole = (role) => async (req,res,next) => (await User.findById(req.auth.userId)).role===role ? next() : res.sendStatus(403);
```

## Django / DRF (Python)
```python
DUMMY = make_password("x")  # module load
user = User.objects.filter(email=email).first()
ok = check_password(password, user.password if user else DUMMY)
if not user or not ok: raise AuthenticationFailed("Invalid credentials")   # one message
# authz: DRF object-level permission, role from user model — never from the token
class IsAdmin(BasePermission):
    def has_permission(self, request, view): return request.user.is_staff
# SimpleJWT: rotate refresh + BLACKLIST_AFTER_ROTATION = True
```

## Rails / Devise (Ruby)
```ruby
config.paranoid = true   # Devise: neutral messages, no enumeration
DUMMY = BCrypt::Password.create("x")
user = User.find_by(email: email)
ok = BCrypt::Password.new(user&.encrypted_password || DUMMY) == password
# authz via Pundit; strong params exclude :role
params.require(:user).permit(:email, :password)   # never :role
```

## Go (net/http)
```go
token, err := jwt.Parse(raw, func(t *jwt.Token) (any, error) {
    if t.Method != jwt.SigningMethodHS256 { return nil, errBadAlg }  // pin
    return secret, nil
})
ok := checkPassword(userOrDummyHash, password)   // always one compare
// tokens: subtle.ConstantTimeCompare for opaque token equality
```

## Spring Security (Java)
```java
// pin algorithm + validate issuer/audience on the JwtDecoder
NimbusJwtDecoder d = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
d.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer));
// authorities reloaded from UserDetailsService, not read from the token
@PreAuthorize("hasRole('ADMIN')")   // role from the reloaded principal
```

## Auth.js / NextAuth (Next.js)
```ts
async authorize(creds) {
  const user = await getUser(creds.email);
  const ok = await verify(user?.hash ?? DUMMY_HASH, creds.password); // constant work
  return user && ok ? { id: user.id } : null;                        // no role here
}
callbacks: { async session({ session, token }) {
  session.user.role = await roleFromDb(token.sub);  // re-derive server-side, don't trust the JWT claim
}}
```

## Supabase
Fix authz in **RLS policies**, keyed on `auth.uid()`, never a client-set column. Enable RLS on
every table. Keep the **service-role key server-side only**. Turn on email-enumeration protection.

## Firebase
Fix authz in **Security Rules** against `request.auth.token` custom claims **set by the Admin SDK**
(never from client input). Assume `request.auth` may be null. Enable email-enumeration protection.
