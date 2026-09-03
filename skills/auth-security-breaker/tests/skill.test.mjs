import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "SKILL.md"), "utf8");

test("frontmatter: name, version, folded description", () => {
  assert.match(skill, /^---\n[\s\S]*?\n---/);
  assert.match(skill, /\nname:\s*auth-security-breaker\b/);
  assert.match(skill, /\nversion:\s*\d+\.\d+\.\d+/);
  assert.match(skill, /\ndescription:\s*>-/);
});

test("router: SKILL.md stays lean (< 160 lines)", () => {
  assert.ok(skill.split("\n").length < 160, "SKILL.md should be a lean router; move depth to references/");
});

test("references/ files all exist", () => {
  for (const f of ["checklist.md", "timing-methodology.md", "report-format.md", "frameworks.md", "finding.schema.json"])
    assert.ok(existsSync(join(root, "references", f)), `missing references/${f}`);
});

test("scripts/ CLI + libs + probes exist", () => {
  for (const f of ["audit.mjs", "lib/http.mjs", "lib/stats.mjs", "lib/scope-guard.mjs", "lib/profile.mjs", "lib/jwt.mjs", "lib/finding.mjs", "lib/report.mjs"])
    assert.ok(existsSync(join(root, "scripts", f)), `missing scripts/${f}`);
  for (const p of ["timing-enumeration", "user-enumeration", "authz-escalation", "token-session", "info-leak", "password-reset", "bruteforce-ratelimit", "lockout-dos"])
    assert.ok(existsSync(join(root, "scripts", "probes", `${p}.mjs`)), `missing probe ${p}`);
});

test("profiles: template + demo profiles present and valid JSON", () => {
  for (const p of ["example-generic.json", "auth-lab-baseline.json", "auth-lab-hardened.json"]) {
    const j = JSON.parse(readFileSync(join(root, "scripts", "profiles", p), "utf8"));
    assert.ok(j.endpoints && j.endpoints.login, `${p} needs endpoints.login`);
  }
});

test("finding schema declares the four verdicts + join key", () => {
  const s = readFileSync(join(root, "references", "finding.schema.json"), "utf8");
  for (const v of ["CONFIRMED", "SUSPECTED", "INFORMATIONAL", "NOT_DETECTED"]) assert.ok(s.includes(v));
  assert.ok(/join key/i.test(s), "schema should name id as the join key");
});

test("checklist covers the broadened surface", () => {
  const c = readFileSync(join(root, "references", "checklist.md"), "utf8");
  for (const t of [/timing/i, /enumerat/i, /rate limit/i, /lockout/i, /rotat/i, /OAuth|OIDC/i, /MFA|TOTP/i, /reset/i, /alg confusion|asymmetric/i, /session fixation/i])
    assert.match(c, t, `checklist missing ${t}`);
});

test("SKILL.md keeps the scope gate and the four verdicts", () => {
  assert.match(skill, /scope/i);
  for (const v of ["CONFIRMED", "SUSPECTED", "INFORMATIONAL", "NOT_DETECTED"]) assert.ok(skill.includes(v));
  assert.match(skill, /never call.*timing.*exploitable|not.*exploitab/i);
});

test("SKILL.md loads the lessons digest at step 0", () => {
  assert.match(skill, /lessons-digest/);
});
