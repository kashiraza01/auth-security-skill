import request from "supertest";
import type { Express } from "express";
import { buildApp } from "./helpers/app";
import { startTestDb, stopTestDb, clearDb } from "./helpers/db";

/**
 * The hardening must not have broken the happy path. Full register -> login ->
 * me -> refresh -> logout for both stacks, plus the response-shape contract.
 */

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

function cookie(setCookie: string | string[] | undefined): string {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return arr.map((c) => c.split(";")[0]).join("; ");
}

function setCookieArray(setCookie: string | string[] | undefined): string[] {
  return Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
}

it("baseline: full auth flow works and keeps its response contract", async () => {
  const reg = await request(app)
    .post("/api/baseline/auth/register")
    .send({ email: "flow@x.test", password: "abcd" });
  expect(reg.status).toBe(201);
  expect(reg.body).toMatchObject({ user: { email: "flow@x.test", role: "user" } });
  expect(typeof reg.body.accessToken).toBe("string");

  const login = await request(app).post("/api/baseline/auth/login").send({ email: "flow@x.test", password: "abcd" });
  expect(login.status).toBe(200);

  const me = await request(app).get("/api/baseline/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
  expect(me.status).toBe(200);
  expect(me.body.email).toBe("flow@x.test");

  const refresh = await request(app)
    .post("/api/baseline/auth/refresh")
    .send({ refreshToken: login.body.refreshToken });
  expect(refresh.status).toBe(200);
  expect(typeof refresh.body.accessToken).toBe("string");

  const logout = await request(app).post("/api/baseline/auth/logout");
  expect(logout.status).toBe(200);
});

it("hardened: full auth flow works and keeps its response contract", async () => {
  const reg = await request(app)
    .post("/api/hardened/auth/register")
    .send({ email: "flow@x.test", password: "a-perfectly-fine-passphrase" });
  expect(reg.status).toBe(202);
  expect(reg.body.ok).toBe(true);

  const login = await request(app)
    .post("/api/hardened/auth/login")
    .send({ email: "flow@x.test", password: "a-perfectly-fine-passphrase" });
  expect(login.status).toBe(200);
  expect(login.body).toMatchObject({ user: { email: "flow@x.test", role: "user" } });
  expect(typeof login.body.accessToken).toBe("string");
  expect(login.body.expiresIn).toBeGreaterThan(0);
  const refreshCookie = cookie(login.headers["set-cookie"]);
  expect(refreshCookie).toMatch(/hardened_refresh_token=/);
  // the refresh cookie must be HttpOnly + SameSite=Strict
  const raw = setCookieArray(login.headers["set-cookie"]).find((c) => c.includes("hardened_refresh_token"));
  expect(raw).toMatch(/HttpOnly/i);
  expect(raw).toMatch(/SameSite=Strict/i);

  const me = await request(app).get("/api/hardened/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
  expect(me.status).toBe(200);
  expect(me.body.role).toBe("user");

  const refresh = await request(app).post("/api/hardened/auth/refresh").set("Cookie", refreshCookie);
  expect(refresh.status).toBe(200);
  expect(typeof refresh.body.accessToken).toBe("string");

  const newCookie = cookie(refresh.headers["set-cookie"]);
  const logout = await request(app)
    .post("/api/hardened/auth/logout")
    .set("Authorization", `Bearer ${refresh.body.accessToken}`)
    .set("Cookie", newCookie || refreshCookie);
  expect(logout.status).toBe(200);
});

it("hardened error handler does not leak a stack trace", async () => {
  const email = `dup-${Date.now()}@x.test`;
  await request(app).post("/api/hardened/auth/register").send({ email, password: "a-perfectly-fine-passphrase" });
  const dup = await request(app).post("/api/hardened/auth/register").send({ email, password: "a-perfectly-fine-passphrase" });
  const bodyStr = JSON.stringify(dup.body);
  expect(bodyStr).not.toMatch(/\/src\/|node_modules|at Object|E11000/);
});
