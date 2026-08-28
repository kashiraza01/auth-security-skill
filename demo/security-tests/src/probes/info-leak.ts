import type { Finding } from "../harness/finding";
import { nowIso, type Probe } from "./context";

/**
 * Cheaper findings that need one request each: verbose error bodies, JS-readable
 * session cookies, and a permissive CORS reflection.
 */
export const infoLeakProbe: Probe = async (ctx): Promise<Finding[]> => {
  const { http, stack, target } = ctx;
  const findings: Finding[] = [];

  // --- verbose errors ---------------------------------------------------
  // Force a server-side error path: register the same email twice.
  const email = `dup-${Date.now()}@lab.test`;
  await http.post(`/api/${stack}/auth/register`, { email, password: "a-perfectly-fine-passphrase" });
  const dup = await http.post(`/api/${stack}/auth/register`, {
    email,
    password: "a-perfectly-fine-passphrase",
  });
  const bodyStr = typeof dup.body === "string" ? dup.body : JSON.stringify(dup.body);
  const leaksStack = /at \w+.*\(.*:\d+:\d+\)/.test(bodyStr) || bodyStr.includes('"stack"');
  const leaksDbInternals = /E11000|MongoServerError|duplicate key|collection:/i.test(bodyStr);

  findings.push({
    id: "verbose-error-responses",
    title: "Error responses leak stack traces / database internals",
    stack,
    verdict: leaksStack || leaksDbInternals ? "CONFIRMED" : "NOT_DETECTED",
    severity: leaksStack || leaksDbInternals ? "medium" : "info",
    summary:
      leaksStack || leaksDbInternals
        ? `A duplicate-registration error returned ${dup.status} with implementation detail in the ` +
          `body (${leaksStack ? "stack trace" : ""}${leaksStack && leaksDbInternals ? " + " : ""}${
            leaksDbInternals ? "Mongo error text" : ""
          }). That hands an attacker your framework, versions, and schema.`
        : `The duplicate-registration error (${dup.status}) is generic — no stack trace, no DB text.`,
    evidence: { status: dup.status, bodyExcerpt: bodyStr.slice(0, 400) },
    remediation:
      "One generic error body in production; log the detail server-side with a correlation id.",
    limitations: "Deterministic.",
    target,
    probe: "info-leak",
    ranAt: nowIso(),
  });

  // --- cookie flags ---------------------------------------------------
  const login = await http.post(`/api/${stack}/auth/login`, {
    email: ctx.known.email,
    password: ctx.known.password,
  });
  const cookies = login.setCookie ?? [];
  const sessionCookies = cookies.filter((c) => /token/i.test(c));
  const jsReadable = sessionCookies.filter((c) => !/httponly/i.test(c));
  const noSameSite = sessionCookies.filter((c) => !/samesite/i.test(c));

  findings.push({
    id: "session-cookie-flags",
    title: "Session cookies are readable by JavaScript / sent cross-site",
    stack,
    verdict: sessionCookies.length === 0 ? "INFORMATIONAL" : jsReadable.length > 0 ? "CONFIRMED" : "NOT_DETECTED",
    severity: jsReadable.length > 0 ? "high" : "info",
    summary:
      sessionCookies.length === 0
        ? `Login set no token cookies (tokens are returned in the body only).`
        : jsReadable.length > 0
          ? `${jsReadable.length} of ${sessionCookies.length} token cookie(s) lack HttpOnly` +
            `${noSameSite.length ? ` and ${noSameSite.length} lack SameSite` : ""}. Any XSS on the ` +
            `origin can read the session; missing SameSite allows cross-site use.`
          : `Token cookies are HttpOnly${noSameSite.length === 0 ? " and carry SameSite" : ""}.`,
    evidence: { setCookie: cookies },
    remediation:
      "Refresh token in an HttpOnly + SameSite=Strict + path-scoped cookie; access token in " +
      "memory only (response body), never in a JS-readable cookie.",
    limitations: "Deterministic.",
    target,
    probe: "info-leak",
    ranAt: nowIso(),
  });

  // --- CORS reflection ----------------------------------------------------
  const evilOrigin = "https://evil.example";
  const cors = await http.request({
    method: "POST",
    path: `/api/${stack}/auth/login`,
    body: { email: ctx.known.email, password: "wrong" },
    headers: { origin: evilOrigin },
  });
  const acao = cors.headers["access-control-allow-origin"];
  const acac = cors.headers["access-control-allow-credentials"];
  const reflectsEvil = acao === evilOrigin || acao === "*";
  const reflectsWithCreds = reflectsEvil && acac === "true";

  findings.push({
    id: "permissive-cors",
    title: "CORS reflects arbitrary origins with credentials",
    stack,
    verdict: reflectsWithCreds ? "CONFIRMED" : reflectsEvil ? "SUSPECTED" : "NOT_DETECTED",
    severity: reflectsWithCreds ? "high" : reflectsEvil ? "low" : "info",
    summary: reflectsWithCreds
      ? `The API echoes Origin: ${evilOrigin} back in Access-Control-Allow-Origin AND sets ` +
        `Allow-Credentials: true. Any website a logged-in user visits can call this API as them.`
      : reflectsEvil
        ? `Access-Control-Allow-Origin came back as "${acao}" for an untrusted origin, but ` +
          `without Allow-Credentials.`
        : `The API did not reflect the untrusted origin (Access-Control-Allow-Origin: ${acao ?? "unset"}).`,
    evidence: { requestOrigin: evilOrigin, accessControlAllowOrigin: acao, accessControlAllowCredentials: acac },
    remediation:
      "Set an explicit CORS origin allowlist; only enable credentials for those exact origins.",
    limitations: "Deterministic.",
    target,
    probe: "info-leak",
    ranAt: nowIso(),
  });

  return findings;
};
