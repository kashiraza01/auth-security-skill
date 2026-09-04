"use client";

import type { TimingData } from "@/lib/telemetry";

// A HUD stat strip for the timing signal — all live numbers.
export function SignalReadout({ data }: { data: TimingData | null }) {
  const cells = [
    { k: "median Δ", v: data ? `${data.medianDeltaMs.toFixed(1)} ms` : "—" },
    { k: "Mann-Whitney p", v: data ? (data.p < 1e-3 ? data.p.toExponential(1) : data.p.toFixed(3)) : "—" },
    { k: "n / cohort", v: data ? String(data.unknown.n) : "—" },
    { k: "verdict", v: data ? data.verdict : "—" },
  ];
  const verdictColor = data?.verdict === "CONFIRMED" ? "var(--red)" : data ? "var(--green)" : "var(--text-faint)";
  return (
    <div className="grid grid-cols-4 divide-x divide-[var(--border)] border-t border-[var(--border)]">
      {cells.map((c) => (
        <div key={c.k} className="px-2 py-2">
          <div className="hairline">{c.k}</div>
          <div className="mt-0.5 font-mono text-sm" style={c.k === "verdict" ? { color: verdictColor } : undefined}>{c.v}</div>
        </div>
      ))}
    </div>
  );
}
