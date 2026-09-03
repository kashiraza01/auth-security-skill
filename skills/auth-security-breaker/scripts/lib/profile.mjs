// A target profile describes ANY auth API in terms the probes understand, so the
// same probes run against Express, Django, Rails, anything — no code changes,
// just a JSON file. See profiles/*.json and references/report-format.md.
import fs from "node:fs";
import path from "node:path";

const REQUIRED_ENDPOINTS = ["login"];
const KNOWN_ENDPOINTS = ["register", "login", "me", "refresh", "logout", "logoutAll", "changePassword", "adminOnly", "health"];

export function loadProfile(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) { console.error(`profile not found: ${abs}`); process.exit(2); }
  const p = JSON.parse(fs.readFileSync(abs, "utf8"));

  p.baseUrl ||= "http://localhost:4000";
  p.fields = { identifier: "email", secret: "password", accessToken: "accessToken", role: "role", ...(p.fields ?? {}) };
  p.fixtures ??= {};
  p.hooks ??= {};
  p.endpoints ??= {};

  for (const req of REQUIRED_ENDPOINTS)
    if (!p.endpoints[req]) { console.error(`profile ${file}: missing required endpoint "${req}"`); process.exit(2); }
  for (const k of Object.keys(p.endpoints))
    if (!KNOWN_ENDPOINTS.includes(k)) console.warn(`  (profile note: unknown endpoint key "${k}" — probes will ignore it)`);

  p._file = abs;
  p._name = p.name ?? path.basename(file, ".json");
  return p;
}

/** "POST /api/x" -> { method:"POST", path:"/api/x" }; undefined if not defined. */
export function ep(profile, key) {
  const raw = profile.endpoints[key];
  if (!raw) return undefined;
  const [method, ...rest] = raw.trim().split(/\s+/);
  return { method: method.toUpperCase(), path: rest.join(" ") };
}

export function has(profile, key) { return Boolean(profile.endpoints[key]); }

/** Build a login/register body from identifier + secret using the profile's field names. */
export function credBody(profile, identifier, secret, extra = {}) {
  return { [profile.fields.identifier]: identifier, [profile.fields.secret]: secret, ...extra };
}

export function readAccessToken(profile, body) {
  const key = profile.fields.accessToken;
  return body && typeof body === "object" ? body[key] : undefined;
}
