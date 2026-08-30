# @auth-lab/constant-time-auth

Equalise the **computational work** of a credential check whether or not the account exists,
so login response time is not an account-existence oracle.

> Part of the [Auth Security Skills Lab](../../). Not published to npm — see
> [`docs/npm-evaluation.md`](../../docs/npm-evaluation.md) for the honest "is this worth
> packaging" write-up. Vendor it or copy the ~40 lines; that is a legitimate choice.

## The problem

```ts
const user = await User.findOne({ email });
if (!user) return fail();                       // returns in ~0 ms
return bcrypt.compare(password, user.hash);     // returns in ~25 ms
```

The two failure paths take very different amounts of time. With enough samples an attacker
tells "this email is registered" from "this email is not" — a list they can feed into
credential stuffing or targeted phishing. (The lab measures a 22 ms median delta on the
vulnerable stack; the benchmark below shows ~25 ms.)

## The fix this library implements

Do **the same work on both paths**: always run exactly one hash verification — against the
real hash if you have one, against a fixed dummy hash of the same shape if you don't.

```ts
import { createConstantTimeVerifier } from "@auth-lab/constant-time-auth";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

const credential = createConstantTimeVerifier({
  hasher: { hash: argonHash, verify: argonVerify },
});
await credential.warmup(); // precompute the dummy hash at boot

// in your login handler:
const user = await User.findOne({ email });
const ok = await credential.verify(user?.passwordHash ?? null, password);
if (!ok) return res.status(401).json({ error: "Invalid email or password" }); // one generic error
// ok === true only when the user exists AND the password matched
```

`verify()` runs one `hasher.verify(...)` call every time. `null` / `undefined` / `""` for the
stored hash all take the dummy-hash path.

### Also included

```ts
import { timingSafeStringEqual } from "@auth-lab/constant-time-auth";

// compare opaque secrets you store/transmit verbatim: reset tokens, verification
// codes, API keys, HMAC digests — constant-time, never a plain ===
if (!timingSafeStringEqual(providedResetToken, storedResetToken)) return fail();
```

## API

| Export | Purpose |
|---|---|
| `createConstantTimeVerifier({ hasher, dummyHash?, jitter? })` | returns `{ verify(storedHash, password), warmup(), getDummyHash() }` |
| `timingSafeStringEqual(a, b)` | constant-time string comparison for opaque secrets |

- `hasher` — `{ hash(pw): Promise<string>, verify(hash, pw): Promise<boolean> }`. Bring your
  own (bcrypt, Argon2, scrypt). `verify` must not throw on a malformed hash (the wrapper
  catches anyway).
- `dummyHash` — supply a precomputed one (same algorithm **and parameters** as your real
  hashes). Omit and one is generated on first use / `warmup()`.
- `jitter: { maxMs }` — optional uniform random delay **after** the verify. Defence-in-depth
  only (see below). Off by default.

## Security considerations

- **This reduces the signal; it does not eliminate it.** The user lookup still runs on both
  paths, and the hash function's own runtime varies with load. The benchmark below takes a
  ~25 ms oracle down to ~2 ms — a fraction of one verify's variance — not to zero. A local
  attacker with a very large sample count may still resolve sub-millisecond structure.
- **It is not a random sleep.** A fixed or random `sleep()` on the "no user" branch does not
  equalise the distributions (the real branch's time still varies) and is removable with
  enough samples. Constant *work* is the mechanism. The optional `jitter` here sits **on top
  of** the constant-work path and is labelled defence-in-depth — never rely on it alone, and
  know it adds latency to every login.
- **The dummy hash must match your real hashes' algorithm and cost parameters**, or the two
  paths diverge again. If you rotate parameters, rotate the dummy hash too (or let it
  regenerate).
- **Not sufficient on its own.** Pair it with: one identical error response for every failed
  login, rate limiting, and per-account lockout. Enumeration also leaks through
  registration and password-reset responses — fix those too.
- **`timingSafeStringEqual`** compares length first. For fixed-length tokens that is not a
  leak. For variable-length secrets, length is observable — prefer comparing fixed-length
  hashes of both sides.

## Benchmark

`npm run bench` (bcryptjs cost 8, tinybench, one machine):

```
case                                              mean (ms)   p99 (ms)
naive · unknown account                            0.000       0.001
naive · known account, wrong password             25.107      37.869
constant-work · unknown account                   23.277      34.288
constant-work · known account, wrong password     20.962      63.914

naive gap (unknown vs known):          25.11 ms   (~one full hash — a clean oracle)
constant-work gap (unknown vs known):   2.31 ms   (~10% of one verify — within its variance)
```

## Test

`npm test` (vitest) — covers: exactly one `verify()` per call regardless of input; `true`
only for real-hash + correct password; dummy hash built once; supplied `dummyHash`; error
swallowing; bounded jitter; `timingSafeStringEqual` equal/unequal/length-mismatch/empty.
