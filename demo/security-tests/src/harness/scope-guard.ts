/**
 * The auditor refuses to run against anything that is not clearly a local /
 * owned / explicitly-authorised target. This is the code form of the rule the
 * breaker skill states in prose: only test systems you own or are authorised to
 * test.
 */

const ALWAYS_ALLOWED = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export interface ScopeDecision {
  allowed: boolean;
  reason: string;
}

export function checkTargetInScope(target: string): ScopeDecision {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { allowed: false, reason: `"${target}" is not a valid URL` };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, reason: `unsupported protocol ${url.protocol}` };
  }

  if (process.env.NODE_ENV === "production") {
    return { allowed: false, reason: "NODE_ENV=production — the auditor will not run in a production context" };
  }

  const host = url.hostname.toLowerCase();

  if (ALWAYS_ALLOWED.has(host)) {
    return { allowed: true, reason: `${host} is a loopback address` };
  }

  // 10.x, 172.16-31.x, 192.168.x, and *.local / *.internal are treated as
  // private lab space but STILL require the operator to opt in explicitly.
  const allowList = (process.env.AUTH_LAB_ALLOW_TARGET ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (allowList.includes(host) || allowList.includes(url.origin.toLowerCase())) {
    return { allowed: true, reason: `${host} is in AUTH_LAB_ALLOW_TARGET` };
  }

  return {
    allowed: false,
    reason:
      `${host} is not loopback and not in AUTH_LAB_ALLOW_TARGET. ` +
      `Set AUTH_LAB_ALLOW_TARGET="${host}" only if you own or are authorised to test it.`,
  };
}

export function assertTargetInScope(target: string): void {
  const decision = checkTargetInScope(target);
  if (!decision.allowed) {
    // eslint-disable-next-line no-console
    console.error(`\n  ✗ refusing to run: ${decision.reason}\n`);
    process.exit(2);
  }
  // eslint-disable-next-line no-console
  console.log(`  scope check ok — ${decision.reason}`);
}
