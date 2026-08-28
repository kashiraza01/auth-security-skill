import fs from "node:fs";
import path from "node:path";
import type { AuditReport, Finding } from "./harness/finding";

const VERDICT_ORDER: Record<Finding["verdict"], number> = {
  CONFIRMED: 0,
  SUSPECTED: 1,
  INFORMATIONAL: 2,
  NOT_DETECTED: 3,
};
const SEVERITY_ORDER: Record<Finding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.id.localeCompare(b.id),
  );
}

export function writeReport(report: AuditReport, outPath: string): void {
  const abs = path.resolve(outPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(report, null, 2) + "\n", "utf8");
  // eslint-disable-next-line no-console
  console.log(`\n  findings written → ${abs}`);
}

const ICON: Record<Finding["verdict"], string> = {
  CONFIRMED: "✗",
  SUSPECTED: "?",
  INFORMATIONAL: "i",
  NOT_DETECTED: "✓",
};

export function printConsoleTable(report: AuditReport): void {
  const rows = sortFindings(report.findings);
  const byStack = new Map<string, Finding[]>();
  for (const f of rows) {
    if (!byStack.has(f.stack)) byStack.set(f.stack, []);
    byStack.get(f.stack)!.push(f);
  }

  // eslint-disable-next-line no-console
  console.log(`\n  AUTH SECURITY AUDIT  —  ${report.target}  —  ${report.ranAt}`);
  console.log(`  ${report.environment.node} / ${report.environment.platform}\n`);

  for (const [stack, findings] of byStack) {
    console.log(`  ── ${stack.toUpperCase()} ${"─".repeat(Math.max(0, 60 - stack.length))}`);
    for (const f of findings) {
      console.log(
        `   ${ICON[f.verdict]} [${f.verdict.padEnd(13)}] ${f.severity.padEnd(8)} ${f.title}`,
      );
    }
    const confirmed = findings.filter((f) => f.verdict === "CONFIRMED").length;
    console.log(`     ${confirmed} confirmed, ${findings.length} checks\n`);
  }

  // Cross-stack diff: what CONFIRMED on baseline is gone on hardened?
  const base = report.findings.filter((f) => f.stack === "baseline" && f.verdict === "CONFIRMED");
  const hard = new Map(report.findings.filter((f) => f.stack === "hardened").map((f) => [f.id, f]));
  if (base.length && hard.size) {
    console.log(`  ── FIXED BY HARDENING ${"─".repeat(43)}`);
    for (const f of base) {
      const h = hard.get(f.id);
      const cleared = h && h.verdict !== "CONFIRMED";
      console.log(`   ${cleared ? "✓" : "✗"} ${f.title}  ${cleared ? `→ ${h!.verdict}` : "→ STILL CONFIRMED"}`);
    }
    console.log("");
  }
}
