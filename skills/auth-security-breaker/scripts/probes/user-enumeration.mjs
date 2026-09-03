import { ep, credBody } from "../lib/profile.mjs";
import { readError } from "../lib/finding.mjs";

// Enumeration by CONTENT (status/message/shape) and by operator-injection in the
// identifier field.
export async function userEnumerationProbe(ctx) {
  const { http, profile, stack } = ctx;
  const login = ep(profile, "login");
  const findings = [];

  const absent = await http.request({ method: login.method, path: login.path, body: credBody(profile, ctx.absentIdentifier, "wrong-password") });
  const knownBad = await http.request({ method: login.method, path: login.path, body: credBody(profile, ctx.known.identifier, "wrong-password") });
  const absentErr = readError(absent.body), knownErr = readError(knownBad.body);
  const messagesDiffer = absentErr !== knownErr;
  const statusDiffers = absent.status !== knownBad.status;

  findings.push({
    id: "message-user-enumeration",
    title: "Login error message / status differs for unknown vs known account",
    stack,
    verdict: messagesDiffer || statusDiffers ? "CONFIRMED" : "NOT_DETECTED",
    severity: messagesDiffer || statusDiffers ? "medium" : "info",
    cwe: "CWE-204",
    summary: messagesDiffer || statusDiffers
      ? `Different answers by account existence: unknown -> ${absent.status} "${absentErr}", known+wrongpw -> ${knownBad.status} "${knownErr}". A direct oracle, no timing needed.`
      : `Unknown and known-but-wrong-password both return ${absent.status} "${absentErr}". No content oracle.`,
    evidence: { unknownAccount: { status: absent.status, error: absentErr }, knownAccountWrongPassword: { status: knownBad.status, error: knownErr } },
    remediation: "Return one identical response (status + body) for every failed login.",
    limitations: "Deterministic; one request per case is sufficient.",
    target: profile.baseUrl, probe: "user-enumeration", ranAt: new Date().toISOString(),
  });

  // operator injection in the identifier
  const inj = await http.request({ method: login.method, path: login.path, body: { [profile.fields.identifier]: { $ne: null }, [profile.fields.secret]: "wrong-password" } });
  const injErr = readError(inj.body);
  const rejectedAsInput = inj.status === 400 || inj.status === 422;
  const distinguishable = knownErr !== absentErr || knownBad.status !== absent.status;
  const landedOnKnown = injErr === knownErr && inj.status === knownBad.status && distinguishable;

  findings.push({
    id: "nosql-operator-in-identifier",
    title: "Login identifier field accepts a query operator object",
    stack,
    verdict: landedOnKnown ? "CONFIRMED" : rejectedAsInput ? "NOT_DETECTED" : "INFORMATIONAL",
    severity: landedOnKnown ? "high" : "info",
    cwe: "CWE-943",
    summary: landedOnKnown
      ? `Sending {"${profile.fields.identifier}": {"$ne": null}} lands on the "known account, wrong password" branch (${inj.status} "${injErr}"), not the "unknown" one — the operator reached the query.`
      : rejectedAsInput ? `A non-string identifier is rejected as invalid input (${inj.status} "${injErr}").`
      : `A non-string identifier produced ${inj.status} "${injErr}" — the same generic response as any failed login; no observable effect.`,
    evidence: { payload: `{"${profile.fields.identifier}": {"$ne": null}}`, response: { status: inj.status, error: injErr }, knownBranch: { status: knownBad.status, error: knownErr }, unknownBranch: { status: absent.status, error: absentErr } },
    remediation: `Validate the body so ${profile.fields.identifier} must be a string. Never pass a raw request value into a query filter.`,
    limitations: "Confirms the operator reaches the query; does not itself dump data.",
    target: profile.baseUrl, probe: "user-enumeration", ranAt: new Date().toISOString(),
  });

  return findings;
}
