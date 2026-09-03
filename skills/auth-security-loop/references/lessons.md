# Lessons — the self-improvement ledger

Append-only. One entry per finding whose state changed in a loop iteration.
`lessons-digest.mjs` turns the DO / DON'T lines into the rules each breaker and hardener run loads
at step 0. Add entries only via `scripts/record-lesson.mjs` (it validates the format and refuses
duplicates). Seeded from the round-1 build.

## 2026-09-04 · timing-user-enumeration · confirmed → fixed (iteration 1) <!--key:timing-user-enumeration · iteration 1-->
Signal:          median Δ 19.9 ms, Cliff's δ 1.00, Mann-Whitney p ≈ 0 over 60 samples/group
Fix that worked: dummy-hash constant-work verify + one generic 401 for every failed login
Fix that did NOT: sleep(200) on the not-found branch — Δ stayed detectable and is removable with samples
DO:              equalise the WORK on both login paths, then re-measure with the same caps
DON'T:           fix login timing with a fixed or random sleep and call the finding closed

## 2026-09-04 · timing-user-enumeration · measurement-hygiene (iteration 1) <!--key:timing-user-enumeration · iteration 1b-->
Signal:          the timing probe false-read on the hardened stack until throttle state was reset between samples
Fix that worked: reset per-account lockout + IP rate-limit between samples (or shrink the budget when no reset hook)
DO:              reset throttle state between timing samples, or shrink the sample budget below the lockout threshold
DON'T:           let a fast "account locked" 429 pollute a timing measurement of the credential path

## 2026-09-04 · nosql-operator-in-identifier · heuristic-tightening (iteration 1) <!--key:nosql-operator-in-identifier · iteration 1-->
Signal:          the operator-injection probe first flagged the hardened stack because it matched on the error string alone
Fix that worked: only CONFIRM when the injected response lands on the KNOWN branch AND the known/unknown branches are distinguishable
DO:              require the two branches to be observably different before calling an injection "landed"
DON'T:           conclude injection from a generic error that every failed login already returns

## 2026-09-04 · authz-token-forgery · scoping (iteration 1) <!--key:authz-token-forgery · iteration 1-->
Signal:          forgery only works because the baseline signs with a hardcoded fallback secret
Fix that worked: require a strong secret from config, fail to boot without it, separate access/refresh, pin HS256
DO:              treat a guessable/hardcoded signing secret as the root cause behind a forgery finding
DON'T:           report "token forgery" without checking whether the signing secret is actually knowable

## 2026-09-04 · message-user-enumeration · confirmed -> fixed (iteration 1) <!--key:message-user-enumeration · iteration 1-->
Signal:          unknown vs known login returned distinct error strings again
Fix that worked: restore one generic 401 for every failed login branch
Fix that did NOT: branch-specific error text (Incorrect password / No account with that email)
DO:              return one identical status+body for every failed login, whatever the reason
DON'T:           split the login error message by whether the account exists
