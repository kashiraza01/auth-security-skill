import { sleep } from "../lib/http.mjs";
import { summarise, dropWarmup, cliffsDelta, mannWhitneyU } from "../lib/stats.mjs";
import { ep, credBody } from "../lib/profile.mjs";

// Does login take measurably longer for a known account (wrong password) than an
// unknown one? Interleave the two request types, discard warm-up, compare medians
// + effect size + a non-parametric test. Verdict tops out at "measurable on this
// interface" — never "exploitable".
export async function timingEnumerationProbe(ctx) {
  const { http, profile, stack, opts } = ctx;
  const login = ep(profile, "login");
  const total = opts.timingWarmup + opts.timingSamples;
  const absent = [], knownBad = [];

  for (let i = 0; i < total; i++) {
    if (ctx.resetThrottle && i % 4 === 0) await ctx.resetThrottle();
    const a = await http.request({ method: login.method, path: login.path, body: credBody(profile, ctx.absentIdentifier, "wrong-password-for-timing") });
    absent.push(a.ms);
    await sleep(opts.timingSleepMs);
    const b = await http.request({ method: login.method, path: login.path, body: credBody(profile, ctx.known.identifier, "wrong-password-for-timing") });
    knownBad.push(b.ms);
    await sleep(opts.timingSleepMs);
  }

  const a = dropWarmup(absent, opts.timingWarmup);
  const b = dropWarmup(knownBad, opts.timingWarmup);
  const absS = summarise(a), knownS = summarise(b);
  const medianDeltaMs = knownS.median - absS.median;
  const cd = cliffsDelta(b, a);
  const mw = mannWhitneyU(a, b);

  // When the auditor could not reset throttle, it shrank the budget — say so.
  const degraded = ctx.throttleResetUnavailable;

  let verdict, severity, summary;
  if (mw.p < 0.01 && Math.abs(cd.delta) >= 0.33 && Math.abs(medianDeltaMs) >= 3) {
    verdict = "CONFIRMED"; severity = "medium";
    summary = `Login for a known account (wrong password) is a median ${medianDeltaMs.toFixed(1)} ms slower than for an unknown account. Cliff's delta ${cd.delta.toFixed(2)} (${cd.magnitude}), Mann-Whitney p ${mw.p.toExponential(2)}. Response time is an oracle for account existence.`;
  } else if (mw.p < 0.05 && Math.abs(cd.delta) >= 0.147) {
    verdict = "SUSPECTED"; severity = "low";
    summary = `A small timing difference (median delta ${medianDeltaMs.toFixed(1)} ms, Cliff's delta ${cd.delta.toFixed(2)}) — not large or clean enough to call a reliable oracle here.`;
  } else {
    verdict = "NOT_DETECTED"; severity = "info";
    summary = `No meaningful timing difference (median delta ${medianDeltaMs.toFixed(1)} ms, Cliff's delta ${cd.delta.toFixed(2)}, p ${mw.p.toFixed(3)}). The credential check appears to do equal work either way.`;
  }

  return [{
    id: "timing-user-enumeration",
    title: "Login timing reveals whether an account exists",
    stack, verdict, severity, summary,
    cwe: "CWE-208",
    evidence: {
      unknownAccount: { ...absS, samples: a.map((x) => +x.toFixed(4)) },
      knownAccountWrongPassword: { ...knownS, samples: b.map((x) => +x.toFixed(4)) },
      medianDeltaMs: +medianDeltaMs.toFixed(2),
      cliffsDelta: +cd.delta.toFixed(3), cliffsMagnitude: cd.magnitude,
      mannWhitneyU: { u: mw.u, z: +mw.z.toFixed(3), p: mw.p },
      samplesPerGroup: a.length, warmupDiscarded: opts.timingWarmup, sleepBetweenRequestsMs: opts.timingSleepMs,
    },
    remediation: "Constant work: when the account is not found, still run one password-hash verification against a fixed dummy hash before returning the same generic error. Not a fixed sleep. See packages/constant-time-auth.",
    limitations: `Measured over ${new URL(profile.baseUrl).protocol.startsWith("https") ? "HTTPS" : "local HTTP"} with ${a.length} samples/group, ${opts.timingSleepMs} ms gap${degraded ? " (sample budget reduced because no throttle-reset hook was available)" : ""}. A CONFIRMED verdict means the signal exists on this interface, not that it is exploitable across a network.`,
    target: profile.baseUrl, probe: "timing-enumeration", ranAt: new Date().toISOString(),
  }];
}
