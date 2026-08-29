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

function cookieHeader(setCookie: string | string[] | undefined): string {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return arr.map((c) => c.split(";")[0]).join("; ");
}

describe("session lifecycle — baseline (vulnerable, asserted)", () => {
  it("access token still works after logout", async () => {
    const reg = await request(app)
      .post("/api/baseline/auth/register")
      .send({ email: "u@x.test", password: "abcd" });
    await request(app).post("/api/baseline/auth/logout").set("Authorization", `Bearer ${reg.body.accessToken}`);
    const me = await request(app).get("/api/baseline/auth/me").set("Authorization", `Bearer ${reg.body.accessToken}`);
    expect(me.status).toBe(200);
  });

  it("tokens issued before a password change keep working", async () => {
    const reg = await request(app)
      .post("/api/baseline/auth/register")
      .send({ email: "u@x.test", password: "abcd" });
    await request(app)
      .post("/api/baseline/auth/change-password")
      .set("Authorization", `Bearer ${reg.body.accessToken}`)
      .send({ newPassword: "wxyz" });
    const me = await request(app).get("/api/baseline/auth/me").set("Authorization", `Bearer ${reg.body.accessToken}`);
    expect(me.status).toBe(200);
  });
});

describe("session lifecycle — hardened (the fix)", () => {
  async function session(email: string, password = "a-perfectly-fine-passphrase") {
    await request(app).post("/api/hardened/auth/register").send({ email, password });
    const login = await request(app).post("/api/hardened/auth/login").send({ email, password });
    return { token: login.body.accessToken as string, cookie: cookieHeader(login.headers["set-cookie"]) };
  }

  it("access token is rejected after logout", async () => {
    const s = await session("u@x.test");
    await request(app)
      .post("/api/hardened/auth/logout")
      .set("Authorization", `Bearer ${s.token}`)
      .set("Cookie", s.cookie);
    const me = await request(app).get("/api/hardened/auth/me").set("Authorization", `Bearer ${s.token}`);
    expect(me.status).toBe(401);
  });

  it("all tokens die on a password change", async () => {
    const s = await session("u@x.test");
    const change = await request(app)
      .post("/api/hardened/auth/change-password")
      .set("Authorization", `Bearer ${s.token}`)
      .set("Cookie", s.cookie)
      .send({ currentPassword: "a-perfectly-fine-passphrase", newPassword: "a-brand-new-passphrase-99" });
    expect(change.status).toBe(200);
    const me = await request(app).get("/api/hardened/auth/me").set("Authorization", `Bearer ${s.token}`);
    expect(me.status).toBe(401);
  });

  it("logout-all revokes every session for the user", async () => {
    const a = await session("multi@x.test");
    const b = await request(app)
      .post("/api/hardened/auth/login")
      .send({ email: "multi@x.test", password: "a-perfectly-fine-passphrase" });
    const bToken = b.body.accessToken as string;

    await request(app)
      .post("/api/hardened/auth/logout-all")
      .set("Authorization", `Bearer ${a.token}`)
      .set("Cookie", a.cookie);

    const meA = await request(app).get("/api/hardened/auth/me").set("Authorization", `Bearer ${a.token}`);
    const meB = await request(app).get("/api/hardened/auth/me").set("Authorization", `Bearer ${bToken}`);
    expect(meA.status).toBe(401);
    expect(meB.status).toBe(401);
  });

  it("a rotated refresh token cannot be replayed", async () => {
    const s = await session("rot@x.test");
    const first = await request(app).post("/api/hardened/auth/refresh").set("Cookie", s.cookie);
    expect(first.status).toBe(200);
    const replay = await request(app).post("/api/hardened/auth/refresh").set("Cookie", s.cookie);
    expect(replay.status).toBe(401);
  });
});
