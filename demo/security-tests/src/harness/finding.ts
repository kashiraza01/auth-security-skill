export type Stack = "baseline" | "hardened";

export type Verdict =
  | "CONFIRMED" // reproduced with evidence a fix must address
  | "SUSPECTED" // signal present, not conclusively exploitable / needs conditions
  | "INFORMATIONAL" // worth noting, not a vulnerability on its own
  | "NOT_DETECTED"; // probe ran, condition absent

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  id: string; // stable slug, e.g. "timing-user-enumeration"
  title: string;
  stack: Stack;
  verdict: Verdict;
  severity: Severity;
  /** one-paragraph plain statement of what was observed */
  summary: string;
  /** the measurements / responses that back the verdict — numbers, not adjectives */
  evidence: Record<string, unknown>;
  /** what a fix looks like; mirrors the hardener skill checklist */
  remediation: string;
  /** honest caveats: sample size, environment, what this does NOT prove */
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
  environment: {
    node: string;
    platform: string;
    note: string;
  };
  findings: Finding[];
}
