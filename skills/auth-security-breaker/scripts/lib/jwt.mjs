// Minimal HS256 JWT — sign / decode / verify — over node:crypto.
// Zero dependencies so the skill's CLI installs without an npm tree.
import crypto from "node:crypto";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (obj) => b64url(JSON.stringify(obj));

/** Decode without verifying (for reading claims / rebuilding a tampered token). */
export function decode(token) {
  const [h, p] = token.split(".");
  const json = (s) => JSON.parse(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  return { header: json(h), payload: json(p) };
}

/** Sign an HS256 token. `expiresInSec` optional. */
export function sign(payload, secret, { expiresInSec, header } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, ...(expiresInSec ? { exp: now + expiresInSec } : {}), ...payload };
  const head = b64urlJson({ alg: "HS256", typ: "JWT", ...(header ?? {}) });
  const claims = b64urlJson(body);
  const sig = b64url(crypto.createHmac("sha256", secret).update(`${head}.${claims}`).digest());
  return `${head}.${claims}.${sig}`;
}

/** Re-sign an existing token's (possibly edited) payload with a chosen secret. */
export function resign(token, overrides, secret) {
  const { payload } = decode(token);
  const merged = { ...payload, ...overrides };
  delete merged.iat;
  delete merged.exp;
  return sign(merged, secret, { expiresInSec: 3600 });
}

/** Replace the payload but keep the original signature (an unsigned tamper). */
export function tamperPayload(token, overrides) {
  const [h, , s] = token.split(".");
  const { payload } = decode(token);
  const newPayload = b64urlJson({ ...payload, ...overrides });
  return `${h}.${newPayload}.${s}`;
}
