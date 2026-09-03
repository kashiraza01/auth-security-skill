import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "SKILL.md"), "utf8");

test("frontmatter: name, version, folded description", () => {
  assert.match(skill, /\nname:\s*auth-security-loop\b/);
  assert.match(skill, /\nversion:\s*\d+\.\d+\.\d+/);
  assert.match(skill, /\ndescription:\s*>-/);
});

test("declares the hard rules + the five referee verdicts", () => {
  for (const v of ["CONVERGED", "REGRESSION", "STALLED", "CAP", "CONTINUE"]) assert.ok(skill.includes(v), `missing ${v}`);
  assert.match(skill, /never weaken a probe/i);
  assert.match(skill, /regression stops the loop/i);
});

test("scripts + agent definitions exist", () => {
  for (const f of ["loop.mjs", "lessons-digest.mjs", "record-lesson.mjs"]) assert.ok(existsSync(join(root, "scripts", f)), `missing ${f}`);
  const agents = join(root, "..", "..", ".claude", "agents");
  assert.ok(existsSync(join(agents, "auth-breaker.md")), "missing auth-breaker agent");
  assert.ok(existsSync(join(agents, "auth-hardener.md")), "missing auth-hardener agent");
});

test("lessons digest emits DO and DON'T rules", () => {
  const out = execFileSync(process.execPath, [join(root, "scripts", "lessons-digest.mjs")], { encoding: "utf8" });
  assert.match(out, /## DO/);
  assert.match(out, /## DON'T/);
});

test("record-lesson refuses an entry missing a DON'T", () => {
  assert.throws(() => execFileSync(process.execPath, [join(root, "scripts", "record-lesson.mjs"), "--finding=x", "--iteration=9", "--do=something"], { stdio: "pipe" }));
});

test("referee: CONFIRMED then clean -> CONVERGED (exit 0); regression -> exit 20", () => {
  const dir = mkdtempSync(join(tmpdir(), "loop-"));
  const state = join(dir, "state.json");
  const mk = (findings) => { const p = join(dir, `f-${Math.random().toString(36).slice(2)}.json`); writeFileSync(p, JSON.stringify({ ranAt: "t", target: "x", stacksTested: ["hardened"], environment: { node: "x", platform: "y" }, findings })); return p; };
  const f = (id, verdict) => ({ id, title: id, stack: "hardened", verdict, severity: "high", summary: "", evidence: {}, remediation: "", limitations: "", probe: "p" });
  const advance = (p) => { try { return { code: 0, out: execFileSync(process.execPath, [join(root, "scripts", "loop.mjs"), "advance", `--findings=${p}`, "--stack=hardened", "--max=4", `--state=${state}`], { encoding: "utf8" }) }; } catch (e) { return { code: e.status, out: (e.stdout ? e.stdout.toString() : "") }; } };

  let r = advance(mk([f("a", "CONFIRMED")])); assert.equal(r.code, 40, "iter0 with CONFIRMED -> CONTINUE");
  r = advance(mk([f("a", "NOT_DETECTED")])); assert.equal(r.code, 0, "fixed -> CONVERGED"); assert.match(r.out, /CONVERGED/);
  r = advance(mk([f("a", "CONFIRMED")])); assert.equal(r.code, 20, "clean-then-broken -> REGRESSION"); assert.match(r.out, /REGRESSION/);
});
