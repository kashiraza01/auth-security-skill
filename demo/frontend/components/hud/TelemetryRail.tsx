"use client";

import { useState } from "react";
import { useLab } from "@/lib/store";
import { timingFrom } from "@/lib/telemetry";
import { TimingHistogram } from "./TimingHistogram";
import { EffectSizeGauge } from "./EffectSizeGauge";
import { VerdictCounters } from "./VerdictCounters";
import { SignalReadout } from "./SignalReadout";

// The telemetry deck. Always visualises the headline timing check, with a
// baseline/hardened toggle so you can flip the two-humps -> one-hump on camera.
// Counters + gauge + readout all read the live report.
export function TelemetryRail() {
  const { report, findingFor } = useLab();
  const [side, setSide] = useState<"baseline" | "hardened">("baseline");
  const timing = timingFrom(findingFor("timing-user-enumeration", side));

  const count = (stack: "baseline" | "hardened") =>
    report ? report.findings.filter((f) => f.stack === stack && f.verdict === "CONFIRMED").length : 0;

  return (
    <div className="panel-b grid grid-cols-[1.6fr_1fr] gap-0 bg-[var(--bg-panel)]">
      {/* left: histogram + readout */}
      <div className="border-r border-[var(--border)] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="hairline">login-timing distribution</span>
          <div className="flex overflow-hidden border border-[var(--border-bright)] text-[10px]">
            {(["baseline", "hardened"] as const).map((s) => (
              <button key={s} onClick={() => setSide(s)}
                className={`px-2 py-0.5 uppercase tracking-widest transition ${side === s ? "bg-[var(--cyan)]/15 text-[var(--cyan)]" : "text-[var(--text-dim)] hover:text-[var(--text)]"}`}>{s}</button>
            ))}
          </div>
        </div>
        <div className="h-[168px]"><TimingHistogram data={timing} /></div>
        <div className="mt-2"><SignalReadout data={timing} /></div>
      </div>
      {/* right: counters + effect gauge */}
      <div className="flex flex-col">
        <VerdictCounters baseline={count("baseline")} hardened={count("hardened")} hasData={!!report} />
        <div className="flex flex-1 items-center justify-center border-t border-[var(--border)] p-2">
          <EffectSizeGauge delta={timing ? timing.cliffsDelta : null} />
        </div>
      </div>
    </div>
  );
}
