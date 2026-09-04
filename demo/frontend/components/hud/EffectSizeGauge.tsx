"use client";

import { motion } from "framer-motion";

// Radial gauge for Cliff's delta (0..1), with the magnitude bands marked. Needle
// swings from ~1.00 (baseline, large) to ~0.09 (hardened, negligible).
const BANDS = [
  { to: 0.147, label: "negligible", color: "var(--green)" },
  { to: 0.33, label: "small", color: "var(--amber)" },
  { to: 0.474, label: "medium", color: "#ff7a1a" },
  { to: 1, label: "large", color: "var(--red)" },
];

export function EffectSizeGauge({ delta }: { delta: number | null }) {
  const val = delta == null ? 0 : Math.min(1, Math.abs(delta));
  const R = 66, CX = 80, CY = 80;
  // semicircle from 180° (left) to 0° (right)
  const angle = (t: number) => Math.PI - t * Math.PI;
  const pt = (t: number, r = R) => [CX + r * Math.cos(angle(t)), CY - r * Math.sin(angle(t))];
  const arc = (from: number, to: number, r = R) => {
    const [x1, y1] = pt(from, r), [x2, y2] = pt(to, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const active = BANDS.find((b) => val <= b.to) ?? BANDS[BANDS.length - 1];
  const [nx, ny] = pt(val, R - 10);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 160 96" className="w-full max-w-[200px]">
        {BANDS.map((b, i) => {
          const from = i === 0 ? 0 : BANDS[i - 1].to;
          return <path key={b.label} d={arc(from, b.to)} fill="none" stroke={b.color} strokeWidth="8" opacity={delta == null ? 0.18 : val <= b.to && val > from ? 0.95 : 0.28} strokeLinecap="butt" />;
        })}
        {delta != null && (
          <motion.line x1={CX} y1={CY} x2={nx} y2={ny} stroke="var(--text)" strokeWidth="2"
            initial={{ x2: pt(0, R - 10)[0], y2: pt(0, R - 10)[1] }}
            animate={{ x2: nx, y2: ny }} transition={{ type: "spring", stiffness: 60, damping: 12 }} />
        )}
        <circle cx={CX} cy={CY} r="3.5" fill="var(--text)" />
      </svg>
      <div className="-mt-1 text-center">
        <div className="display text-lg" style={{ color: active.color }}>{delta == null ? "—" : val.toFixed(2)}</div>
        <div className="hairline">Cliff&apos;s δ · {delta == null ? "effect size" : active.label}</div>
      </div>
    </div>
  );
}
