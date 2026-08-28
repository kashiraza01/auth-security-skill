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
beforeEach(clearDb);

async function registerBaseline(email: string, password: string, role?: string) {
  return request(app).post("/api/baseline/auth/register").send({ email, password, role });
}
async function registerHardened(email: string, password: string) {
  return request(app).post("/api/hardened/auth/register").send({ email, password });
}

describe("login — baseline", () => {
  it("logs in with correct credentials", async () => {
    await registerBaseline("walterw@x.test", "abcd");
    const res = await request(app).post("/api/baseline/auth/login").send({ email: "walterw@x.test", password: "abcd" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it("rejects a wrong password with a password-specific message", async () => {
    await registerBaseline("walterw@x.test", "abcd");
    const res = await request(app).post("/api/baseline/auth/login").send({ email: "walterw@x.test", password: "nope" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/incorrect password/i);
  });

  it("rejects an unknown email with an email-specific message (enumeration)", async () => {
    const res = await request(app).post("/api/baseline/auth/login").send({ email: "ghostuser@x.test", password: "abcd" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no account found/i);
  });

  it("protects /me and returns identity for a valid token", async () => {
    const reg = await registerBaseline("walterw@x.test", "abcd");
    const res = await request(app)
      .get("/api/baseline/auth/me")
      .set("Authorization", `Bearer ${reg.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("walterw@x.test");
  });

  it("rejects /me without a token", async () => {
    const res = await request(app).get("/api/baseline/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("login — hardened", () => {
  it("logs in with correct credentials", async () => {
    await registerHardened("harriet@x.test", "a-perfectly-fine-passphrase");
    const res = await request(app)
      .post("/api/hardened/auth/login")
      .send({ email: "harriet@x.test", password: "a-perfectly-fine-passphrase" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.expiresIn).toBeGreaterThan(0);
  });

  it("returns the SAME generic error for wrong password and unknown email", async () => {
    await registerHardened("harriet@x.test", "a-perfectly-fine-passphrase");
    const wrongPw = await request(app)
      .post("/api/hardened/auth/login")
      .send({ email: "harriet@x.test", password: "wrong-passphrase-here" });
    const unknown = await request(app)
      .post("/api/hardened/auth/login")
      .send({ email: "ghostuser@x.test", password: "wrong-passphrase-here" });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body.error).toBe(unknown.body.error);
    expect(wrongPw.body.error).toBe("Invalid email or password");
  });

  it("protects /me", async () => {
    await registerHardened("harriet@x.test", "a-perfectly-fine-passphrase");
    const login = await request(app)
      .post("/api/hardened/auth/login")
      .send({ email: "harriet@x.test", password: "a-perfectly-fine-passphrase" });
    const me = await request(app)
      .get("/api/hardened/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.role).toBe("user");
  });
});
