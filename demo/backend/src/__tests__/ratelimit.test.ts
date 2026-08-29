import request from "supertest";
import type { Express } from "express";
import { buildApp } from "./helpers/app";
import { startTestDb, stopTestDb, clearDb } from "./helpers/db";

let app: Express;

beforeAll(async () => {
  await startTestDb();
  app = await buildApp();
});
afterAll(stopTestDb);
beforeEach(async () => {
  await clearDb();
  await request(app).post("/api/_lab/reset-lockouts");
});

describe("brute-force resistance", () => {
  it("baseline: no throttle — 12 wrong attempts all return 401", async () => {
    await request(app).post("/api/baseline/auth/register").send({ email: "v@x.test", password: "abcd" });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await request(app).post("/api/baseline/auth/login").send({ email: "v@x.test", password: `no-${i}` });
      statuses.push(r.status);
    }
    expect(statuses.every((s) => s === 401)).toBe(true);
  });

  it("hardened: account locks after 5 failures", async () => {
    await request(app)
      .post("/api/hardened/auth/register")
      .send({ email: "v@x.test", password: "a-perfectly-fine-passphrase" });

    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await request(app)
        .post("/api/hardened/auth/login")
        .send({ email: "v@x.test", password: `no-${i}` });
      statuses.push(r.status);
    }
    // first 5 are credential failures (401), then the lock trips (429)
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5).some((s) => s === 429)).toBe(true);
  });

  it("hardened: lockout is per-account — a different account still works", async () => {
    await request(app)
      .post("/api/hardened/auth/register")
      .send({ email: "target@x.test", password: "a-perfectly-fine-passphrase" });
    await request(app)
      .post("/api/hardened/auth/register")
      .send({ email: "bystander@x.test", password: "a-perfectly-fine-passphrase" });

    for (let i = 0; i < 6; i++) {
      await request(app).post("/api/hardened/auth/login").send({ email: "target@x.test", password: `no-${i}` });
    }
    const locked = await request(app)
      .post("/api/hardened/auth/login")
      .send({ email: "target@x.test", password: "a-perfectly-fine-passphrase" });
    const ok = await request(app)
      .post("/api/hardened/auth/login")
      .send({ email: "bystander@x.test", password: "a-perfectly-fine-passphrase" });

    expect(locked.status).toBe(429);
    expect(ok.status).toBe(200);
  });
});
