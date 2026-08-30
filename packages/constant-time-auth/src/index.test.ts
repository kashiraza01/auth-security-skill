import { describe, it, expect, vi } from "vitest";
import { createConstantTimeVerifier, timingSafeStringEqual, type Hasher } from "./index";

/** A fake hasher whose verify() cost we can observe via call count. */
function fakeHasher(overrides: Partial<Hasher> = {}): Hasher & { calls: { hash: number; verify: number } } {
  const calls = { hash: 0, verify: 0 };
  return {
    calls,
    async hash(pw: string) {
      calls.hash++;
      return `fakehash:${pw.length}:${Buffer.from(pw).toString("hex").slice(0, 8)}`;
    },
    async verify(stored: string, pw: string) {
      calls.verify++;
      return stored === `real:${pw}`;
    },
    ...overrides,
  };
}

describe("createConstantTimeVerifier", () => {
  it("runs exactly one verify() whether or not a stored hash is given", async () => {
    const hasher = fakeHasher();
    const ctv = createConstantTimeVerifier({ hasher });

    await ctv.verify("real:hunter2", "hunter2"); // real hash present
    await ctv.verify(null, "hunter2"); // no hash
    await ctv.verify(undefined, "whatever"); // no hash
    await ctv.verify("", "whatever"); // empty == no hash

    expect(hasher.calls.verify).toBe(4);
  });

  it("returns true only for a real hash + correct password", async () => {
    const hasher = fakeHasher();
    const ctv = createConstantTimeVerifier({ hasher });

    expect(await ctv.verify("real:hunter2", "hunter2")).toBe(true);
    expect(await ctv.verify("real:hunter2", "wrong")).toBe(false);
    expect(await ctv.verify(null, "hunter2")).toBe(false);
  });

  it("builds a dummy hash once and reuses it", async () => {
    const hasher = fakeHasher();
    const ctv = createConstantTimeVerifier({ hasher });

    await ctv.verify(null, "a");
    await ctv.verify(null, "b");
    await ctv.verify(undefined, "c");

    expect(hasher.calls.hash).toBe(1);
    expect(ctv.getDummyHash()).toMatch(/^fakehash:/);
  });

  it("warmup() precomputes the dummy hash", async () => {
    const hasher = fakeHasher();
    const ctv = createConstantTimeVerifier({ hasher });
    await ctv.warmup();
    expect(hasher.calls.hash).toBe(1);
    expect(ctv.getDummyHash()).toBeDefined();
  });

  it("uses a supplied dummyHash without hashing", async () => {
    const hasher = fakeHasher();
    const ctv = createConstantTimeVerifier({ hasher, dummyHash: "premade:dummy" });
    await ctv.verify(null, "x");
    expect(hasher.calls.hash).toBe(0);
    expect(ctv.getDummyHash()).toBe("premade:dummy");
  });

  it("swallows verify() errors and reports a non-match", async () => {
    const hasher = fakeHasher({
      async verify() {
        throw new Error("bad hash string");
      },
    });
    const ctv = createConstantTimeVerifier({ hasher });
    expect(await ctv.verify("garbage", "x")).toBe(false);
  });

  it("optional jitter adds a bounded delay and does not change the result", async () => {
    vi.useFakeTimers();
    const hasher = fakeHasher();
    const ctv = createConstantTimeVerifier({ hasher, jitter: { maxMs: 5 } });

    const p = ctv.verify("real:pw", "pw");
    await vi.advanceTimersByTimeAsync(10);
    expect(await p).toBe(true);
    vi.useRealTimers();
  });
});

describe("timingSafeStringEqual", () => {
  it("matches equal strings and rejects different ones", () => {
    expect(timingSafeStringEqual("abc123", "abc123")).toBe(true);
    expect(timingSafeStringEqual("abc123", "abc124")).toBe(false);
  });
  it("rejects different-length strings without throwing", () => {
    expect(timingSafeStringEqual("short", "a-much-longer-token")).toBe(false);
  });
  it("handles empty strings", () => {
    expect(timingSafeStringEqual("", "")).toBe(true);
    expect(timingSafeStringEqual("", "x")).toBe(false);
  });
});
