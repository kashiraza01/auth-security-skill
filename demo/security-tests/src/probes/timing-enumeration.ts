import { sleep } from "../harness/http";
import {
  cliffsDelta,
  dropWarmup,
  mannWhitneyU,
  summarise,
} from "../harness/stats";
import type { Finding } from "../harness/finding";
import { nowIso, type Probe } from "./context";

/**
 * Does the login endpoint take a measurably different amount of time for an
 * unknown account versus a known account with a wrong password?
 *
 * Method:
 *  - interleave the two request types so slow drift cancels out
 *  - discard warm-up samples
 *  - compare medians (robust), Cliff's delta (effect size), Mann-Whitney U
 *    (non-parametric significance)
 *
 * The verdict tops out at "there is a measurable difference over HTTP on this
 * host". It is not a claim that the difference is remotely exploitable — that
 * depends on network jitter, load, and how many samples an attacker can take.
 */
export const timingEnumerationProbe: Probe = async (ctx): Promise<Finding[]> => {
  const { http, stack, target, opts } = ctx;
  const total = opts.timingWarmup + opts.timingSamples;

  const absent: number[] = [];
  const knownBad: number[] = [];

  for (let i = 0; i < total; i++) {
    // Keep the known account out of lockout so every sample measures the
    // credential-verification path, not a fast "locked" rejection. No-op on the
    // baseline stack (it has no lockout).
    if (i % 4 === 0) {
      await http.post(`/api/_lab/reset-lockouts`).catch(() => undefined);
    }

    const a = await http.post(`/api/${stack}/auth/login`, {
      email: ctx.absentEmail,
      password: "wrong-password-for-timing",
    });
    absent.push(a.ms);
    await sleep(opts.timingSleepMs);

    const b = await http.post(`/api/${stack}/auth/login`, {
      email: ctx.known.email,
      password: "wrong-password-for-timing",
    });
    knownBad.push(b.ms);
    await sleep(opts.timingSleepMs);
  }

  const absS = summarise(dropWarmup(absent, opts.timingWarmup));
  const knownS = summarise(dropWarmup(knownBad, opts.timingWarmup));
  const a = dropWarmup(absent, opts.timingWarmup);
  const b = dropWarmup(knownBad, opts.timingWarmup);

  const medianDeltaMs = knownS.median - absS.median;
  const cd = cliffsDelta(b, a); // positive => known-account requests are slower
  const mw = mannWhitneyU(a, b);

  const significant = mw.p < 0.01;
  const meaningfulEffect = Math.abs(cd.delta) >= 0.33; // medium or large
  const bigAbsolute = Math.abs(medianDeltaMs) >= 3;

  let verdict: Finding["verdict"];
  let severity: Finding["severity"];
  let summary: string;
  if (significant && meaningfulEffect && bigAbsolute) {
    verdict = "CONFIRMED";
    severity = "medium";
    summary =
      `Login responses for a known account (wrong password) are consistently ` +
      `${medianDeltaMs.toFixed(1)} ms slower (median) than for an unknown account. ` +
      `Effect size Cliff's delta ${cd.delta.toFixed(2)} (${cd.magnitude}), ` +
      `Mann-Whitney p ${mw.p.toExponential(2)}. The response time is an oracle for ` +
      `"does this email have an account".`;
  } else if (mw.p < 0.05 && Math.abs(cd.delta) >= 0.147) {
    verdict = "SUSPECTED";
    severity = "low";
    summary =
      `A small timing difference was seen (median delta ${medianDeltaMs.toFixed(1)} ms, ` +
      `Cliff's delta ${cd.delta.toFixed(2)}), but it is not large or clean enough on this ` +
      `host to call a reliable oracle.`;
  } else {
    verdict = "NOT_DETECTED";
    severity = "info";
    summary =
      `No meaningful timing difference between known and unknown accounts ` +
      `(median delta ${medianDeltaMs.toFixed(1)} ms, Cliff's delta ${cd.delta.toFixed(2)}, ` +
      `p ${mw.p.toFixed(3)}). The credential check appears to do equal work either way.`;
  }

  return [
    {
      id: "timing-user-enumeration",
      title: "Login timing reveals whether an account exists",
      stack,
      verdict,
      severity,
      summary,
      evidence: {
        unknownAccount: absS,
        knownAccountWrongPassword: knownS,
        medianDeltaMs: Number(medianDeltaMs.toFixed(2)),
        cliffsDelta: Number(cd.delta.toFixed(3)),
        cliffsMagnitude: cd.magnitude,
        mannWhitneyU: { u: mw.u, z: Number(mw.z.toFixed(3)), p: mw.p },
        samplesPerGroup: a.length,
        warmupDiscarded: opts.timingWarmup,
        sleepBetweenRequestsMs: opts.timingSleepMs,
      },
      remediation:
        "Do equal work on both paths: when the account is not found, still run one " +
        "password-hash verification against a fixed dummy hash before returning the " +
        "same generic error. Do not rely on a fixed sleep as the primary defence — " +
        "see packages/constant-time-auth.",
      limitations:
        `Measured over local HTTP with ${a.length} samples per group and a ` +
        `${opts.timingSleepMs} ms gap. Real attackers contend with network jitter and ` +
        `need many more samples. A CONFIRMED verdict here means the signal exists on ` +
        `the loopback interface, not that it is trivially exploitable across the internet.`,
      target,
      probe: "timing-enumeration",
      ranAt: nowIso(),
    },
  ];
};
