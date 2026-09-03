import { sleep } from "../lib/http.mjs";
import { ep, credBody } from "../lib/profile.mjs";
import { readError } from "../lib/finding.mjs";

// Low-volume, single-IP, sequential check for throttling on login. Capped.
export async function bruteforceRateLimitProbe(ctx) {
  const { http, profile, stack, opts } = ctx;
  const login = ep(profile, "login");
  const attempts = Math.min(opts.bruteforceAttempts, 15);
  const statuses = [];
  let first429 = null, firstLock = null;

  for (let i = 0; i < attempts; i++) {
    const res = await http.request({ method: login.method, path: login.path, body: credBody(profile, ctx.known.identifier, `wrong-${i}`) });
    statuses.push(res.status);
    if (res.status === 429 && first429 === null) first429 = i + 1;
    if (firstLock === null && /too many|locked/i.test(readError(res.body))) firstLock = i + 1;
    await sleep(60);
  }
  const throttled = first429 !== null || firstLock !== null;

  return [{
    id: "no-login-throttling",
    title: "Login endpoint has no rate limit or account lockout",
    stack, verdict: throttled ? "NOT_DETECTED" : "CONFIRMED",
    severity: throttled ? "info" : "high", cwe: "CWE-307",
    summary: throttled
      ? `Throttling engaged${first429 !== null ? ` (429 after ${first429})` : ""}${firstLock !== null ? ` (lock after ${firstLock})` : ""}.`
      : `All ${attempts} rapid wrong-password attempts on one account returned ${[...new Set(statuses)].join(", ")} — never 429, never a lock. Nothing slows online guessing or credential stuffing.`,
    evidence: { attempts, statusSequence: statuses, first429AfterAttempts: first429, firstLockAfterAttempts: firstLock, intervalMs: 60 },
    remediation: "IP-scoped rate limit on the auth endpoints AND a per-account failure counter with a temporary lock, so a distributed attack on one account is still stopped.",
    limitations: `Capped at ${attempts} sequential attempts from one IP. Absence of a limit here is conclusive for "no limit"; the exact threshold/reset window would need a deeper run.`,
    target: profile.baseUrl, probe: "bruteforce-ratelimit", ranAt: new Date().toISOString(),
  }];
}
