import fs from "node:fs";
import path from "node:path";
import { sortFindings } from "./finding.mjs";

export function writeReport(report, outPath) {
  const abs = path.resolve(outPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`\n  findings written -> ${abs}`);
}

const ICON = { CONFIRMED: "x", SUSPECTED: "?", INFORMATIONAL: "i", NOT_DETECTED: "+" };

export function printConsoleTable(report) {
  const byStack = new Map();
  for (const f of sortFindings(report.findings)) {
    if (!byStack.has(f.stack)) byStack.set(f.stack, []);
    byStack.get(f.stack).push(f);
  }
  console.log(`\n  AUTH SECURITY AUDIT  --  ${report.target}  --  ${report.ranAt}`);
  console.log(`  ${report.environment.node} / ${report.environment.platform}\n`);
  for (const [stack, fs2] of byStack) {
    console.log(`  -- ${stack.toUpperCase()} ${"-".repeat(Math.max(0, 56 - stack.length))}`);
    for (const f of fs2) console.log(`   ${ICON[f.verdict]} [${f.verdict.padEnd(13)}] ${f.severity.padEnd(8)} ${f.title}`);
    console.log(`     ${fs2.filter((f) => f.verdict === "CONFIRMED").length} confirmed, ${fs2.length} checks\n`);
  }
  diffTable(report);
}

/** Cross-stack diff when exactly two stacks are present (baseline vs hardened). */
export function diffTable(report) {
  const stacks = [...new Set(report.findings.map((f) => f.stack))];
  if (stacks.length !== 2) return;
  const [a, b] = stacks;
  const aConf = report.findings.filter((f) => f.stack === a && f.verdict === "CONFIRMED");
  const bMap = new Map(report.findings.filter((f) => f.stack === b).map((f) => [f.id, f]));
  if (!aConf.length) return;
  console.log(`  -- ${a.toUpperCase()} confirmed, resolved on ${b.toUpperCase()} ${"-".repeat(20)}`);
  for (const f of aConf) {
    const h = bMap.get(f.id);
    const cleared = h && h.verdict !== "CONFIRMED";
    console.log(`   ${cleared ? "+" : "x"} ${f.title}  ${cleared ? `-> ${h.verdict}` : "-> STILL CONFIRMED"}`);
  }
  console.log("");
}

/**
 * Diff two reports finding-for-finding (used by the loop). Returns per-id status:
 * fixed | still-present | partially-addressed | regression | unchanged-clean.
 */
export function diffReports(prev, curr, stack) {
  const p = new Map(prev.findings.filter((f) => f.stack === stack).map((f) => [f.id, f]));
  const c = new Map(curr.findings.filter((f) => f.stack === stack).map((f) => [f.id, f]));
  const out = [];
  for (const [id, cf] of c) {
    const pf = p.get(id);
    const was = pf?.verdict ?? "NOT_DETECTED";
    const now = cf.verdict;
    let status;
    if (was === "CONFIRMED" && now === "CONFIRMED") status = "still-present";
    else if (was === "CONFIRMED" && (now === "SUSPECTED" || now === "INFORMATIONAL")) status = "partially-addressed";
    else if (was === "CONFIRMED" && now === "NOT_DETECTED") status = "fixed";
    else if (was !== "CONFIRMED" && now === "CONFIRMED") status = "regression";
    else status = "unchanged";
    out.push({ id, title: cf.title, was, now, status });
  }
  return out;
}
