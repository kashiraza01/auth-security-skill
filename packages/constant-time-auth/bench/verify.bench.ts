/**
 * Measures what the library actually buys you: the response-time gap between an
 * "unknown account" and a "known account, wrong password" login, with and without
 * the constant-work path.
 *
 *   npm run bench -w @auth-lab/constant-time-auth
 *
 * Uses bcryptjs so it runs anywhere with no native build. Argon2 shows the same
 * shape with larger absolute numbers.
 */
import { Bench } from "tinybench";
import bcrypt from "bcryptjs";
import { createConstantTimeVerifier } from "../src/index";

const COST = 8;
const realHash = bcrypt.hashSync("the-real-password", COST);

const hasher = {
  hash: (pw: string) => bcrypt.hash(pw, COST),
  verify: (h: string, pw: string) => bcrypt.compare(pw, h),
};

// The naive, vulnerable shape: return early when there is no user.
async function naiveLogin(storedHash: string | null, password: string): Promise<boolean> {
  if (!storedHash) return false; // <-- the timing leak
  return bcrypt.compare(password, storedHash);
}

async function main(): Promise<void> {
  const ctv = createConstantTimeVerifier({ hasher });
  await ctv.warmup();

  const bench = new Bench({ time: 4000, warmupTime: 800 });

  bench
    .add("naive · unknown account", async () => {
      await naiveLogin(null, "any-password");
    })
    .add("naive · known account, wrong password", async () => {
      await naiveLogin(realHash, "wrong-password");
    })
    .add("constant-work · unknown account", async () => {
      await ctv.verify(null, "any-password");
    })
    .add("constant-work · known account, wrong password", async () => {
      await ctv.verify(realHash, "wrong-password");
    });

  await bench.run();

  // tinybench v3: latency values are in milliseconds.
  const meanMs = (name: string): number =>
    bench.tasks.find((t) => t.name === name)?.result?.latency.mean ?? NaN;
  const p99Ms = (name: string): number =>
    bench.tasks.find((t) => t.name === name)?.result?.latency.p99 ?? NaN;

  console.table(
    bench.tasks.map((t) => ({
      case: t.name,
      "mean (ms)": meanMs(t.name).toFixed(3),
      "p99 (ms)": p99Ms(t.name).toFixed(3),
    })),
  );

  const naiveGap = Math.abs(
    meanMs("naive · known account, wrong password") - meanMs("naive · unknown account"),
  );
  const ctwGap = Math.abs(
    meanMs("constant-work · known account, wrong password") -
      meanMs("constant-work · unknown account"),
  );
  const oneHash = meanMs("constant-work · unknown account"); // ~ one verify()

  console.log(`\n  naive gap (unknown vs known):         ${naiveGap.toFixed(2)} ms  (~one full hash)`);
  console.log(`  constant-work gap (unknown vs known): ${ctwGap.toFixed(2)} ms  (~${((ctwGap / oneHash) * 100).toFixed(0)}% of one verify)`);
  console.log("\n  The naive gap is a whole password hash — a clean oracle. The constant-work");
  console.log("  gap is a fraction of one verify()'s own run-to-run variance. It is not zero:");
  console.log("  the user lookup and hash variance remain. Pair with a generic error + lockout.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
