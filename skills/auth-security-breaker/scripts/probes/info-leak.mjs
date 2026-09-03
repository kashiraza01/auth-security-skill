import { ep, credBody } from "../lib/profile.mjs";

// One-request-each checks: verbose errors, JS-readable session cookies, permissive CORS.
export async function infoLeakProbe(ctx) {
  const { http, profile, stack } = ctx;
  const register = ep(profile, "register"), login = ep(profile, "login");
  const findings = [];

  // verbose errors — force a server error path by registering a duplicate
  if (register) {
    const id = `dup-${Date.now()}@lab.test`;
    await http.request({ method: register.method, path: register.path, body: credBody(profile, id, "a-perfectly-fine-passphrase") });
    const dup = await http.request({ method: register.method, path: register.path, body: credBody(profile, id, "a-perfectly-fine-passphrase") });
    const s = typeof dup.body === "string" ? dup.body : JSON.stringify(dup.body);
    const leaksStack = /at \w+.*\(.*:\d+:\d+\)/.test(s) || s.includes('"stack"');
    const leaksDb = /E11000|MongoServerError|duplicate key|SQLSTATE|sequelize|psql|collection:/i.test(s);
    findings.push({
      id: "verbose-error-responses", title: "Error responses leak stack traces / database internals",
      stack, verdict: leaksStack || leaksDb ? "CONFIRMED" : "NOT_DETECTED", severity: leaksStack || leaksDb ? "medium" : "info", cwe: "CWE-209",
      summary: leaksStack || leaksDb ? `A duplicate-registration error (${dup.status}) returned implementation detail (${leaksStack ? "stack trace" : ""}${leaksStack && leaksDb ? " + " : ""}${leaksDb ? "DB error text" : ""}).` : `The duplicate-registration error (${dup.status}) is generic.`,
      evidence: { status: dup.status, bodyExcerpt: s.slice(0, 400) },
      remediation: "Generic error body in production; log detail server-side with a correlation id.",
      limitations: "Deterministic.", target: profile.baseUrl, probe: "info-leak", ranAt: new Date().toISOString(),
    });
  }

  // cookie flags
  const lg = await http.request({ method: login.method, path: login.path, body: credBody(profile, ctx.known.identifier, ctx.known.secret) });
  const cookies = lg.setCookie ?? [];
  const sessionCookies = cookies.filter((c) => /token|session|sid/i.test(c));
  const jsReadable = sessionCookies.filter((c) => !/httponly/i.test(c));
  const noSameSite = sessionCookies.filter((c) => !/samesite/i.test(c));
  findings.push({
    id: "session-cookie-flags", title: "Session cookies are readable by JavaScript / sent cross-site",
    stack, verdict: sessionCookies.length === 0 ? "INFORMATIONAL" : jsReadable.length > 0 ? "CONFIRMED" : "NOT_DETECTED",
    severity: jsReadable.length > 0 ? "high" : "info", cwe: "CWE-1004",
    summary: sessionCookies.length === 0 ? `Login set no session cookies (tokens in the body only).` : jsReadable.length > 0 ? `${jsReadable.length}/${sessionCookies.length} session cookie(s) lack HttpOnly${noSameSite.length ? ` and ${noSameSite.length} lack SameSite` : ""}. XSS can read the session; missing SameSite allows cross-site use.` : `Session cookies are HttpOnly${noSameSite.length === 0 ? " and carry SameSite" : ""}.`,
    evidence: { setCookie: cookies },
    remediation: "Refresh token in HttpOnly + SameSite=Strict + path-scoped cookie; access token in memory only.",
    limitations: "Deterministic.", target: profile.baseUrl, probe: "info-leak", ranAt: new Date().toISOString(),
  });

  // CORS reflection
  const evil = "https://evil.example";
  const cors = await http.request({ method: login.method, path: login.path, body: credBody(profile, ctx.known.identifier, "wrong"), headers: { origin: evil } });
  const acao = cors.headers["access-control-allow-origin"], acac = cors.headers["access-control-allow-credentials"];
  const reflects = acao === evil || acao === "*";
  const withCreds = reflects && acac === "true";
  findings.push({
    id: "permissive-cors", title: "CORS reflects arbitrary origins with credentials",
    stack, verdict: withCreds ? "CONFIRMED" : reflects ? "SUSPECTED" : "NOT_DETECTED", severity: withCreds ? "high" : reflects ? "low" : "info", cwe: "CWE-942",
    summary: withCreds ? `The API echoes Origin: ${evil} in Access-Control-Allow-Origin AND sets Allow-Credentials: true. Any site a logged-in user visits can call it as them.` : reflects ? `Access-Control-Allow-Origin came back "${acao}" for an untrusted origin, without credentials.` : `The API did not reflect the untrusted origin (Access-Control-Allow-Origin: ${acao ?? "unset"}).`,
    evidence: { requestOrigin: evil, accessControlAllowOrigin: acao, accessControlAllowCredentials: acac },
    remediation: "Explicit CORS origin allowlist; credentials only for those origins.",
    limitations: "Deterministic.", target: profile.baseUrl, probe: "info-leak", ranAt: new Date().toISOString(),
  });

  return findings;
}
