import { ep, credBody } from "../lib/profile.mjs";
import { readError } from "../lib/finding.mjs";

// Fires only if the profile declares reset endpoints. Checks the two things a
// reset flow most often gets wrong: an enumeration oracle on the request step,
// and low-entropy / guessable reset tokens. Everything else (single-use, TTL,
// host-header poisoning) is a code-review item in references/checklist.md.
export async function passwordResetProbe(ctx) {
  const { http, profile, stack } = ctx;
  const reqEp = ep(profile, "resetRequest");
  if (!reqEp) return []; // no reset flow in this profile — checklist item only

  const findings = [];
  const known = await http.request({ method: reqEp.method, path: reqEp.path, body: { [profile.fields.identifier]: ctx.known.identifier } });
  const absent = await http.request({ method: reqEp.method, path: reqEp.path, body: { [profile.fields.identifier]: ctx.absentIdentifier } });
  const differ = known.status !== absent.status || readError(known.body) !== readError(absent.body);
  findings.push({
    id: "reset-request-enumeration", title: "Password-reset request reveals whether an account exists",
    stack, verdict: differ ? "CONFIRMED" : "NOT_DETECTED", severity: differ ? "medium" : "info", cwe: "CWE-204",
    summary: differ ? `Reset-request answers differently for a known vs unknown address (known ${known.status} "${readError(known.body)}" / unknown ${absent.status} "${readError(absent.body)}").` : `Reset-request returns the same response for known and unknown addresses.`,
    evidence: { known: { status: known.status, body: readError(known.body) }, unknown: { status: absent.status, body: readError(absent.body) } },
    remediation: "Return one neutral 'if the address exists, a link has been sent' response regardless; send the email out of band.",
    limitations: "Deterministic on the request step; token single-use/TTL is a separate code-review item.",
    target: profile.baseUrl, probe: "password-reset", ranAt: new Date().toISOString(),
  });

  // token entropy — only if the profile exposes a lab hook that returns the last token
  if (profile.hooks.lastResetToken) {
    const tokens = [];
    for (let i = 0; i < 5; i++) {
      await http.request({ method: reqEp.method, path: reqEp.path, body: { [profile.fields.identifier]: ctx.known.identifier } });
      const t = await http.get(profile.hooks.lastResetToken);
      if (t.body && t.body.token) tokens.push(String(t.body.token));
    }
    const shortest = tokens.length ? Math.min(...tokens.map((t) => t.length)) : 0;
    const weak = tokens.length >= 2 && (shortest < 20 || tokens.some((t) => /^\d+$/.test(t)));
    findings.push({
      id: "reset-token-entropy", title: "Password-reset token is short or low-entropy",
      stack, verdict: weak ? "CONFIRMED" : tokens.length ? "NOT_DETECTED" : "INFORMATIONAL", severity: weak ? "high" : "info", cwe: "CWE-330",
      summary: weak ? `Reset tokens are short/predictable (shortest ${shortest} chars, sample: ${tokens.slice(0, 2).join(", ")}).` : tokens.length ? `Reset tokens look long and random (min length ${shortest}).` : `Could not sample reset tokens.`,
      evidence: { sampleLengths: tokens.map((t) => t.length), samples: tokens.slice(0, 3) },
      remediation: "128+ bits from a CSPRNG, single-use, short TTL, invalidated on use and on password change.",
      limitations: "Entropy is inferred from length + shape, not a full randomness test.",
      target: profile.baseUrl, probe: "password-reset", ranAt: new Date().toISOString(),
    });
  }
  return findings;
}
