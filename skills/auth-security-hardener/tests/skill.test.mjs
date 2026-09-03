import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "SKILL.md"), "utf8");

test("frontmatter: name, version, folded description", () => {
  assert.match(skill, /\nname:\s*auth-security-hardener\b/);
  assert.match(skill, /\nversion:\s*\d+\.\d+\.\d+/);
  assert.match(skill, /\ndescription:\s*>-/);
});

test("router: SKILL.md stays lean (< 160 lines)", () => {
  assert.ok(skill.split("\n").length < 160);
});

test("references/ files all exist", () => {
  for (const f of ["checklist.md", "remediation-patterns.md", "frameworks.md", "report-format.md"])
    assert.ok(existsSync(join(root, "references", f)), `missing references/${f}`);
});

test("defines FIX / RECOMMEND / SKIP", () => {
  for (const d of ["FIX", "RECOMMEND", "SKIP"]) assert.ok(skill.includes(d));
});

test("keeps authn / claims / authz / enforcement separate", () => {
  for (const c of [/authentication/i, /token claims/i, /authorization/i, /enforcement/i]) assert.match(skill, c);
});

test("rejects the sleep anti-fix; prescribes constant work + dummy hash", () => {
  assert.match(skill, /wrong fix is `sleep|not.*sleep|removable with samples/i);
  const rp = readFileSync(join(root, "references", "remediation-patterns.md"), "utf8");
  assert.match(rp, /dummy hash/i);
  assert.match(rp, /constant.work/i);
});

test("checklist covers the broadened surface + fix directions", () => {
  const c = readFileSync(join(root, "references", "checklist.md"), "utf8");
  for (const t of [/argon2|bcrypt cost/i, /rotat/i, /tokenVersion/, /lockout/i, /OAuth|OIDC/i, /MFA/i, /session fixation/i, /CORS/, /helmet/i])
    assert.match(c, t, `checklist missing ${t}`);
});

test("frameworks reference names multiple stacks", () => {
  const f = readFileSync(join(root, "references", "frameworks.md"), "utf8");
  for (const s of [/Express/, /Django/, /Rails/, /Go/, /Spring/, /NextAuth|Auth\.js/, /Supabase/, /Firebase/]) assert.match(f, s);
});

test("SKILL.md loads the lessons digest at step 0", () => {
  assert.match(skill, /lessons-digest/);
});
