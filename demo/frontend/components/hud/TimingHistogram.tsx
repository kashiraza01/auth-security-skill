"use client";

import { motion } from "framer-motion";
import { histogram, sharedRange, type TimingData } from "@/lib/telemetry";

// The money shot: two overlaid density plots. Baseline = two separated humps
// (an oracle). Hardened = the humps sit on top of each other. Every value is from
// the live audit's raw samples.
export function TimingHistogram({ data }: { data: TimingData | null }) {
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--text-faint)]">
        run the audit to plot the login-timing distributions
      </div>
    );
  }
  const BINS = 26, W = 520, H = 150, PAD = 8;
  const [min, max] = sharedRange(data.unknown.samples, data.known.samples);
  const hu = histogram(data.unknown.samples, min, max, BINS);
  const hk = histogram(data.known.samples, min, max, BINS);
  const peak = Math.max(1, ...hu, ...hk);
  const bw = (W - PAD * 2) / BINS;
  const bars = (h: number[]) => h.map((c, i) => ({ x: PAD + i * bw, h: (c / peak) * (H - 24) }));
  const medianX = (m: number) => PAD + ((m - min) / (max - min || 1)) * (W - PAD * 2);

  return (
    <div className="flex h-full flex-col">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <line x1={PAD} y1={H - 20} x2={W - PAD} y2={H - 20} stroke="var(--border-bright)" strokeWidth="1" />
        {bars(hu).map((b, i) => (
          <motion.rect key={`u${i}`} x={b.x + 0.5} width={bw - 1}
            fill="var(--cyan)" opacity="0.42"
            initial={{ height: 0, y: H - 20 }} animate={{ height: b.h, y: H - 20 - b.h }}
            transition={{ delay: i * 0.012, duration: 0.4, ease: "easeOut" }} />
        ))}
        {bars(hk).map((b, i) => (
          <motion.rect key={`k${i}`} x={b.x + 0.5} width={bw - 1}
            fill="var(--red)" opacity="0.42"
            initial={{ height: 0, y: H - 20 }} animate={{ height: b.h, y: H - 20 - b.h }}
            transition={{ delay: i * 0.012, duration: 0.4, ease: "easeOut" }} />
        ))}
        <line x1={medianX(data.unknown.median)} y1={4} x2={medianX(data.unknown.median)} y2={H - 20} stroke="var(--cyan)" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1={medianX(data.known.median)} y1={4} x2={medianX(data.known.median)} y2={H - 20} stroke="var(--red)" strokeWidth="1.5" strokeDasharray="3 3" />
        <text x={PAD} y={H - 6} fill="var(--text-faint)" fontSize="9">{min.toFixed(1)} ms</text>
        <text x={W - PAD} y={H - 6} fill="var(--text-faint)" fontSize="9" textAnchor="end">{max.toFixed(1)} ms</text>
      </svg>
      <div className="mt-1 flex items-center justify-between px-1 text-[10px]">
        <span className="text-glow-cyan">■ unknown · {data.unknown.median.toFixed(1)}ms</span>
        <span className="text-[var(--text-dim)]">Δ {data.medianDeltaMs.toFixed(1)}ms</span>
        <span className="text-glow-red">■ known · {data.known.median.toFixed(1)}ms</span>
      </div>
    </div>
  );
}
