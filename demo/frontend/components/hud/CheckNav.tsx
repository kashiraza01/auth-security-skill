"use client";

import { CHECKS, SEVERITY_RANK, type Severity } from "@/lib/checks";
import { useLab } from "@/lib/store";

const DOT: Record<Severity, string> = {
  critical: "var(--red)", high: "#ff7a1a", medium: "var(--amber)", low: "var(--text-dim)", info: "var(--text-faint)",
};

export function CheckNav() {
  const { activeCheck, setActiveCheck, report, findingFor, auditStatus } = useLab();
  const ordered = [...CHECKS].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return (
    <nav className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--bg-panel)]">
      <div className="panel-b flex items-center justify-between px-4 py-3">
        <span className="hairline">checks</span>
        {auditStatus === "running" && <span className="hairline text-[var(--amber)]">scanning…</span>}
      </div>
      {ordered.map((c) => {
        const b = findingFor(c.findingId, "baseline");
        const h = findingFor(c.findingId, "hardened");
        const active = activeCheck === c.findingId;
        return (
          <button key={c.findingId} onClick={() => setActiveCheck(c.findingId)}
            className={`group border-l-2 px-4 py-2.5 text-left text-xs transition ${active ? "border-[var(--cyan)] bg-[var(--cyan)]/5 text-[var(--text)]" : "border-transparent text-[var(--text-dim)] hover:bg-white/[0.03]"}`}>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[c.severity], boxShadow: active ? `0 0 6px ${DOT[c.severity]}` : "none" }} />
              <span className="font-semibold">{c.title}</span>
            </div>
            {report && (
              <div className="mt-1 flex gap-2 pl-3.5 text-[10px]">
                <Light label="base" verdict={b?.verdict} />
                <Light label="hard" verdict={h?.verdict} />
              </div>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function Light({ label, verdict }: { label: string; verdict?: string }) {
  const color = verdict === "CONFIRMED" ? "var(--red)" : verdict === "NOT_DETECTED" ? "var(--green)" : verdict ? "var(--amber)" : "var(--text-faint)";
  return <span style={{ color }}>{label}: {verdict ?? "—"}</span>;
}
