"use client";

import Link from "next/link";
import { CheckNav } from "./CheckNav";
import { SourcePane } from "./SourcePane";
import { TerminalPanel } from "./TerminalPanel";

export function LabWorkspace() {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--cyber-border)] bg-[var(--cyber-panel)] px-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-zinc-500 hover:text-cyber-cyan">
            ← exit
          </Link>
          <span className="text-xs font-bold uppercase tracking-[0.25em] text-glow-cyan">
            SYS_SEC_LAB // DAY_07
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-zinc-600">
          auth-security-breaker · auth-security-hardener
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <CheckNav />
        <SourcePane />
        <TerminalPanel />
      </div>
    </div>
  );
}
