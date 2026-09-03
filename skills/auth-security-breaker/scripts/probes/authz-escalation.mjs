import * as jwt from "../lib/jwt.mjs";
import { ep } from "../lib/profile.mjs";
import { readError } from "../lib/finding.mjs";

// Can a normal user reach an admin-only endpoint by controlling a trusted value?
// 1) role from the registration body  2) token forgery / claim tamper.
export async function authzEscalationProbe(ctx) {
  const { http, profile, stack } = ctx;
  const admin = ep(profile, "adminOnly");
  const findings = [];
  if (!admin) return findings; // nothing to escalate against

  // 1. privilege from registration
  const token = ctx.adminAttempt.accessToken;
  let viaRegisterStatus = 0;
  if (token) viaRegisterStatus = (await http.request({ method: admin.method, path: admin.path, headers: { authorization: `Bearer ${token}` } })).status;
  const registerEscalated = viaRegisterStatus === 200;
  findings.push({
    id: "authz-role-from-registration",
    title: "Client-chosen role at registration grants admin access",
    stack, verdict: registerEscalated ? "CONFIRMED" : "NOT_DETECTED",
    severity: registerEscalated ? "critical" : "info", cwe: "CWE-269",
    summary: registerEscalated
      ? `An account created asking for an admin role can call ${admin.path} and gets 200. The server persisted a privilege the client chose.`
      : `An account that asked for role:admin at registration is refused at ${admin.path} (status ${viaRegisterStatus}).`,
    evidence: { adminEndpoint: admin.path, statusWithAdminAttemptToken: viaRegisterStatus },
    remediation: "Never read role/permissions from the registration body. Assign server-side; change privileges only through a separate authorised flow.",
    limitations: "Deterministic; one request is conclusive.",
    target: profile.baseUrl, probe: "authz-escalation", ranAt: new Date().toISOString(),
  });

  // 2. token forgery + unsigned tamper
  const userToken = ctx.known.accessToken;
  if (userToken) {
    const fallbackKnown = ctx.config.jwtAccessSecretIsDefault === true;
    // re-sign with the documented fallback secret
    let forgeStatus = -1;
    try {
      const forged = jwt.resign(userToken, { [profile.fields.role]: "admin", role: "admin", permissions: ["users:read", "users:write"] }, "dev-secret");
      forgeStatus = (await http.request({ method: admin.method, path: admin.path, headers: { authorization: `Bearer ${forged}` } })).status;
    } catch { /* token not a JWT — skip */ }
    if (forgeStatus !== -1) {
      const forgeWorked = forgeStatus === 200;
      findings.push({
        id: "authz-token-forgery",
        title: "Access token can be forged / its role claim edited",
        stack, verdict: forgeWorked ? "CONFIRMED" : "NOT_DETECTED",
        severity: forgeWorked ? "critical" : "info", cwe: "CWE-347",
        summary: forgeWorked
          ? `A token re-signed with the fallback secret "dev-secret" and role=admin is accepted at ${admin.path} (200). Anyone reading the source can mint an admin token.`
          : `A token re-signed with a guessed secret is rejected at ${admin.path} (status ${forgeStatus}). Signing key is not the known fallback / algorithm is pinned.`,
        evidence: { signingSecretIsKnownFallback: fallbackKnown, forgedTokenAdminStatus: forgeStatus },
        remediation: "Require a strong secret from config (fail to boot without one), separate access/refresh secrets, pin jwt.verify to algorithms: ['HS256'].",
        limitations: "The forge test only tries the documented fallback secret; it does not brute-force keys.",
        target: profile.baseUrl, probe: "authz-escalation", ranAt: new Date().toISOString(),
      });

      // unsigned tamper (positive control — must always fail)
      let tamperStatus = -1;
      try {
        const tampered = jwt.tamperPayload(userToken, { role: "admin", [profile.fields.role]: "admin" });
        const r = await http.request({ method: admin.method, path: admin.path, headers: { authorization: `Bearer ${tampered}` } });
        tamperStatus = r.status;
        findings.push({
          id: "authz-unsigned-claim-tamper",
          title: "Token with an edited (unsigned) role claim",
          stack, verdict: tamperStatus === 200 ? "CONFIRMED" : "NOT_DETECTED",
          severity: tamperStatus === 200 ? "critical" : "info", cwe: "CWE-347",
          summary: tamperStatus === 200
            ? `A token whose payload was edited to role:admin — signature untouched — is accepted.`
            : `Editing the payload without re-signing is rejected (status ${tamperStatus}), as expected.` + (readError(r.body).includes("signature") ? ` Note: error text "${readError(r.body)}" leaks why verification failed.` : ``),
          evidence: { tamperedTokenAdminStatus: tamperStatus, errorText: readError(r.body) },
          remediation: "No action if rejected. Keep signature verification mandatory.",
          limitations: "Positive control — a correct implementation always rejects this.",
          target: profile.baseUrl, probe: "authz-escalation", ranAt: new Date().toISOString(),
        });
      } catch { /* skip */ }
    }
  }
  return findings;
}
