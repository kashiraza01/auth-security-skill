import { sleep } from "../lib/http.mjs";
import { ep, credBody, readAccessToken } from "../lib/profile.mjs";

// The flip side of account lockout: can an attacker lock a victim OUT by
// deliberately failing their login? Only meaningful where a lockout exists
// (i.e. no-login-throttling is NOT_DETECTED). Reported INFORMATIONAL — it is a
// known, bounded tradeoff, not a bug — so the picture stays honest.
export async function lockoutDosProbe(ctx) {
  const { http, profile, stack, opts } = ctx;
  const login = ep(profile, "login");
  if (ctx.resetThrottle) await ctx.resetThrottle();

  // burn enough wrong attempts to trip a lock
  let locked = false;
  for (let i = 0; i < Math.min(opts.bruteforceAttempts, 15); i++) {
    const r = await http.request({ method: login.method, path: login.path, body: credBody(profile, ctx.known.identifier, `dos-${i}`) });
    if (r.status === 429) { locked = true; break; }
    await sleep(40);
  }
  if (!locked) return []; // no lockout to weaponise — the no-throttling finding covers that case

  // now the legitimate user tries with the CORRECT password
  const legit = await http.request({ method: login.method, path: login.path, body: credBody(profile, ctx.known.identifier, ctx.known.secret) });
  const deniedLegit = legit.status === 429;
  if (ctx.resetThrottle) await ctx.resetThrottle(); // clean up so later probes are not affected

  return [{
    id: "lockout-denial-of-service", title: "Account lockout can be weaponised to deny a victim access",
    stack, verdict: deniedLegit ? "INFORMATIONAL" : "NOT_DETECTED", severity: "low", cwe: "CWE-645",
    summary: deniedLegit ? `After an attacker triggers the lockout on a victim's account, the victim's CORRECT password is also refused (429). This is the expected, bounded tradeoff of per-account lockout — note it and bound the window.` : `Lockout did not block the legitimate user with the correct password.`,
    evidence: { legitimateLoginStatusWhileLocked: legit.status },
    remediation: "Keep the lock window short; prefer per-account exponential backoff + a CAPTCHA/step-up over a hard lock; scope the lock by IP+account where possible.",
    limitations: "A design tradeoff, not a vulnerability. Reported so the lockout's cost is visible alongside its benefit.",
    target: profile.baseUrl, probe: "lockout-dos", ranAt: new Date().toISOString(),
  }];
}
