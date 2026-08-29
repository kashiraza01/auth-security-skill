import request from "supertest";
import jwt from "jsonwebtoken";
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

describe("authorization — baseline (vulnerable, asserted so regressions show)", () => {
  it("grants admin from a role field in the register body", async () => {
    const reg = await request(app)
      .post("/api/baseline/auth/register")
      .send({ email: "sneak@x.test", password: "abcd", role: "admin" });
    const res = await request(app)
      .get("/api/baseline/admin/users")
      .set("Authorization", `Bearer ${reg.body.accessToken}`);
    expect(res.status).toBe(200);
  });

  it("accepts a token re-signed with the fallback secret and role=admin", async () => {
    const reg = await request(app)
      .post("/api/baseline/auth/register")
      .send({ email: "normal@x.test", password: "abcd" });
    const decoded = jwt.decode(reg.body.accessToken) as Record<string, unknown>;
    const forged = jwt.sign({ ...decoded, role: "admin" }, "dev-secret", { algorithm: "HS256" });
    const res = await request(app)
      .get("/api/baseline/admin/users")
      .set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(200);
  });
});

describe("authorization — hardened (the fix)", () => {
  async function hardenedUser(email: string, password = "a-perfectly-fine-passphrase") {
    await request(app).post("/api/hardened/auth/register").send({ email, password });
    const login = await request(app).post("/api/hardened/auth/login").send({ email, password });
    return login.body.accessToken as string;
  }

  it("ignores role in the register body — user cannot reach the admin route", async () => {
    await request(app)
      .post("/api/hardened/auth/register")
      .send({ email: "sneak@x.test", password: "a-perfectly-fine-passphrase", role: "admin" });
    const login = await request(app)
      .post("/api/hardened/auth/login")
      .send({ email: "sneak@x.test", password: "a-perfectly-fine-passphrase" });
    const res = await request(app)
      .get("/api/hardened/admin/users")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("rejects a token re-signed with a guessed secret", async () => {
    const token = await hardenedUser("normal@x.test");
    const decoded = jwt.decode(token) as Record<string, unknown>;
    const forged = jwt.sign({ ...decoded, role: "admin" }, "dev-secret", { algorithm: "HS256" });
    const res = await request(app)
      .get("/api/hardened/admin/users")
      .set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it("rejects a token whose payload was edited without re-signing", async () => {
    const token = await hardenedUser("normal@x.test");
    const [h, , s] = token.split(".");
    const decoded = jwt.decode(token) as Record<string, unknown>;
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...decoded, role: "admin" })).toString(
      "base64url",
    )}.${s}`;
    const res = await request(app)
      .get("/api/hardened/admin/users")
      .set("Authorization", `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  it("lets a genuine admin through (authorization is a DB lookup, not a claim)", async () => {
    await hardenedUser("boss@x.test");
    await request(app).post("/api/_lab/promote").send({ email: "boss@x.test" });
    // existing token still says role:user in its claims — but the server re-reads the DB
    const login = await request(app)
      .post("/api/hardened/auth/login")
      .send({ email: "boss@x.test", password: "a-perfectly-fine-passphrase" });
    const res = await request(app)
      .get("/api/hardened/admin/users")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
  });
});
