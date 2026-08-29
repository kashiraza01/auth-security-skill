# Example — the constant-work login fix (before / after)

The fix `auth-security-hardener` applies for login timing / user enumeration. The wrong fix
(a fixed `sleep`) and why it is wrong is in `SKILL.md` §6.

## Before — `baseline.auth.controller.ts`

```ts
const user = await User.findOne({ email });

// Unknown account: return now — one indexed lookup, no hash. ~2 ms.
if (!user) {
  return res.status(401).json({ error: "No account found with that email address" });
}

// Known account: fall through to bcrypt.compare. ~20-40 ms.
const ok = await baselineCompare(String(password ?? ""), user.passwordHash);
if (!ok) {
  return res.status(401).json({ error: "Incorrect password" });
}
```

Two tells:
1. **Timing** — the `if (!user) return` short-circuits before the hash, so the two failure
   paths take very different amounts of time (measured: 21.9 ms median delta).
2. **Content** — the error strings differ ("No account found" vs "Incorrect password"), which
   is an oracle even without timing.

## After — `hardened.auth.controller.ts`

```ts
const user = await User.findOne({ email });

// Always verify one hash. Real hash if the user exists; a fixed, pre-computed
// dummy hash (same algorithm + parameters) if not.
const hashToCheck = user ? user.passwordHash : await getDummyArgon2Hash();
const passwordOk = await hardenedVerify(hashToCheck, password);

if (!user || !passwordOk) {
  recordFailure(email);                       // feeds per-account lockout
  throw new HttpError(401, "Invalid email or password");  // identical for both
}
```

`getDummyArgon2Hash()` (in `password.service.ts`) computes one Argon2id hash of a random
string at module load and caches it, so the "no user" path runs the same
`argon2.verify(...)` call as the "user exists" path.

## Proof — `__tests__/timing.test.ts`

```ts
it("hardened login: no meaningful timing difference between known and unknown", async () => {
  const known = await seedHardenedUser();
  const samples = { known: [] as number[], unknown: [] as number[] };

  for (let i = 0; i < 60; i++) {
    samples.unknown.push(await timeLogin("nobody@x.test", "wrong"));
    samples.known.push(await timeLogin(known.email, "wrong"));
  }
  const a = samples.unknown.slice(10);
  const b = samples.known.slice(10);

  const deltaMs = Math.abs(median(b) - median(a));
  const { delta } = cliffsDelta(a, b);

  expect(deltaMs).toBeLessThan(8);            // threshold, not an exact value
  expect(Math.abs(delta)).toBeLessThan(0.33); // effect size below "medium"
});
```

Threshold + effect-size assertions, never `expect(ms).toBe(...)`.

## Residual risk (always stated)

The user lookup still runs on both paths, and Argon2's own runtime varies slightly with
system load. A local attacker taking a very large number of samples might still resolve
sub-millisecond structure. Constant work reduces the signal from ~22 ms to sub-millisecond —
it does not eliminate it. `packages/constant-time-auth` also offers optional jitter as
labelled defence-in-depth, not as the mitigation.
