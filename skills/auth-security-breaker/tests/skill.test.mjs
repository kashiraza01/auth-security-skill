/**
 * Structural checks for auth-security-breaker/SKILL.md. No dependencies.
 *   node --test skills/auth-security-breaker/tests/
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
  assert.match(skill, /\nname:\s*auth-security-breaker\b/);
  assert.match(skill, /\ndescription:\s*>-/);
});

test("description states what it does, trigger phrases, and a boundary", () => {
  const fm = skill.split("---")[1];
  assert.match(fm, /audit/i);
  assert.match(fm, /authorised|authorized/i);
  assert.match(fm, /CONFIRMED|SUSPECTED/);
  assert.match(fm, /does NOT|never/i);
});

test("has the required sections", () => {
  for (const heading of [
    "Scope and authorization",
    "When to run this",
    "Objectives",
    "Workflow",
    "Decision criteria",
    "Checklist",
    "Report format",
    "Testing methodology",
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

test("defines all four verdicts", () => {
  for (const v of ["CONFIRMED", "SUSPECTED", "INFORMATIONAL", "NOT_DETECTED"]) {
    assert.ok(skill.includes(v), `verdict ${v} not defined`);
  }
});

test("checklist covers every core weakness class", () => {
  for (const topic of [
    /timing/i,
    /enumerat/i,
    /rate limit/i,
    /lockout/i,
    /hash/i,
    /rotat/i, // refresh rotation
    /revocation|revoke/i,
    /CORS/,
    /authoriz|authoris/i,
    /forge|forg/i,
  ]) {
    assert.match(skill, topic, `checklist missing topic: ${topic}`);
  }
});

test("does not overclaim on timing", () => {
  // must contain the "not exploitable by itself" discipline somewhere
  assert.match(skill, /never claims a timing difference is "exploitable"|not.*exploitab/i);
});
