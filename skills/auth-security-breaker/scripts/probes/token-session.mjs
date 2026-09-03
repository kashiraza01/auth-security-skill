import { ep, credBody, readAccessToken } from "../lib/profile.mjs";
import { pickCookie } from "../lib/http.mjs";
import { readError } from "../lib/finding.mjs";

// Session lifecycle: logout invalidation, password-change invalidation, refresh reuse.
export async function tokenSessionProbe(ctx) {
  const { http, profile, stack } = ctx;
  const login = ep(profile, "login"), me = ep(profile, "me"), logout = ep(profile, "logout");
  const changePw = ep(profile, "changePassword"), refresh = ep(profile, "refresh");
  const findings = [];
  if (!login || !me) return findings;

  const first = await http.request({ method: login.method, path: login.path, body: credBody(profile, ctx.known.identifier, ctx.known.secret) });
  const token = readAccessToken(profile, first.body);
  const cookie = pickCookie(first.setCookie);
  if (!token) {
    return [{
      id: "token-session-setup-failed", title: "Could not establish a session to test lifecycle",
      stack, verdict: "INFORMATIONAL", severity: "info",
      summary: `Login for the known fixture did not return an access token (status ${first.status}).`,
      evidence: { loginStatus: first.status, body: first.body },
      remediation: "n/a", limitations: "n/a", target: profile.baseUrl, probe: "token-session", ranAt: new Date().toISOString(),
    }];
  }

  // logout then reuse
  if (logout) {
    await http.request({ method: logout.method, path: logout.path, headers: { authorization: `Bearer ${token}` }, cookie });
    const after = await http.request({ method: me.method, path: me.path, headers: { authorization: `Bearer ${token}` } });
    const stillValid = after.status === 200;
    findings.push({
      id: "logout-does-not-invalidate-token", title: "Access token still works after logout",
      stack, verdict: stillValid ? "CONFIRMED" : "NOT_DETECTED", severity: stillValid ? "high" : "info", cwe: "CWE-613",
      summary: stillValid ? `After logout, the same bearer token still returns 200 from ${me.path}. Logout only cleared the client cookie.` : `After logout the token is rejected at ${me.path} (status ${after.status}).`,
      evidence: { meStatusAfterLogout: after.status },
      remediation: "jti tied to a server-side session, checked every request, revoked on logout. Keep access-token lifetime short as defence in depth.",
      limitations: "Deterministic.", target: profile.baseUrl, probe: "token-session", ranAt: new Date().toISOString(),
    });
  }

  // password change invalidation
  if (changePw) {
    const relog = await http.request({ method: login.method, path: login.path, body: credBody(profile, ctx.known.identifier, ctx.known.secret) });
    const preToken = readAccessToken(profile, relog.body);
    const preCookie = pickCookie(relog.setCookie);
    if (preToken) {
      const newPw = "Rotated-" + Date.now() + "-passphrase";
      const chg = await http.request({ method: changePw.method, path: changePw.path, headers: { authorization: `Bearer ${preToken}` }, cookie: preCookie, body: { currentPassword: ctx.known.secret, newPassword: newPw, password: newPw } });
      const after = await http.request({ method: me.method, path: me.path, headers: { authorization: `Bearer ${preToken}` } });
      const survived = after.status === 200;
      findings.push({
        id: "password-change-does-not-revoke-sessions", title: "Tokens issued before a password change keep working",
        stack, verdict: chg.status >= 400 ? "INFORMATIONAL" : survived ? "CONFIRMED" : "NOT_DETECTED",
        severity: survived && chg.status < 400 ? "high" : "info", cwe: "CWE-613",
        summary: chg.status >= 400 ? `change-password returned ${chg.status} ("${readError(chg.body)}") — could not complete this check.` : survived ? `A token minted before the password change still returns 200 at ${me.path}. A stolen token survives the user changing their password.` : `After the change, the pre-change token is rejected (status ${after.status}).`,
        evidence: { changeStatus: chg.status, meStatusAfterChange: after.status },
        remediation: "On password change, bump a per-user tokenVersion embedded in tokens and revoke all existing sessions.",
        limitations: "Leaves the fixture password changed for this run.", target: profile.baseUrl, probe: "token-session", ranAt: new Date().toISOString(),
      });
      if (chg.status < 400) ctx.known.secret = newPw;
    }
  }

  // refresh reuse
  if (refresh) {
    const rl = await http.request({ method: login.method, path: login.path, body: credBody(profile, ctx.known.identifier, ctx.known.secret) });
    const firstRefresh = pickCookie(rl.setCookie);
    if (firstRefresh) {
      const rotate = await http.request({ method: refresh.method, path: refresh.path, cookie: firstRefresh });
      const reuse = await http.request({ method: refresh.method, path: refresh.path, cookie: firstRefresh });
      const reuseAccepted = reuse.status === 200;
      findings.push({
        id: "refresh-token-reuse", title: "Rotated refresh token can be replayed",
        stack, verdict: reuseAccepted ? "CONFIRMED" : "NOT_DETECTED", severity: reuseAccepted ? "high" : "info", cwe: "CWE-613",
        summary: reuseAccepted ? `After a successful refresh (rotation), presenting the OLD refresh token again still returns 200. No reuse detection — a stolen refresh token is durable.` : `Re-presenting an already-rotated refresh token is rejected (status ${reuse.status}). Rotation with reuse detection is in place.`,
        evidence: { firstRotationStatus: rotate.status, replayStatus: reuse.status },
        remediation: "Rotate on every use, store the jti server-side, and on a replayed (already-rotated) token revoke the whole token family.",
        limitations: "Deterministic.", target: profile.baseUrl, probe: "token-session", ranAt: new Date().toISOString(),
      });
    }
  }
  return findings;
}
