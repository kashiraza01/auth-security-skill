"use client";

import { CHECKS, SEVERITY_RANK, type Severity } from "@/lib/checks";
import { useLab } from "@/lib/store";

const DOT: Record<Severity, string> = {
  critical: "bg-cyber-red",
  high: "bg-orange-500",
  medium: "bg-cyber-amber",
  low: "bg-zinc-500",
  info: "bg-zinc-600",
};

export function CheckNav() {
  const { activeCheck, setActiveCheck, report, findingFor } = useLab();
  const ordered = [...CHECKS].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return (
    <nav className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-[var(--cyber-border)] bg-[var(--cyber-panel)]">
      <div className="px-4 py-3 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
        Checks
      </div>
      {ordered.map((c) => {
        const b = findingFor(c.findingId, "baseline");
        const h = findingFor(c.findingId, "hardened");
        const active = activeCheck === c.findingId;
        return (
          <button
            key={c.findingId}
            onClick={() => setActiveCheck(c.findingId)}
            className={`border-l-2 px-4 py-2.5 text-left text-xs transition ${
              active
                ? "border-cyber-cyan bg-cyber-cyan/5 text-zinc-100"
                : "border-transparent text-zinc-400 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[c.severity]}`} />
              <span className="font-semibold">{c.title}</span>
            </div>
            {report && (
              <div className="mt-1 flex gap-2 pl-3.5 text-[10px]">
                <span className={b?.verdict === "CONFIRMED" ? "text-cyber-red" : "text-zinc-600"}>
                  base: {b?.verdict ?? "—"}
                </span>
                <span className={h?.verdict === "CONFIRMED" ? "text-cyber-red" : "text-cyber-green"}>
                  hard: {h?.verdict ?? "—"}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </nav>
  );
}
