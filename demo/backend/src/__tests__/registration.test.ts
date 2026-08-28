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

describe("registration — baseline", () => {
  it("creates a user and returns tokens", async () => {
    const res = await request(app)
      .post("/api/baseline/auth/register")
      .send({ email: "alice@x.test", password: "abcd" });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe("user");
  });

  it("accepts a 4-character password (weak policy)", async () => {
    const res = await request(app)
      .post("/api/baseline/auth/register")
      .send({ email: "weakpol@x.test", password: "1234" });
    expect(res.status).toBe(201);
  });

  it("lets the client pick role: admin (privilege assignment from body)", async () => {
    const res = await request(app)
      .post("/api/baseline/auth/register")
      .send({ email: "adminwannabe@x.test", password: "abcd", role: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("admin");
  });
});

describe("registration — hardened", () => {
  it("creates a user with a strong password and a neutral response", async () => {
    const res = await request(app)
      .post("/api/hardened/auth/register")
      .send({ email: "strongpass@x.test", password: "a-perfectly-fine-passphrase" });
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
    // no user object, no role, no token — nothing to enumerate on
    expect(res.body.user).toBeUndefined();
  });

  it("rejects a short password", async () => {
    const res = await request(app)
      .post("/api/hardened/auth/register")
      .send({ email: "shortpw@x.test", password: "short" });
    expect(res.status).toBe(400);
  });

  it("ignores a client-supplied role", async () => {
    await request(app)
      .post("/api/hardened/auth/register")
      .send({ email: "roletester@x.test", password: "a-perfectly-fine-passphrase", role: "admin" });
    const login = await request(app)
      .post("/api/hardened/auth/login")
      .send({ email: "roletester@x.test", password: "a-perfectly-fine-passphrase" });
    expect(login.body.user.role).toBe("user");
  });

  it("does not reveal whether an email is already registered", async () => {
    const first = await request(app)
      .post("/api/hardened/auth/register")
      .send({ email: "duplicate@x.test", password: "a-perfectly-fine-passphrase" });
    const second = await request(app)
      .post("/api/hardened/auth/register")
      .send({ email: "duplicate@x.test", password: "a-different-fine-passphrase" });
    expect(first.status).toBe(second.status);
    expect(first.body.message).toBe(second.body.message);
  });
});
