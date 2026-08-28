import type mongoose from "mongoose";
import { Session } from "../models/Session";
import { env } from "../config/env";

/** Hardened stack only. Create a session row for a freshly issued token pair. */
export async function createSession(input: {
  userId: mongoose.Types.ObjectId;
  jti: string;
  userAgent: string;
  ip: string;
}): Promise<void> {
  await Session.create({
    userId: input.userId,
    jti: input.jti,
    status: "active",
    userAgent: input.userAgent.slice(0, 256),
    ip: input.ip,
    expiresAt: new Date(Date.now() + env.hardenedRefreshTtl * 1000),
  });
}

export async function isSessionActive(jti: string): Promise<boolean> {
  const row = await Session.findOne({ jti }).lean();
  return !!row && row.status === "active" && row.expiresAt.getTime() > Date.now();
}

export async function revokeSession(jti: string, reason: string): Promise<void> {
  await Session.updateOne(
    { jti },
    { $set: { status: "revoked", revokedAt: new Date(), revokedReason: reason } },
  );
}

export async function revokeAllForUser(
  userId: mongoose.Types.ObjectId,
  reason: string,
): Promise<number> {
  const res = await Session.updateMany(
    { userId, status: "active" },
    { $set: { status: "revoked", revokedAt: new Date(), revokedReason: reason } },
  );
  return res.modifiedCount ?? 0;
}
