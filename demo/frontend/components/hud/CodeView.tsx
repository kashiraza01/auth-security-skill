"use client";

import { tokenize, TOK_COLOR, lineMark } from "@/lib/highlight";

// Line-numbered, syntax-highlighted, with vulnerable (❌) / fixed (✅) lines
// tinted. No highlighting library — see lib/highlight.ts.
export function CodeView({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <pre className="flex-1 overflow-auto bg-[var(--bg)] text-[11px] leading-[1.55]">
      <code className="block">
        {lines.map((line, i) => {
          const mark = lineMark(line);
          const bg = mark === "bad" ? "rgba(255,45,85,0.09)" : mark === "good" ? "rgba(34,224,107,0.08)" : "transparent";
          const rail = mark === "bad" ? "var(--red)" : mark === "good" ? "var(--green)" : "transparent";
          return (
            <div key={i} className="flex" style={{ background: bg, borderLeft: `2px solid ${rail}` }}>
              <span className="select-none pr-3 pl-2 text-right text-[var(--text-faint)]" style={{ minWidth: "3ch" }}>{i + 1}</span>
              <span className="whitespace-pre pr-3">
                {tokenize(line).map((t, j) => (
                  <span key={j} style={{ color: TOK_COLOR[t.t] ?? "var(--text)" }}>{t.v}</span>
                ))}
                {line === "" ? " " : ""}
              </span>
            </div>
          );
        })}
      </code>
    </pre>
  );
}
