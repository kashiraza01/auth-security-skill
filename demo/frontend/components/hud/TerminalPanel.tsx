"use client";

import { useEffect, useRef } from "react";
import { useLab } from "@/lib/store";

// Streams the REAL audit run. Each line reveals with a severity-coloured glow; a
// status ring spins while running. Numbers come only from the live output.
export function TerminalPanel() {
  const { auditStatus, auditLog, report, runAudit } = useLab();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [auditLog]);

  const lineClass = (l: string) =>
    /CONFIRMED/.test(l) ? "text-glow-red"
      : /NOT_DETECTED|\bfixed\b|CONVERGED|\+ /.test(l) ? "text-glow-green"
      : /----|AUTH SECURITY|auditing|INFORMATIONAL/.test(l) ? "text-glow-cyan"
      : "text-[var(--text-dim)]";

  return (
    <aside className="flex w-[27rem] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-panel)]">
      <div className="panel-b flex items-center justify-between px-3 py-2">
        <span className="hairline flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${auditStatus === "running" ? "animate-pulse bg-[var(--amber)]" : report ? "bg-[var(--green)]" : "bg-[var(--text-faint)]"}`} />
          live audit
        </span>
        <button onClick={() => void runAudit()} disabled={auditStatus === "running"}
          className="corner border border-[var(--cyan-dim)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--cyan)] transition hover:bg-[var(--cyan)]/10 disabled:opacity-40">
          {auditStatus === "running" ? "running…" : report ? "re-run" : "run audit"}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
        {auditLog.length === 0 && auditStatus === "idle" && (
          <p className="text-[var(--text-faint)]">
            Press <span className="text-[var(--cyan)]">run audit</span>. This spawns the real{" "}
            <code>demo/security-tests</code> auditor against both stacks — every number you see
            afterwards comes from that run.
          </p>
        )}
        {auditLog.map((l, i) => (
          <div key={i} className={`${lineClass(l)} whitespace-pre-wrap break-words`}
            style={{ animation: "none" }}>{l}</div>
        ))}
        {auditStatus === "running" && <div className="cursor-blink mt-1 text-[var(--amber)]" />}
      </div>

      {report && (
        <div className="panel-b border-t px-3 py-2 text-[10px] text-[var(--text-faint)]">
          {report.environment.node} · {report.environment.platform} · {report.durationMs} ms
          <br />{report.environment.note}
        </div>
      )}
    </aside>
  );
}
