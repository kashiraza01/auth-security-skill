"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useLab } from "@/lib/store";
import { CHECKS } from "@/lib/checks";
import { CodeView } from "./CodeView";
import type { Finding } from "@/lib/types";

function VerdictTag({ finding, side }: { finding?: Finding; side: "baseline" | "hardened" }) {
  if (!finding) return <span className="hairline text-[var(--text-faint)]">run the audit →</span>;
  const confirmed = finding.verdict === "CONFIRMED";
  const cls = confirmed ? "text-glow-red border-[var(--red)]/40 bg-[var(--red)]/10"
    : side === "hardened" ? "text-glow-green border-[var(--green)]/40 bg-[var(--green)]/10"
    : "text-[var(--text-dim)] border-[var(--border-bright)] bg-white/[0.03]";
  return <span className={`corner border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${cls}`}>{confirmed ? "✗ " : "✓ "}{finding.verdict}</span>;
}

function Column({ side, label, sourceKey, findingId }: { side: "baseline" | "hardened"; label: string; sourceKey: string; findingId: string }) {
  const { source, loadSource, findingFor } = useLab();
  useEffect(() => { void loadSource(sourceKey); }, [sourceKey, loadSource]);
  const finding = findingFor(findingId, side);
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="panel-b flex items-center justify-between px-3 py-2">
        <span className={`display text-[11px] ${side === "hardened" ? "text-glow-cyan" : "text-[var(--text-dim)]"}`}>{label}</span>
        <VerdictTag finding={finding} side={side} />
      </div>
      {finding && <div className="panel-b px-3 py-2 text-[11px] leading-relaxed text-[var(--text-dim)]">{finding.summary}</div>}
      <CodeView code={source[sourceKey] ?? "// loading…"} />
      <div className="panel-b border-t px-3 py-1 text-[10px] text-[var(--text-faint)]">{sourceKey}</div>
    </div>
  );
}

export function SourcePane() {
  const { activeCheck } = useLab();
  const check = CHECKS.find((c) => c.findingId === activeCheck) ?? CHECKS[0];
  const [glitch, setGlitch] = useState(false);
  useEffect(() => { setGlitch(true); const t = setTimeout(() => setGlitch(false), 450); return () => clearTimeout(t); }, [activeCheck]);
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="panel-b bg-[var(--bg-panel)] px-4 py-3">
        <motion.h2 key={check.findingId} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
          className={`glitch ${glitch ? "is-on" : ""} display text-sm text-[var(--text)]`} data-text={check.title}>{check.title}</motion.h2>
        <p className="mt-0.5 text-xs text-[var(--text-dim)]">{check.blurb}</p>
        <p className="mt-1 text-xs text-glow-green">→ {check.fix}</p>
      </div>
      <div className="flex flex-1 divide-x divide-[var(--border)] overflow-hidden">
        <Column side="baseline" label="Without Security Skill" sourceKey={check.baselineSource} findingId={check.findingId} />
        <Column side="hardened" label="With Security Skill" sourceKey={check.hardenedSource} findingId={check.findingId} />
      </div>
    </div>
  );
}
