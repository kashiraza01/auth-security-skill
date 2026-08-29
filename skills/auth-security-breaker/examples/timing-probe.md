# Example — how the timing probe is designed and written up

The single most misused check in this space. Here is the method the skill follows, and the
reasoning behind each choice. The code is `demo/security-tests/src/probes/timing-enumeration.ts`
+ `src/harness/stats.ts`.

## The hypothesis

"The login endpoint returns before doing the password hash when the account does not exist,
so a known account with a wrong password takes measurably longer than an unknown account."

Observable: the response-time **distribution** for the two request types.

## The design

| Choice | Why |
|---|---|
| Compare **unknown email** vs **known email + wrong password** | Both are failed logins; the only difference is whether the user record exists. Isolates the "did we run the hash" branch. |
| **Interleave** the two request types (A, B, A, B, …) | Slow drift (GC, CPU scaling, other load) then affects both groups equally and cancels in the comparison. |
| Discard the first ~15% of samples (**warm-up**) | JIT warm-up and first-connection cost inflate early samples. |
| ≥ 40 samples per group (this repo uses 60+) | Enough for a non-parametric test to have power; more is better. |
| Fixed 12 ms gap between requests | Never be the load. Keeps each request's measurement independent-ish. |
| Reset per-account lockout between samples | So every "known account" sample measures the hash path, not a fast "locked" rejection. |

## The analysis

1. **Median, not mean.** HTTP timings are right-skewed; a couple of slow samples wreck the
   mean. Report median and p95.
2. **Cliff's delta** — a distribution-free effect size in [-1, 1]. 0 = the two distributions
   fully overlap; ±1 = complete separation. Thresholds: <0.147 negligible, <0.33 small,
   <0.474 medium, else large.
3. **Mann-Whitney U** with a normal approximation — a significance test that does **not**
   assume normality. Gives a z and a two-sided p.

## The verdict rule

- **CONFIRMED**: Cliff's delta ≥ 0.33 (medium+), p < 0.01, and the absolute median delta is
  materially large (this repo: ≥ 3 ms).
- **SUSPECTED**: p < 0.05 and |Cliff's delta| ≥ 0.147, but not clean enough to call an
  oracle.
- **NOT_DETECTED**: otherwise.

## The write-up rule

State the numbers. Then, in **Limitations**, state what a CONFIRMED verdict does **not**
mean:

> Measured over local HTTP with 60 samples per group and a 12 ms gap. Real attackers contend
> with network jitter and need many more samples. A CONFIRMED verdict here means the signal
> exists on the loopback interface, not that it is trivially exploitable across the internet.

Never write "this proves an attacker can enumerate your users". Write "there is a measurable,
statistically significant timing difference on this interface; exploitation would additionally
require <X>".

## A real result (baseline stack)

```
unknown account:            n=60  median 18.35 ms  p95 19.95 ms
known account + wrong pw:    n=60  median 40.25 ms  p95 47.41 ms
median delta:  21.9 ms
Cliff's delta: 1.00 (large)
Mann-Whitney:  z=-9.45, p ≈ 0
→ CONFIRMED (medium)
```

Same probe, hardened stack:

```
unknown account:            n=60  median 29.82 ms
known account + wrong pw:    n=60  median 29.25 ms
median delta:  -0.57 ms
Cliff's delta: -0.12 (negligible)
Mann-Whitney:  z=-1.14, p = 0.25
→ NOT_DETECTED
```
