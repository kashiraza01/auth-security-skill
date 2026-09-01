"use client";

import { useEffect } from "react";
import { useLab } from "@/lib/store";
import { CHECKS } from "@/lib/checks";
import type { Finding } from "@/lib/types";

function VerdictBadge({ finding, side }: { finding: Finding | undefined; side: "baseline" | "hardened" }) {
  if (!finding) {
    return <span className="text-[10px] uppercase tracking-widest text-zinc-600">run the audit →</span>;
  }
  const good = finding.verdict !== "CONFIRMED";
  const colour =
    finding.verdict === "CONFIRMED"
      ? "text-cyber-red border-cyber-red/40 bg-cyber-red/10"
      : side === "hardened"
        ? "text-cyber-green border-cyber-green/40 bg-cyber-green/10"
        : "text-zinc-400 border-zinc-700 bg-white/5";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${colour}`}>
      {good ? "✓ " : "✗ "}
      {finding.verdict}
    </span>
  );
}

function Column({
  side,
  label,
  sourceKey,
  findingId,
}: {
  side: "baseline" | "hardened";
  label: string;
  sourceKey: string;
  findingId: string;
}) {
  const { source, loadSource, findingFor } = useLab();
  useEffect(() => {
    void loadSource(sourceKey);
  }, [sourceKey, loadSource]);
  const finding = findingFor(findingId, side);
  const code = source[sourceKey] ?? "// loading…";

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--cyber-border)] px-3 py-2">
        <span
          className={`text-[11px] font-bold uppercase tracking-widest ${
            side === "baseline" ? "text-zinc-400" : "text-cyber-cyan"
          }`}
        >
          {label}
        </span>
        <VerdictBadge finding={finding} side={side} />
      </div>

      {finding && (
        <div className="border-b border-[var(--cyber-border)] px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
          {finding.summary}
        </div>
      )}

      <pre className="flex-1 overflow-auto bg-[var(--cyber-black)] px-3 py-2 text-[11px] leading-relaxed text-zinc-300">
        <code>{code}</code>
      </pre>

      <div className="border-t border-[var(--cyber-border)] px-3 py-1.5 text-[10px] text-zinc-600">
        {sourceKey}
      </div>
    </div>
  );
}

export function SourcePane() {
  const { activeCheck } = useLab();
  const check = CHECKS.find((c) => c.findingId === activeCheck) ?? CHECKS[0];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-[var(--cyber-border)] bg-[var(--cyber-panel)] px-4 py-3">
        <h2 className="text-sm font-bold text-zinc-100">{check.title}</h2>
        <p className="mt-0.5 text-xs text-zinc-500">{check.blurb}</p>
        <p className="mt-1 text-xs text-cyber-green">→ {check.fix}</p>
      </div>
      <div className="flex flex-1 divide-x divide-[var(--cyber-border)] overflow-hidden">
        <Column side="baseline" label="Without Security Skill" sourceKey={check.baselineSource} findingId={check.findingId} />
        <Column side="hardened" label="With Security Skill" sourceKey={check.hardenedSource} findingId={check.findingId} />
      </div>
      <EvidenceStrip findingId={check.findingId} />
    </div>
  );
}

function EvidenceStrip({ findingId }: { findingId: string }) {
  const { findingFor } = useLab();
  const b = findingFor(findingId, "baseline");
  const h = findingFor(findingId, "hardened");
  if (!b && !h) return null;
  return (
    <div className="grid grid-cols-2 divide-x divide-[var(--cyber-border)] border-t border-[var(--cyber-border)] bg-[var(--cyber-panel)] text-[10px]">
      {[b, h].map((f, i) => (
        <div key={i} className="max-h-28 overflow-auto p-2">
          <div className="mb-1 uppercase tracking-widest text-zinc-600">
            {i === 0 ? "baseline" : "hardened"} evidence
          </div>
          <pre className="whitespace-pre-wrap break-all text-zinc-500">
            {f ? JSON.stringify(f.evidence, null, 1) : "—"}
          </pre>
          {f?.limitations && <div className="mt-1 text-zinc-600">⚠ {f.limitations}</div>}
        </div>
      ))}
    </div>
  );
}
