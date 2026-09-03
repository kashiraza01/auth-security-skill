#!/usr/bin/env node
// The loop REFEREE. It does the deterministic bookkeeping so "it converged" is a
// computed claim, not a vibe: it ingests each iteration's findings.json, diffs it
// against the previous iteration, detects fixed / still-present / regression /
// stalled, enforces the cap, and writes loop-report.json.
//
// The agent does the dispatching (breaker -> hardener -> breaker); this script
// decides whether to stop. Read the exit code:
//   0  CONVERGED   — zero CONFIRMED, zero regressions. Stop, success.
//   20 REGRESSION  — a previously-clean finding is CONFIRMED again. Stop, alarm.
//   30 STALLED     — an iteration changed no verdict. Stop, report honestly.
//   40 CONTINUE    — CONFIRMED remain and progress was made. Loop again.
//   50 CAP         — iteration cap hit with work remaining. Stop, report remainder.
//
//   node loop.mjs advance --findings=docs/findings.json --stack=hardened --max=4
//   node loop.mjs status  [--state=loop-report.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const get = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=").slice(1).join("=") : d; };
const cmd = process.argv[2];

const statePath = path.resolve(get("state", path.join(here, "..", "loop-report.json")));
const loadState = () => (fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : { startedAt: new Date().toISOString(), stack: null, max: 4, iterations: [] });
const saveState = (s) => fs.writeFileSync(statePath, JSON.stringify(s, null, 2) + "\n");

function verdictMap(findings, stack) {
  const m = {};
  for (const f of findings) if (!stack || f.stack === stack) m[f.id] = { verdict: f.verdict, title: f.title, severity: f.severity };
  return m;
}

function diff(prev, curr) {
  const out = [];
  for (const id of Object.keys(curr)) {
    const was = prev[id]?.verdict ?? "NOT_DETECTED";
    const now = curr[id].verdict;
    let status;
    if (was === "CONFIRMED" && now === "CONFIRMED") status = "still-present";
    else if (was === "CONFIRMED" && (now === "SUSPECTED" || now === "INFORMATIONAL")) status = "partially-addressed";
    else if (was === "CONFIRMED" && now === "NOT_DETECTED") status = "fixed";
    else if (was !== "CONFIRMED" && now === "CONFIRMED") status = "regression";
    else status = "unchanged";
    out.push({ id, title: curr[id].title, severity: curr[id].severity, was, now, status });
  }
  return out;
}

if (cmd === "status") {
  const s = loadState();
  console.log(JSON.stringify({ stack: s.stack, iterations: s.iterations.length, max: s.max }, null, 2));
  process.exit(0);
}

if (cmd !== "advance") { console.error("usage: loop.mjs advance --findings=<path> [--stack=..] [--max=4]"); process.exit(2); }

const findingsPath = path.resolve(get("findings", "docs/findings.json"));
if (!fs.existsSync(findingsPath)) { console.error(`findings not found: ${findingsPath}`); process.exit(2); }
const report = JSON.parse(fs.readFileSync(findingsPath, "utf8"));

const state = loadState();
state.stack = get("stack", state.stack ?? (report.stacksTested?.[report.stacksTested.length - 1] ?? null));
state.max = Number(get("max", state.max ?? 4));

const curr = verdictMap(report.findings, state.stack);
const iteration = state.iterations.length;
const isBaseline = iteration === 0;
const prev = isBaseline ? {} : state.iterations[iteration - 1].verdicts;
const changes = diff(prev, curr).map((c) =>
  // At the baseline there is no "previously clean" state, so a starting CONFIRMED
  // is the baseline, not a regression.
  isBaseline && c.status === "regression" ? { ...c, status: "baseline" } : c,
);

const confirmed = Object.entries(curr).filter(([, v]) => v.verdict === "CONFIRMED").map(([id, v]) => ({ id, ...v }));
const regressions = changes.filter((c) => c.status === "regression");
const anyChange = !isBaseline && changes.some((c) => c.status !== "unchanged");

state.iterations.push({ iteration, at: new Date().toISOString(), verdicts: curr, changes, confirmedCount: confirmed.length, regressionCount: regressions.length });

let code, verdict;
if (regressions.length) { code = 20; verdict = "REGRESSION"; }
else if (confirmed.length === 0) { code = 0; verdict = "CONVERGED"; }
else if (iteration > 0 && !anyChange) { code = 30; verdict = "STALLED"; }
else if (iteration + 1 >= state.max) { code = 50; verdict = "CAP"; }
else { code = 40; verdict = "CONTINUE"; }

state.finalVerdict = verdict;
saveState(state);

// human summary
console.log(`\n  LOOP iteration ${iteration} · stack "${state.stack}" · ${verdict}`);
const icon = { fixed: "+", "still-present": "x", "partially-addressed": "~", regression: "!", baseline: "*", unchanged: " " };
for (const c of changes.filter((c) => c.status !== "unchanged")) console.log(`   ${icon[c.status]} ${c.status.padEnd(20)} ${c.id} (${c.was} -> ${c.now})`);
console.log(`   ${confirmed.length} CONFIRMED remain, ${regressions.length} regression(s)`);
if (verdict === "REGRESSION") console.log(`   -> STOP. A previously-clean finding is broken again: ${regressions.map((r) => r.id).join(", ")}`);
if (verdict === "CONVERGED") console.log(`   -> STOP. Converged.`);
if (verdict === "STALLED") console.log(`   -> STOP. No verdict changed this iteration; escalate remaining: ${confirmed.map((c) => c.id).join(", ")}`);
if (verdict === "CAP") console.log(`   -> STOP. Cap ${state.max} reached; remaining: ${confirmed.map((c) => c.id).join(", ")}`);
if (verdict === "CONTINUE") console.log(`   -> dispatch hardener for: ${confirmed.map((c) => c.id).join(", ")}, then re-run the breaker and advance again.`);
console.log(`   state -> ${statePath}\n`);
process.exit(code);
