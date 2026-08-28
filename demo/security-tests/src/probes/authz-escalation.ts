import jwt from "jsonwebtoken";
import type { Finding } from "../harness/finding";
import { nowIso, type Probe } from "./context";

/**
 * Can a normal user reach an admin-only endpoint by controlling a value the
 * server trusts?
 *   1. Register with role:admin in the body.
 *   2. Forge / edit the token's role claim (works if the signing secret is the
 *      known fallback).
 * Every check is made at the API boundary — we call GET /admin/users and look at
 * the status, not at any frontend state.
 */
export const authzEscalationProbe: Probe = async (ctx): Promise<Finding[]> => {
  const { http, stack, target } = ctx;
  const findings: Finding[] = [];
  const adminPath = `/api/${stack}/admin/users`;

  // --- 1. privilege assignment via registration -----------------------------
  const token = ctx.adminAttempt.accessToken;
  let viaRegister: { status: number; body: unknown } = { status: 0, body: null };
  if (token) {
    const res = await http.get(adminPath, { authorization: `Bearer ${token}` });
    viaRegister = { status: res.status, body: res.body };
  }
  const registerEscalated = viaRegister.status === 200;

  findings.push({
    id: "authz-role-from-registration",
    title: "Client-chosen role at registration grants admin access",
    stack,
    verdict: registerEscalated ? "CONFIRMED" : "NOT_DETECTED",
    severity: registerEscalated ? "critical" : "info",
    summary: registerEscalated
      ? `An account created with {"role": "admin"} in the register body can call ` +
        `${adminPath} and gets 200. The server persisted a privilege level the client chose.`
      : `An account that asked for role:admin at registration is refused at ${adminPath} ` +
        `(status ${viaRegister.status}). Role is not taken from client input.`,
    evidence: { adminEndpoint: adminPath, statusWithAdminAttemptToken: viaRegister.status },
    remediation:
      "Never read role/permissions from the registration body. Assign a fixed default " +
      "server-side; change privileges only through a separate, authorised admin flow.",
    limitations: "Deterministic; one request is conclusive.",
    target,
    probe: "authz-escalation",
    ranAt: nowIso(),
  });

  // --- 2. token forgery / claim tampering ---------------------------------
  const userToken = ctx.known.accessToken;
  if (userToken) {
    const decoded = jwt.decode(userToken, { complete: true }) as { payload: Record<string, unknown> } | null;
    const baselineFallback = ctx.config.jwtAccessSecretIsDefault === true;

    // 2a. re-sign with the known fallback secret, flipping role -> admin
    let forgeStatus = -1;
    if (decoded && stack === "baseline" && baselineFallback) {
      const forged = jwt.sign(
        { ...decoded.payload, role: "admin", permissions: ["users:read", "users:write"] },
        "dev-secret",
        { algorithm: "HS256" },
      );
      const res = await http.get(adminPath, { authorization: `Bearer ${forged}` });
      forgeStatus = res.status;
    } else if (decoded) {
      // hardened: we don't know the secret; try re-signing with a guess to show it fails
      const forged = jwt.sign({ ...decoded.payload, role: "admin" }, "dev-secret", { algorithm: "HS256" });
      const res = await http.get(adminPath, { authorization: `Bearer ${forged}` });
      forgeStatus = res.status;
    }

    const forgeWorked = forgeStatus === 200;
    findings.push({
      id: "authz-token-forgery",
      title: "Access token can be forged / its role claim edited",
      stack,
      verdict: forgeWorked ? "CONFIRMED" : baselineFallback && stack === "baseline" ? "SUSPECTED" : "NOT_DETECTED",
      severity: forgeWorked ? "critical" : "info",
      summary: forgeWorked
        ? `A token re-signed with the fallback secret "dev-secret" and role set to "admin" is ` +
          `accepted at ${adminPath} (200). Anyone who reads the source can mint an admin token.`
        : `A token re-signed with a guessed secret is rejected at ${adminPath} (status ${forgeStatus}). ` +
          `Signing key is not the known fallback / algorithm is pinned.`,
      evidence: {
        signingSecretIsKnownFallback: baselineFallback,
        forgedTokenAdminStatus: forgeStatus,
      },
      remediation:
        "Require a strong secret from configuration (fail to boot without one), use " +
        "different secrets for access and refresh, and pin jwt.verify to algorithms: ['HS256'].",
      limitations:
        "The forge test only tries the documented fallback secret; it does not brute-force keys.",
      target,
      probe: "authz-escalation",
      ranAt: nowIso(),
    });

    // 2b. edit the payload WITHOUT re-signing (should always fail on a good impl)
    if (decoded) {
      const [h, , s] = userToken.split(".");
      const tamperedPayload = Buffer.from(
        JSON.stringify({ ...decoded.payload, role: "admin" }),
      ).toString("base64url");
      const tampered = `${h}.${tamperedPayload}.${s}`;
      const res = await http.get(adminPath, { authorization: `Bearer ${tampered}` });
      findings.push({
        id: "authz-unsigned-claim-tamper",
        title: "Token with an edited (unsigned) role claim",
        stack,
        verdict: res.status === 200 ? "CONFIRMED" : "NOT_DETECTED",
        severity: res.status === 200 ? "critical" : "info",
        summary:
          res.status === 200
            ? `A token whose payload was edited to role:admin — signature left untouched — is accepted.`
            : `Editing the payload without re-signing is rejected (status ${res.status}), as expected. ` +
              (stack === "baseline"
                ? `Note the baseline error text: "${readError(res.body)}" leaks why verification failed.`
                : ``),
        evidence: { tamperedTokenAdminStatus: res.status, errorText: readError(res.body) },
        remediation: "No action if rejected. Keep signature verification mandatory.",
        limitations: "Positive control — a correct implementation always rejects this.",
        target,
        probe: "authz-escalation",
        ranAt: nowIso(),
      });
    }
  }

  return findings;
};

function readError(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) return String((body as { error: unknown }).error);
  return typeof body === "string" ? body.slice(0, 120) : "";
}
