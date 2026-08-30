# Is a timing-mitigation npm package worth publishing?

Short answer: **build it in-repo (done — `packages/constant-time-auth`), do not publish it
yet.** Publish only if it grows past a single function and someone will maintain it.

This document exists because the project brief floated "maybe an npm package" and the
honest thing is to check rather than ship one because the idea was mentioned.

## What the package actually is

One idea, ~40 lines: *always run exactly one password-hash verification per login — against
the real hash if the account exists, against a fixed dummy hash if not* — plus a
`timingSafeStringEqual` that is a thin wrapper over `crypto.timingSafeEqual`.

## The four approaches considered

| Approach | Verdict |
|---|---|
| **Dummy-hash constant work** | The right primary mitigation. Equalises the *work*, not just the wall-clock. This is what the package implements. |
| **Constant-work path more broadly** (equal DB work, equal serialization, etc.) | Correct in principle, but the remaining differences are sub-millisecond and application-specific — not something a library can do for you. Out of scope for a package. |
| **Optional jitter** (random delay on top) | Defence-in-depth only. Included as an off-by-default option, clearly labelled. Adds latency to every login; never a mitigation by itself. |
| **Random / fixed `sleep()` as the fix** | Rejected. Does not equalise the distributions (the real path's time still varies with hash cost and load) and is removable with enough samples. The package must not present this as a solution — and does not. |

## Why NOT publish (now)

1. **It is one function.** The npm ecosystem's lesson on micro-packages (`left-pad`,
   `is-odd`) is that a dependency's cost — supply chain, version churn, audit surface — is
   close to fixed regardless of how small it is. ~40 lines you can read is better vendored.
2. **The valuable part is not the code.** It is the framing: "constant work, not a sleep";
   "this reduces the signal, it does not zero it"; "pair it with a generic error and
   lockout". That travels as documentation (this repo, the `auth-security-hardener` skill),
   not as a bundle.
3. **The pieces already exist.** `crypto.timingSafeEqual` is built in. Every serious hash
   library (`@node-rs/argon2`, `bcrypt`, `argon2`) already ships `hash` + `verify`. The
   package only wires them together.
4. **Maintenance.** A published package implies a support commitment — issues, Node version
   matrix, types, the inevitable "add a Deno build" request. Not worth it for a helper this
   small unless it is on a roadmap.
5. **Correctness risk of a false sense of security.** A package named "constant-time-auth"
   on npm invites cargo-culting: `npm i` it, feel done, skip the generic error and the
   lockout. In-repo with the skill's checklist around it, the context comes with it.

## When publishing WOULD make sense

If the module grows real surface:

- Adapters for common frameworks (Express/Fastify/Nest middleware, a Passport strategy shim).
- Hash-parameter rotation helpers ("your dummy hash no longer matches your cost params —
  regenerate").
- A verified-constant-work test helper other projects can run in CI against their own login.
- Multi-hasher support with per-user `hashAlgo` and upgrade-on-login.

At that point it is a small library with a job, not a one-liner, and a maintainer should
own it.

## What was done instead

- `packages/constant-time-auth/` — the module, with vitest tests and a tinybench benchmark
  that shows the ~25 ms naive oracle collapsing to ~2 ms (and says plainly it is not zero).
- `demo/backend` implements the same pattern directly in
  `hardened.auth.controller.ts` + `password.service.ts` (`getDummyArgon2Hash`), so the demo
  does not depend on the package — the package is the *extractable* version of what the
  demo already does.
- `auth-security-hardener` skill §6 carries the guidance so it is applied on future auth
  code regardless of whether anyone installs anything.

## If Kashif decides to publish anyway

1. Rename to an unscoped or personally-scoped name that is available on npm.
2. Add `engines`, a CI matrix (Node 20/22/24), and a `provenance` publish.
3. Keep the README's "Security considerations" section verbatim — the honesty is the point.
4. `npm publish --access public` from `packages/constant-time-auth` after `npm run build`.
