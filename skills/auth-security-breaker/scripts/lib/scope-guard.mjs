// The CLI refuses any target that is not loopback or explicitly allowlisted, and
// refuses a production context. This is the code form of the skill's scope rule.
const ALWAYS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export function checkTargetInScope(target, { allowList = [], nodeEnv = process.env.NODE_ENV } = {}) {
  let url;
  try { url = new URL(target); } catch { return { allowed: false, reason: `"${target}" is not a valid URL` }; }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { allowed: false, reason: `unsupported protocol ${url.protocol}` };
  if (nodeEnv === "production")
    return { allowed: false, reason: "NODE_ENV=production — the auditor will not run in a production context" };
  const host = url.hostname.toLowerCase();
  if (ALWAYS.has(host)) return { allowed: true, reason: `${host} is a loopback address` };
  const list = allowList.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.includes(host) || list.includes(url.origin.toLowerCase()))
    return { allowed: true, reason: `${host} is in the allowlist` };
  return {
    allowed: false,
    reason: `${host} is not loopback and not allowlisted. Set AUTH_LAB_ALLOW_TARGET="${host}" only if you own or are authorised to test it.`,
  };
}

export function assertTargetInScope(target, opts) {
  const d = checkTargetInScope(target, opts);
  if (!d.allowed) { console.error(`\n  x refusing to run: ${d.reason}\n`); process.exit(2); }
  console.log(`  scope check ok — ${d.reason}`);
}
