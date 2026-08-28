import type { Finding } from "../harness/finding";
import { nowIso, type Probe } from "./context";

/**
 * Session lifecycle: does logout actually end a session? Does a password change
 * invalidate tokens issued before it? Is a rotated refresh token rejected on
 * reuse?
 */
export const tokenSessionProbe: Probe = async (ctx): Promise<Finding[]> => {
  const { http, stack, target } = ctx;
  const findings: Finding[] = [];
  const base = `/api/${stack}/auth`;

  // Fresh session for the known user.
  const login = await http.post(`${base}/login`, {
    email: ctx.known.email,
    password: ctx.known.password,
  });
  const token = (login.body as { accessToken?: string })?.accessToken;
  const refreshCookie = pickCookie(login.setCookie);

  if (!token) {
    return [
      {
        id: "token-session-setup-failed",
        title: "Could not establish a session to test lifecycle",
        stack,
        verdict: "INFORMATIONAL",
        severity: "info",
        summary: `Login for the known fixture account did not return an access token (status ${login.status}).`,
        evidence: { loginStatus: login.status, body: login.body },
        remediation: "n/a — probe setup issue",
        limitations: "n/a",
        target,
        probe: "token-session",
        ranAt: nowIso(),
      },
    ];
  }

  // --- logout then reuse the access token --------------------------------
  await http.post(`${base}/logout`, {}, {
    authorization: `Bearer ${token}`,
    ...(refreshCookie ? { cookie: refreshCookie } : {}),
  });
  const afterLogout = await http.get(`${base}/me`, { authorization: `Bearer ${token}` });
  const stillValidAfterLogout = afterLogout.status === 200;

  findings.push({
    id: "logout-does-not-invalidate-token",
    title: "Access token still works after logout",
    stack,
    verdict: stillValidAfterLogout ? "CONFIRMED" : "NOT_DETECTED",
    severity: stillValidAfterLogout ? "high" : "info",
    summary: stillValidAfterLogout
      ? `After POST ${base}/logout, the same bearer token still returns 200 from ${base}/me. ` +
        `"Logout" only cleared the client cookie; the token stays valid until it expires.`
      : `After logout the access token is rejected at ${base}/me (status ${afterLogout.status}). ` +
        `The session was invalidated server-side.`,
    evidence: { meStatusAfterLogout: afterLogout.status },
    remediation:
      "Give each token a jti tied to a server-side session record; check it on every " +
      "request; revoke it on logout. Keep access-token lifetime short as defence in depth.",
    limitations: "Deterministic.",
    target,
    probe: "token-session",
    ranAt: nowIso(),
  });

  // --- password change then reuse a token minted before it --------------
  const freshLogin = await http.post(`${base}/login`, {
    email: ctx.known.email,
    password: ctx.known.password,
  });
  const preChangeToken = (freshLogin.body as { accessToken?: string })?.accessToken;
  const preChangeCookie = pickCookie(freshLogin.setCookie);

  if (preChangeToken) {
    const newPassword = "Rotated-" + Date.now() + "-passphrase";
    const changeRes = await http.post(
      `${base}/change-password`,
      { currentPassword: ctx.known.password, newPassword, password: newPassword },
      { authorization: `Bearer ${preChangeToken}`, ...(preChangeCookie ? { cookie: preChangeCookie } : {}) },
    );
    const afterChange = await http.get(`${base}/me`, { authorization: `Bearer ${preChangeToken}` });
    const survived = afterChange.status === 200;

    findings.push({
      id: "password-change-does-not-revoke-sessions",
      title: "Tokens issued before a password change keep working",
      stack,
      verdict: changeRes.status >= 400 ? "INFORMATIONAL" : survived ? "CONFIRMED" : "NOT_DETECTED",
      severity: survived && changeRes.status < 400 ? "high" : "info",
      summary:
        changeRes.status >= 400
          ? `change-password returned ${changeRes.status} ("${readError(changeRes.body)}") — could not complete this check.`
          : survived
            ? `The password was changed, but a token minted before the change still returns 200 at ${base}/me. ` +
              `A stolen token survives the user's "change my password" response to a compromise.`
            : `After the password change, the pre-change token is rejected (status ${afterChange.status}).`,
      evidence: { changeStatus: changeRes.status, meStatusAfterChange: afterChange.status },
      remediation:
        "On password change, bump a per-user tokenVersion embedded in tokens and revoke all " +
        "existing sessions.",
      limitations: "Restores nothing — the fixture account password is left changed for this run.",
      target,
      probe: "token-session",
      ranAt: nowIso(),
    });

    // restore for any later probes in the same run
    ctx.known.password = newPassword;
  }

  // --- refresh token rotation / reuse (hardened is expected to detect) ---
  const rl = await http.post(`${base}/login`, {
    email: ctx.known.email,
    password: ctx.known.password,
  });
  const firstRefresh = pickCookie(rl.setCookie);
  if (firstRefresh) {
    const rotate = await http.post(`${base}/refresh`, {}, { cookie: firstRefresh });
    const rotatedOk = rotate.status === 200;
    // reuse the ORIGINAL refresh cookie again
    const reuse = await http.post(`${base}/refresh`, {}, { cookie: firstRefresh });
    const reuseAccepted = reuse.status === 200;

    findings.push({
      id: "refresh-token-reuse",
      title: "Rotated refresh token can be replayed",
      stack,
      verdict: reuseAccepted ? "CONFIRMED" : "NOT_DETECTED",
      severity: reuseAccepted ? "high" : "info",
      summary: reuseAccepted
        ? `After a successful refresh (rotation), presenting the OLD refresh token again still ` +
          `returns 200. There is no rotation / reuse detection — a stolen refresh token is durable.`
        : `Re-presenting a refresh token that was already rotated is rejected (status ${reuse.status}). ` +
          `Rotation with reuse detection is in place.`,
      evidence: { firstRotationStatus: rotate.status, replayStatus: reuse.status, rotatedOk },
      remediation:
        "Rotate the refresh token on every use, store its jti server-side, and on seeing a " +
        "replayed (already-rotated) token revoke the whole token family for that user.",
      limitations: "Deterministic.",
      target,
      probe: "token-session",
      ranAt: nowIso(),
    });
  }

  return findings;
};

function pickCookie(setCookies: string[]): string | undefined {
  if (!setCookies || setCookies.length === 0) return undefined;
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

function readError(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) return String((body as { error: unknown }).error);
  return typeof body === "string" ? body.slice(0, 120) : "";
}
