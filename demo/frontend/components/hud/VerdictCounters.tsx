"use client";

import { useEffect, useState } from "react";

// Animated odometer: counts to the live CONFIRMED total for each stack.
function Odometer({ value, color }: { value: number; color: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now(), from = n, dur = 700;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className="display text-3xl" style={{ color, textShadow: `0 0 12px ${color}66` }}>{n}</span>;
}

export function VerdictCounters({ baseline, hardened, hasData }: { baseline: number; hardened: number; hasData: boolean }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
      <div className="flex flex-col items-center py-3">
        {hasData ? <Odometer value={baseline} color="var(--red)" /> : <span className="display text-3xl text-[var(--text-faint)]">—</span>}
        <span className="hairline mt-1">without skill</span>
      </div>
      <div className="flex flex-col items-center py-3">
        {hasData ? <Odometer value={hardened} color={hardened ? "var(--red)" : "var(--green)"} /> : <span className="display text-3xl text-[var(--text-faint)]">—</span>}
        <span className="hairline mt-1">with skill</span>
      </div>
    </div>
  );
}
