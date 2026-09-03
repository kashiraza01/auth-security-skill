// Finding constants + helpers, matching references/finding.schema.json.
export const VERDICT_ORDER = { CONFIRMED: 0, SUSPECTED: 1, INFORMATIONAL: 2, NOT_DETECTED: 3 };
export const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function sortFindings(findings) {
  return [...findings].sort(
    (a, b) =>
      VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.id.localeCompare(b.id),
  );
}

const REQUIRED = ["id", "title", "stack", "verdict", "severity", "summary", "evidence", "remediation", "limitations", "probe"];

/** Validate a finding shape without a JSON-schema dependency. Returns [] or a list of problems. */
export function validateFinding(f) {
  const problems = [];
  for (const k of REQUIRED) if (f[k] === undefined || f[k] === null) problems.push(`missing ${k}`);
  if (f.verdict && !(f.verdict in VERDICT_ORDER)) problems.push(`bad verdict ${f.verdict}`);
  if (f.severity && !(f.severity in SEVERITY_ORDER)) problems.push(`bad severity ${f.severity}`);
  return problems;
}

export function readError(body) {
  if (body && typeof body === "object" && "error" in body) return String(body.error);
  if (body && typeof body === "object" && "message" in body) return String(body.message);
  return typeof body === "string" ? body.slice(0, 160) : JSON.stringify(body).slice(0, 160);
}
