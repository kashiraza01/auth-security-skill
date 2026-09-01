export type Verdict = "CONFIRMED" | "SUSPECTED" | "INFORMATIONAL" | "NOT_DETECTED";
export type Stack = "baseline" | "hardened";

export interface Finding {
  id: string;
  title: string;
  stack: Stack;
  verdict: Verdict;
  severity: "critical" | "high" | "medium" | "low" | "info";
  summary: string;
  evidence: Record<string, unknown>;
  remediation: string;
  limitations: string;
  target: string;
  probe: string;
  ranAt: string;
}

export interface AuditReport {
  ranAt: string;
  durationMs: number;
  target: string;
  stacksTested: Stack[];
  environment: { node: string; platform: string; note: string };
  findings: Finding[];
}
