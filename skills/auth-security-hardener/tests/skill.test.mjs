/**
 * Structural checks for auth-security-hardener/SKILL.md. No dependencies.
 *   node --test skills/auth-security-hardener/tests/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(here, "..", "SKILL.md"), "utf8");

test("has YAML frontmatter with name and description", () => {
  assert.match(skill, /^---\n[\s\S]*?\n---/);
  assert.match(skill, /\nname:\s*auth-security-hardener\b/);
  assert.match(skill, /\ndescription:\s*>-/);
});

test("description promises restraint and no absolute-security claims", () => {
  const fm = skill.split("---")[1];
  assert.match(fm, /without rewriting|does NOT.*rewrit|targeted/i);
  assert.match(fm, /does NOT claim a mitigation is absolute|residual/i);
});

test("has the required sections", () => {
  for (const heading of [
    "When to run this",
    "Objectives",
    "Workflow",
    "FIX / RECOMMEND / SKIP",
    "Checklist",
    "Special guidance",
    "Remediation methodology",
    "Report format",
    "Worked example",
    "Close-out",
  ]) {
    assert.ok(skill.includes(heading), `missing section: ${heading}`);
  }
});

test("workflow is a 10-step ordered list", () => {
  const wf = skill.slice(skill.indexOf("## 3. Workflow"));
  for (let i = 1; i <= 10; i++) {
    assert.ok(new RegExp(`\\n${i}\\. \\*\\*`).test(wf), `workflow step ${i} missing`);
  }
});

test("defines FIX, RECOMMEND and SKIP", () => {
  for (const d of ["FIX", "RECOMMEND", "SKIP"]) {
    assert.ok(skill.includes(d), `decision ${d} not defined`);
  }
});

test("checklist covers every core control", () => {
  for (const topic of [
    /timing|constant.?work/i,
    /enumerat/i,
    /rate limit/i,
    /lockout/i,
    /argon2|bcrypt cost/i,
    /rotat/i,
    /revoc|revoke/i,
    /tokenVersion/,
    /CORS/,
    /helmet/i,
    /authoriz|authoris/i,
  ]) {
    assert.match(skill, topic, `checklist missing topic: ${topic}`);
  }
});

test("explicitly rejects fixed sleeps as the timing fix", () => {
  assert.match(skill, /not.*fixed.*sleep|sleep\(.*\).*wrong|wrong fix is/i);
  assert.match(skill, /dummy hash/i);
});

test("keeps authentication / authorization / claims / enforcement separate", () => {
  for (const c of ["Authentication", "Token claims", "Authorization", "Enforcement"]) {
    assert.ok(skill.includes(c), `concept ${c} not called out`);
  }
});
