/**
 * Small, dependency-free stats for timing comparisons.
 *
 * The point of these is honesty: a timing side-channel claim needs repeated
 * measurement, a central-tendency number that is robust to outliers (median, not
 * mean), a spread, an effect size, and a non-parametric significance check that
 * does not assume a normal distribution (HTTP timings are not normal). Even then
 * the verdict is "there is a measurable difference", never "this is remotely
 * exploitable".
 */

export interface Summary {
  n: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  stdev: number;
}

export function summarise(samples: number[]): Summary {
  if (samples.length === 0) {
    return { n: 0, min: 0, max: 0, mean: 0, median: 0, p95: 0, stdev: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, x) => s + x, 0) / n;
  const variance = sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  return {
    n,
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    stdev: Math.sqrt(variance),
  };
}

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

/** Drop the first `count` samples (JIT / connection warm-up). */
export function dropWarmup(samples: number[], count: number): number[] {
  return samples.length > count ? samples.slice(count) : samples;
}

/**
 * Mann–Whitney U (a.k.a. Wilcoxon rank-sum) with a normal approximation.
 * Returns U, the z-score, and a two-sided p-value. Valid for n > ~20 per group.
 */
export function mannWhitneyU(a: number[], b: number[]): { u: number; z: number; p: number } {
  const na = a.length;
  const nb = b.length;
  const combined = [
    ...a.map((v) => ({ v, g: 0 })),
    ...b.map((v) => ({ v, g: 1 })),
  ].sort((x, y) => x.v - y.v);

  // average ranks for ties
  const ranks = new Array<number>(combined.length);
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j + 1 < combined.length && combined[j + 1].v === combined[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    i = j + 1;
  }

  let rankSumA = 0;
  for (let k = 0; k < combined.length; k++) if (combined[k].g === 0) rankSumA += ranks[k];

  const uA = rankSumA - (na * (na + 1)) / 2;
  const uB = na * nb - uA;
  const u = Math.min(uA, uB);

  const meanU = (na * nb) / 2;
  const sdU = Math.sqrt((na * nb * (na + nb + 1)) / 12);
  const z = sdU === 0 ? 0 : (u - meanU) / sdU;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { u, z, p };
}

function normalCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const prob =
    d *
    t *
    (0.319381530 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return 1 - prob;
}

/**
 * Cliff's delta — a non-parametric effect size in [-1, 1]. 0 = distributions
 * fully overlap. |d| thresholds (Romano et al.): <0.147 negligible,
 * <0.33 small, <0.474 medium, else large.
 */
export function cliffsDelta(a: number[], b: number[]): { delta: number; magnitude: string } {
  let gt = 0;
  let lt = 0;
  for (const x of a) for (const y of b) {
    if (x > y) gt++;
    else if (x < y) lt++;
  }
  const delta = (gt - lt) / (a.length * b.length);
  const abs = Math.abs(delta);
  const magnitude =
    abs < 0.147 ? "negligible" : abs < 0.33 ? "small" : abs < 0.474 ? "medium" : "large";
  return { delta, magnitude };
}
