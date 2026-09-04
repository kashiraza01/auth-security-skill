"use client";

import { useState } from "react";
import Link from "next/link";
import { BootSequence } from "./BootSequence";
import { HudBackground, CrtOverlay } from "./CrtOverlay";
import { CheckNav } from "./CheckNav";
import { SourcePane } from "./SourcePane";
import { TelemetryRail } from "./TelemetryRail";
import { TerminalPanel } from "./TerminalPanel";

export function LabWorkspace() {
  const [booted, setBooted] = useState(false);
  return (
    <>
      <HudBackground />
      <CrtOverlay />
      <BootSequence onDone={() => setBooted(true)} />

      <div className="relative z-10 flex h-screen flex-col" style={{ opacity: booted ? 1 : 0, transition: "opacity 0.4s" }}>
        <header className="panel-b flex h-12 shrink-0 items-center justify-between bg-[var(--bg-panel)] px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="hairline hover:text-[var(--cyan)]">← exit</Link>
            <span className="display text-sm text-glow-cyan">SYS_SEC_LAB // DAY_07</span>
          </div>
          <span className="hairline hidden md:block">auth-security-breaker · auth-security-hardener · auth-security-loop</span>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <CheckNav />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TelemetryRail />
            <SourcePane />
          </div>
          <TerminalPanel />
        </div>
      </div>
    </>
  );
}
