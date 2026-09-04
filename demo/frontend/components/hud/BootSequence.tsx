"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Typed init lines -> progress bar -> glitch-wipe into the workspace. Skippable,
// and auto-skipped on repeat visits within a session (sessionStorage).
const LINES = [
  "SYS_SEC_LAB // DAY_07  ·  boot",
  "loading skills ......... auth-security-breaker · auth-security-hardener · auth-security-loop",
  "scope guard ............ localhost / 127.0.0.1 / ::1  [ARMED]",
  "target ................. http://localhost:4000",
  "stacks ................. /api/baseline/auth · /api/hardened/auth",
  "probe suite ............ timing · enumeration · authz · token/session · info-leak · brute-force",
  "ready.",
];

export function BootSequence({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let skip = false;
    try { skip = sessionStorage.getItem("hud-booted") === "1"; } catch {}
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (skip || reduced) { finish(); return; }
    const t = setInterval(() => setShown((s) => (s < LINES.length ? s + 1 : s)), 260);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (shown >= LINES.length) { const t = setTimeout(finish, 520); return () => clearTimeout(t); }
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  function finish() {
    try { sessionStorage.setItem("hud-booted", "1"); } catch {}
    setDone(true);
    setTimeout(onDone, 420);
  }

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg)]"
          exit={{ opacity: 0, filter: "blur(6px)" }} transition={{ duration: 0.4 }}
        >
          <div className="w-full max-w-2xl px-8 font-mono text-[13px] leading-relaxed">
            {LINES.slice(0, shown).map((l, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                className={i === 0 ? "display mb-2 text-glow-cyan" : "text-[var(--text-dim)]"}>
                {i === 0 ? l : <><span className="text-[var(--cyan-dim)]">$</span> {l}</>}
              </motion.div>
            ))}
            {shown >= LINES.length && (
              <motion.div className="mt-4 h-[3px] w-full bg-[var(--border)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <motion.div className="h-full bg-[var(--cyan)]" style={{ boxShadow: "var(--glow-cyan)" }}
                  initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 0.5 }} />
              </motion.div>
            )}
            <button onClick={finish} className="mt-6 hairline hover:text-[var(--cyan)]">skip ▸</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
