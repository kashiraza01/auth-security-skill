import { sleep } from "../harness/http";
import type { Finding } from "../harness/finding";
import { nowIso, type Probe } from "./context";

/**
 * Low-volume, sequential, single-IP check for throttling on the login endpoint.
 * Deliberately capped (default 12 attempts, 60 ms apart) — this is a "is there a
 * brake pedal", not a real brute-force run.
 */
export const bruteforceRateLimitProbe: Probe = async (ctx): Promise<Finding[]> => {
  const { http, stack, target, opts } = ctx;
  const attempts = Math.min(opts.bruteforceAttempts, 15);

  const statuses: number[] = [];
  let first429At: number | null = null;
  let firstLockAt: number | null = null;

  for (let i = 0; i < attempts; i++) {
    const res = await http.post(`/api/${stack}/auth/login`, {
      email: ctx.known.email,
      password: `wrong-${i}`,
    });
    statuses.push(res.status);
    if (res.status === 429 && first429At === null) first429At = i + 1;
    if (
      firstLockAt === null &&
      typeof res.body === "object" &&
      res.body !== null &&
      /too many|locked/i.test(String((res.body as { error?: string }).error ?? ""))
    ) {
      firstLockAt = i + 1;
    }
    await sleep(60);
  }

  const throttled = first429At !== null || firstLockAt !== null;

  return [
    {
      id: "no-login-throttling",
      title: "Login endpoint has no rate limit or account lockout",
      stack,
      verdict: throttled ? "NOT_DETECTED" : "CONFIRMED",
      severity: throttled ? "info" : "high",
      summary: throttled
        ? `Throttling kicked in: ${
            first429At !== null ? `HTTP 429 after ${first429At} attempts` : ""
          }${first429At !== null && firstLockAt !== null ? " / " : ""}${
            firstLockAt !== null ? `account lock after ${firstLockAt} attempts` : ""
          }.`
        : `All ${attempts} rapid wrong-password attempts against one account returned ${statuses
            .filter((s, idx) => statuses.indexOf(s) === idx)
            .join(", ")} — never 429, never a lockout message. Nothing slows an online ` +
          `password-guessing or credential-stuffing run.`,
      evidence: {
        attempts,
        statusSequence: statuses,
        first429AfterAttempts: first429At,
        firstLockAfterAttempts: firstLockAt,
        intervalMs: 60,
      },
      remediation:
        "Add an IP-scoped rate limit on the auth endpoints (e.g. express-rate-limit) AND a " +
        "per-account failure counter with a temporary lock, so a distributed attack on one " +
        "account is still stopped.",
      limitations:
        `Capped at ${attempts} sequential attempts from one IP — a real assessment would ` +
        `probe the exact threshold and the reset window. Absence of a limit in ${attempts} ` +
        `attempts is still conclusive for "no limit".`,
      target,
      probe: "bruteforce-ratelimit",
      ranAt: nowIso(),
    },
  ];
};
