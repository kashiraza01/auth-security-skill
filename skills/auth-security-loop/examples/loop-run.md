# Example — a real loop run (regression → fix → converge)

This is an actual acceptance run of the loop, not a mock-up. A hardened control was deliberately
re-broken, and the referee (`loop.mjs`) drove it back to clean.

## Setup — the deliberate re-break

`demo/backend/src/controllers/hardened.auth.controller.ts` normally returns one generic error for
every failed login (the fix for `message-user-enumeration`). For this run, that line was reverted
to a branch-specific message:

```ts
// DELIBERATE REGRESSION
throw new HttpError(401, user ? "Incorrect password" : "No account with that email");
```

## Iteration 0 — breaker + referee

```
$ npm run audit -w @auth-lab/security-tests -- --stack=hardened --samples=25
$ node skills/auth-security-loop/scripts/loop.mjs advance --findings=docs/findings.json --stack=hardened --max=4

  LOOP iteration 0 · stack "hardened" · CONTINUE
   * baseline             message-user-enumeration (NOT_DETECTED -> CONFIRMED)
   1 CONFIRMED remain, 0 regression(s)
   -> dispatch hardener for: message-user-enumeration, then re-run the breaker and advance again.
```

Exit code **40 (CONTINUE)**. The referee saw the re-broken control as a CONFIRMED finding on the
baseline snapshot and told the orchestrator which finding to hand the hardener.

## Iteration 1 — hardener fix + breaker + referee

The `auth-hardener` restores the generic error (the smallest change that closes the finding), then
the breaker re-runs the identical probes:

```
$ npm run audit -w @auth-lab/security-tests -- --stack=hardened --samples=25
$ node skills/auth-security-loop/scripts/loop.mjs advance --findings=docs/findings.json --stack=hardened

  LOOP iteration 1 · stack "hardened" · CONVERGED
   + fixed                message-user-enumeration (CONFIRMED -> NOT_DETECTED)
   0 CONFIRMED remain, 0 regression(s)
   -> STOP. Converged.
```

Exit code **0 (CONVERGED)**. "Converged" is computed by the referee from two `findings.json`
snapshots — not asserted in prose.

## The lesson written back

```
$ node skills/auth-security-loop/scripts/record-lesson.mjs \
    --finding=message-user-enumeration --iteration=1 --transition="confirmed -> fixed" \
    --worked="restore one generic 401 for every failed login branch" \
    --failed="branch-specific error text" \
    --do="return one identical status+body for every failed login, whatever the reason" \
    --dont="split the login error message by whether the account exists"
```

That DO/DON'T now shows up in `lessons-digest.mjs`, which the breaker and hardener load at step 0
of their next run — so the next time anyone touches this code, "don't split the login error by
branch" is already in front of them. That write-back is the point: the loop doesn't just fix the
code, it makes the skills that fixed it a little sharper each time.

## What a regression looks like

If iteration 1 had *introduced* a new CONFIRMED that was clean before, the referee would have
returned exit **20 (REGRESSION)** and stopped immediately — the loop never quietly patches over a
control it just broke. (Covered by the unit test in `tests/skill.test.mjs`.)
