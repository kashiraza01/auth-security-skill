// Dependency-free stats for timing comparisons. Ported from the round-1
// TypeScript harness. The discipline: median not mean, an effect size that does
// not assume normality (Cliff's delta), and a non-parametric significance test
// (Mann-Whitney U). A "measurable difference" is never "exploitable".

export function summarise(samples) {
  if (samples.length === 0) return { n: 0, min: 0, max: 0, mean: 0, median: 0, p95: 0, stdev: 0 };
  const s = [...samples].sort((a, b) => a - b);
  const n = s.length;
  const mean = s.reduce((a, x) => a + x, 0) / n;
  const variance = s.reduce((a, x) => a + (x - mean) ** 2, 0) / n;
  return { n, min: s[0], max: s[n - 1], mean, median: percentile(s, 50), p95: percentile(s, 95), stdev: Math.sqrt(variance) };
}

export function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

export const dropWarmup = (xs, k) => (xs.length > k ? xs.slice(k) : xs);

export function mannWhitneyU(a, b) {
  const na = a.length, nb = b.length;
  const combined = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))].sort((x, y) => x.v - y.v);
  const ranks = new Array(combined.length);
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j + 1 < combined.length && combined[j + 1].v === combined[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  let rankSumA = 0;
  for (let k = 0; k < combined.length; k++) if (combined[k].g === 0) rankSumA += ranks[k];
  const uA = rankSumA - (na * (na + 1)) / 2;
  const u = Math.min(uA, na * nb - uA);
  const meanU = (na * nb) / 2;
  const sdU = Math.sqrt((na * nb * (na + nb + 1)) / 12);
  const z = sdU === 0 ? 0 : (u - meanU) / sdU;
  return { u, z, p: 2 * (1 - normalCdf(Math.abs(z))) };
}

function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const prob = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return 1 - prob;
}

export function cliffsDelta(a, b) {
  let gt = 0, lt = 0;
  for (const x of a) for (const y of b) { if (x > y) gt++; else if (x < y) lt++; }
  const delta = (gt - lt) / (a.length * b.length);
  const abs = Math.abs(delta);
  const magnitude = abs < 0.147 ? "negligible" : abs < 0.33 ? "small" : abs < 0.474 ? "medium" : "large";
  return { delta, magnitude };
}
