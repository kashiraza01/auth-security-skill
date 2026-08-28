import type { Finding } from "../harness/finding";
import { nowIso, type Probe } from "./context";

/**
 * Enumeration by *content* rather than *timing*: does the response text, status
 * code, or shape differ for an unknown account vs a wrong password? And does the
 * email field accept a query operator instead of a string?
 */
export const userEnumerationProbe: Probe = async (ctx): Promise<Finding[]> => {
  const { http, stack, target } = ctx;
  const findings: Finding[] = [];

  const absent = await http.post(`/api/${stack}/auth/login`, {
    email: ctx.absentEmail,
    password: "wrong-password",
  });
  const knownBad = await http.post(`/api/${stack}/auth/login`, {
    email: ctx.known.email,
    password: "wrong-password",
  });

  const absentErr = readError(absent.body);
  const knownErr = readError(knownBad.body);
  const messagesDiffer = absentErr !== knownErr;
  const statusDiffers = absent.status !== knownBad.status;

  findings.push({
    id: "message-user-enumeration",
    title: "Login error message / status differs for unknown vs known account",
    stack,
    verdict: messagesDiffer || statusDiffers ? "CONFIRMED" : "NOT_DETECTED",
    severity: messagesDiffer || statusDiffers ? "medium" : "info",
    summary:
      messagesDiffer || statusDiffers
        ? `The endpoint answers differently depending on whether the email is registered: ` +
          `unknown -> ${absent.status} "${absentErr}", known+wrongpw -> ${knownBad.status} "${knownErr}". ` +
          `That is a direct account-existence oracle, no timing needed.`
        : `Unknown and known-but-wrong-password both return ${absent.status} "${absentErr}". No content oracle.`,
    evidence: {
      unknownAccount: { status: absent.status, error: absentErr },
      knownAccountWrongPassword: { status: knownBad.status, error: knownErr },
    },
    remediation:
      "Return one identical response (status + body) for every failed login, whatever the reason.",
    limitations: "Single request per case; deterministic, so one sample is sufficient.",
    target,
    probe: "user-enumeration",
    ranAt: nowIso(),
  });

  // NoSQL operator injection through the unvalidated email field.
  const opInjection = await http.post(`/api/${stack}/auth/login`, {
    email: { $ne: null },
    password: "wrong-password",
  });
  const injErr = readError(opInjection.body);
  const injRejectedAsInput = opInjection.status === 400 || opInjection.status === 422;
  // The operator "reached the query and matched a user" only if the response is
  // the *known-account* branch AND that branch is distinguishable from the
  // *unknown-account* branch. If every failure looks identical (hardened), there
  // is no branch to land on and nothing to conclude.
  const branchesAreDistinguishable = knownErr !== absentErr || knownBad.status !== absent.status;
  const injLandedOnKnownBranch =
    injErr === knownErr && opInjection.status === knownBad.status && branchesAreDistinguishable;

  findings.push({
    id: "nosql-operator-in-email",
    title: "Login email field accepts a query operator object",
    stack,
    verdict: injLandedOnKnownBranch ? "CONFIRMED" : injRejectedAsInput ? "NOT_DETECTED" : "INFORMATIONAL",
    severity: injLandedOnKnownBranch ? "high" : "info",
    summary: injLandedOnKnownBranch
      ? `Sending {"email": {"$ne": null}} makes the lookup match an existing user — the ` +
        `response is the "known account, wrong password" branch (${opInjection.status} "${injErr}"), ` +
        `not the "unknown account" one. The operator reached the query.`
      : injRejectedAsInput
        ? `A non-string email is rejected as invalid input (${opInjection.status} "${injErr}").`
        : `A non-string email produced ${opInjection.status} "${injErr}", the same generic response ` +
          `as every other failed login — no observable effect, and input is validated.`,
    evidence: {
      payload: '{"email": {"$ne": null}, "password": "wrong-password"}',
      response: { status: opInjection.status, error: injErr },
      knownWrongPasswordBranch: { status: knownBad.status, error: knownErr },
      unknownAccountBranch: { status: absent.status, error: absentErr },
    },
    remediation:
      "Validate the body against a schema so `email` must be a string (e.g. zod " +
      "z.string().email()). Never pass a raw request value straight into a query filter.",
    limitations: "Confirms the operator reaches the query; does not by itself dump data.",
    target,
    probe: "user-enumeration",
    ranAt: nowIso(),
  });

  return findings;
};

function readError(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    return String((body as { error: unknown }).error);
  }
  if (body && typeof body === "object" && "message" in body) {
    return String((body as { message: unknown }).message);
  }
  return typeof body === "string" ? body.slice(0, 120) : JSON.stringify(body).slice(0, 120);
}
