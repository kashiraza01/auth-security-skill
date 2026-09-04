// Pure helpers that turn a finding's raw evidence into plottable series. No
// hardcoded numbers — everything derives from the live audit report.
import type { Finding } from "./types";

export interface Cohort { n: number; median: number; p95: number; samples: number[]; }
export interface TimingData {
  unknown: Cohort; known: Cohort;
  medianDeltaMs: number; cliffsDelta: number; cliffsMagnitude: string;
  p: number; verdict: string;
}

export function timingFrom(f: Finding | undefined): TimingData | null {
  if (!f?.evidence) return null;
  const e = f.evidence as any;
  const u = e.unknownAccount, k = e.knownAccountWrongPassword;
  if (!u || !k || !Array.isArray(u.samples) || !Array.isArray(k.samples)) return null;
  return {
    unknown: { n: u.n, median: u.median, p95: u.p95, samples: u.samples },
    known: { n: k.n, median: k.median, p95: k.p95, samples: k.samples },
    medianDeltaMs: e.medianDeltaMs, cliffsDelta: e.cliffsDelta, cliffsMagnitude: e.cliffsMagnitude,
    p: e.mannWhitneyU?.p ?? 1, verdict: f.verdict,
  };
}

/** Histogram bin counts for a set of samples over a shared [min,max] range. */
export function histogram(samples: number[], min: number, max: number, bins: number): number[] {
  const out = new Array(bins).fill(0);
  const span = max - min || 1;
  for (const s of samples) {
    let i = Math.floor(((s - min) / span) * bins);
    if (i < 0) i = 0; if (i >= bins) i = bins - 1;
    out[i]++;
  }
  return out;
}

export function sharedRange(a: number[], b: number[]): [number, number] {
  const all = [...a, ...b];
  return [Math.min(...all), Math.max(...all)];
}
