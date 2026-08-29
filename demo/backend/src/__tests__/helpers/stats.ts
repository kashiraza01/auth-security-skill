/** Tiny stats for the timing regression test — median + Cliff's delta. */

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function cliffsDelta(a: number[], b: number[]): number {
  let gt = 0;
  let lt = 0;
  for (const x of a) for (const y of b) {
    if (x > y) gt++;
    else if (x < y) lt++;
  }
  return (gt - lt) / (a.length * b.length);
}

/** Time an async fn in milliseconds with a high-resolution clock. */
export async function timeMs(fn: () => Promise<unknown>): Promise<number> {
  const start = process.hrtime.bigint();
  await fn();
  return Number(process.hrtime.bigint() - start) / 1e6;
}
