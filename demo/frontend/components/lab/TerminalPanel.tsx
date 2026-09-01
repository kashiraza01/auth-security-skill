"use client";

import { useEffect, useRef } from "react";
import { useLab } from "@/lib/store";

export function TerminalPanel() {
  const { auditStatus, auditLog, report, runAudit } = useLab();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [auditLog]);

  const confirmedBaseline = report?.findings.filter(
    (f) => f.stack === "baseline" && f.verdict === "CONFIRMED",
  ).length;
  const confirmedHardened = report?.findings.filter(
    (f) => f.stack === "hardened" && f.verdict === "CONFIRMED",
  ).length;

  return (
    <aside className="flex w-[26rem] shrink-0 flex-col border-l border-[var(--cyber-border)] bg-[var(--cyber-black)]">
      <div className="flex items-center justify-between border-b border-[var(--cyber-border)] px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
          Live audit
        </span>
        <button
          onClick={() => void runAudit()}
          disabled={auditStatus === "running"}
          className="rounded border border-cyber-cyan/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-cyber-cyan transition hover:bg-cyber-cyan/10 disabled:opacity-40"
        >
          {auditStatus === "running" ? "running…" : auditStatus === "done" ? "re-run" : "run audit"}
        </button>
      </div>

      {report && (
        <div className="grid grid-cols-2 divide-x divide-[var(--cyber-border)] border-b border-[var(--cyber-border)] text-center">
          <div className="py-2">
            <div className="text-lg font-bold text-cyber-red">{confirmedBaseline}</div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">baseline confirmed</div>
          </div>
          <div className="py-2">
            <div className={`text-lg font-bold ${confirmedHardened ? "text-cyber-red" : "text-cyber-green"}`}>
              {confirmedHardened}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">hardened confirmed</div>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
        {auditLog.length === 0 && auditStatus === "idle" && (
          <p className="text-zinc-600">
            Press “run audit”. This spawns <code>demo/security-tests</code> against both stacks —
            every number you see afterwards comes from that run.
          </p>
        )}
        {auditLog.map((l, i) => (
          <div
            key={i}
            className={
              /CONFIRMED/.test(l)
                ? "text-cyber-red"
                : /NOT_DETECTED|✓|fixed/i.test(l)
                  ? "text-cyber-green"
                  : /────|AUTH SECURITY|auditing/.test(l)
                    ? "text-cyber-cyan"
                    : "text-zinc-400"
            }
          >
            {l}
          </div>
        ))}
        {auditStatus === "running" && <div className="mt-1 animate-pulse text-cyber-amber">▌</div>}
      </div>

      {report && (
        <div className="border-t border-[var(--cyber-border)] p-3 text-[10px] text-zinc-600">
          {report.environment.node} · {report.environment.platform} · {report.durationMs} ms
          <br />
          {report.environment.note}
        </div>
      )}
    </aside>
  );
}
