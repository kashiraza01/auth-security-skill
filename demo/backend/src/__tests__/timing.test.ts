import request from "supertest";
import type { Express } from "express";
import { buildApp } from "./helpers/app";
import { startTestDb, stopTestDb, clearDb } from "./helpers/db";
import { cliffsDelta, median, timeMs } from "./helpers/stats";

/**
 * Regression test for the login timing / user-enumeration finding.
 *
 * Baseline: known-account-wrong-password should be clearly slower than unknown
 *           account (the vulnerability — asserted so we notice if it disappears
 *           by accident).
 * Hardened: the two should be statistically indistinguishable (the fix).
 *
 * Assertions are on a threshold and an effect size with margin, never an exact ms.
 */

let app: Express;

beforeAll(async () => {
  await startTestDb();
  app = await buildApp();
});
afterAll(stopTestDb);
beforeEach(clearDb);

// In-process supertest timings are noisier than a real HTTP run — the
// authoritative measurement is `npm run audit` (docs/findings.json), which uses
// more samples over a socket. This test is a regression guard: it asserts the
// EFFECT SIZE stays negligible/small (Cliff's delta), with a generous absolute
// bound as a sanity check.
const SAMPLES = 50;
const WARMUP = 10;

async function collect(stack: "baseline" | "hardened", knownEmail: string) {
  const unknown: number[] = [];
  const known: number[] = [];
  for (let i = 0; i < SAMPLES + WARMUP; i++) {
    // Keep the known account out of lockout so every sample measures the
    // credential-verification path, not a fast "locked" rejection.
    if (i % 3 === 0) await request(app).post("/api/_lab/reset-lockouts");

    unknown.push(
      await timeMs(() =>
        request(app)
          .post(`/api/${stack}/auth/login`)
          .send({ email: `ghost-${i}@x.test`, password: "wrong-pw" }),
      ),
    );
    known.push(
      await timeMs(() =>
        request(app)
          .post(`/api/${stack}/auth/login`)
          .send({ email: knownEmail, password: "wrong-pw" }),
      ),
    );
  }
  return { unknown: unknown.slice(WARMUP), known: known.slice(WARMUP) };
}

it("baseline: known-account login is measurably slower (the vulnerability)", async () => {
  await request(app)
    .post("/api/baseline/auth/register")
    .send({ email: "victim@x.test", password: "abcd" });

  const { unknown, known } = await collect("baseline", "victim@x.test");
  const delta = median(known) - median(unknown);
  const cd = cliffsDelta(known, unknown);

  // bcrypt cost 8 vs no hash — expect a big, clean gap
  expect(delta).toBeGreaterThan(5);
  expect(cd).toBeGreaterThan(0.5);
}, 60000);

it("hardened: known and unknown accounts are indistinguishable by time (the fix)", async () => {
  await request(app)
    .post("/api/hardened/auth/register")
    .send({ email: "victim@x.test", password: "a-perfectly-fine-passphrase" });

  const { unknown, known } = await collect("hardened", "victim@x.test");
  const delta = Math.abs(median(known) - median(unknown));
  const cd = Math.abs(cliffsDelta(known, unknown));

  // constant-work path: both branches run one Argon2id verify (~30-50 ms each).
  // The effect size is the real claim — the distributions must substantially
  // overlap. The absolute bound is generous because 50 in-process samples are
  // noisy; the socket-level audit run gets this to well under 1 ms.
  expect(cd).toBeLessThan(0.33); // below "medium" effect size — distributions overlap
  expect(delta).toBeLessThan(20); // sanity: smaller than one verify's own variance
}, 90000);
