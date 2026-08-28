import type { Request, Response } from "express";
import { asyncHandler, clientIp } from "../lib/http";
import { User } from "../models/User";
import { baselineCompare, baselineHash } from "../services/password.service";
import {
  baselineSignAccess,
  baselineSignRefresh,
  baselineVerifyAccess,
} from "../services/token.service";
import { baselineLog } from "../services/audit-log.service";

/**
 * ============================================================================
 * THE ORDINARY VERSION
 * ============================================================================
 * Nothing here is absurd. Every one of these choices shows up in real codebases
 * and in the first draft an AI assistant hands you. Each ❌ comment is a note to
 * the auth-security-breaker skill about what it should be able to find, and to
 * the auth-security-hardener skill about what it should fix.
 */

function setTokenCookies(res: Response, accessToken: string, refreshToken: string): void {
  // ❌ Tokens in cookies that JavaScript can read. An XSS anywhere on the origin
  //    lifts the session. Also no SameSite, so they ride along on cross-site
  //    requests.
  res.cookie("access_token", accessToken, { httpOnly: false });
  res.cookie("refresh_token", refreshToken, { httpOnly: false });
}

export const baselineRegister = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, role } = req.body ?? {};

  // ❌ Almost no input validation. `email` is whatever the client sent — including
  //    an object, which later becomes a NoSQL query operator.
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  // ❌ Password policy: four characters.
  if (String(password).length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }

  // ❌ Privilege assignment straight from the request body. Register as admin.
  const passwordHash = await baselineHash(String(password));
  const user = await User.create({
    email,
    passwordHash,
    hashAlgo: "bcrypt",
    role: role === "admin" ? "admin" : "user",
    permissions: role === "admin" ? ["users:read", "users:write"] : [],
    createdVia: "baseline",
  });
  // ❌ If `email` already exists, the Mongo duplicate-key error falls through to
  //    the leaky error handler and exposes the index + collection name.

  const claims = {
    sub: String(user._id),
    email: user.email,
    role: user.role,
    permissions: user.permissions,
  };
  const accessToken = baselineSignAccess(claims);
  const refreshToken = baselineSignRefresh({ sub: claims.sub });
  setTokenCookies(res, accessToken, refreshToken);

  return res.status(201).json({
    user: { id: claims.sub, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  });
});

export const baselineLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  // ❌ `email` goes into the query unchanged. Body { "email": { "$gt": "" } }
  //    matches the first user in the collection.
  const user = await User.findOne({ email });

  // ❌ TIMING / USER ENUMERATION.
  //    Unknown account: we return here immediately — one indexed lookup, no hash.
  //    Known account:   we fall through to bcrypt.compare, which costs ~20-40ms.
  //    The response time tells an attacker whether the email is registered.
  //    The error *text* tells them outright.
  if (!user) {
    baselineLog({ event: "login_failed", reason: "no_such_user", body: req.body, ip: clientIp(req) });
    return res.status(401).json({ error: "No account found with that email address" });
  }

  const ok = await baselineCompare(String(password ?? ""), user.passwordHash);
  if (!ok) {
    // ❌ Logs the full body — including the plaintext password — on every miss.
    baselineLog({ event: "login_failed", reason: "bad_password", body: req.body, ip: clientIp(req) });
    return res.status(401).json({ error: "Incorrect password" });
  }

  // ❌ No rate limiting, no lockout: this endpoint will answer as fast as you can
  //    call it, forever.

  const claims = {
    sub: String(user._id),
    email: user.email,
    role: user.role,
    permissions: user.permissions,
  };
  const accessToken = baselineSignAccess(claims);
  const refreshToken = baselineSignRefresh({ sub: claims.sub });
  setTokenCookies(res, accessToken, refreshToken);

  return res.json({
    user: { id: claims.sub, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  });
});

export const baselineMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.auth?.userId).lean();
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({
    id: String(user._id),
    email: user.email,
    // ❌ Reports the role from the token, not the database.
    role: req.auth?.tokenRole,
    permissions: req.auth?.tokenPermissions,
  });
});

export const baselineRefresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.body?.refreshToken || req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: "No refresh token" });
  try {
    // ❌ A refresh token is just a JWT with a longer expiry. No server record,
    //    no rotation, no reuse detection. Steal it once, refresh forever.
    const decoded = baselineVerifyAccess(token) as { sub: string };
    const user = await User.findById(decoded.sub).lean();
    if (!user) return res.status(401).json({ error: "Unknown user" });
    const accessToken = baselineSignAccess({
      sub: String(user._id),
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    });
    return res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ error: `Invalid refresh token: ${(err as Error).message}` });
  }
});

export const baselineLogout = asyncHandler(async (_req: Request, res: Response) => {
  // ❌ "Logout" only deletes the client's copy of the cookie. The access token it
  //    already handed out stays valid for its full 7 days. There is no
  //    server-side state to invalidate.
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  return res.json({ ok: true });
});

export const baselineChangePassword = asyncHandler(async (req: Request, res: Response) => {
  const { newPassword } = req.body ?? {};
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }
  const user = await User.findById(req.auth?.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  // ❌ Does not ask for the current password.
  // ❌ Does not invalidate existing sessions. Every token minted before the change
  //    keeps working — including one an attacker may hold.
  user.passwordHash = await baselineHash(String(newPassword));
  await user.save();
  return res.json({ ok: true });
});

export const baselineAdminListUsers = asyncHandler(async (_req: Request, res: Response) => {
  // Reached only after baselineRequireAdmin, which trusts the token's role claim.
  const users = await User.find().lean();
  return res.json({
    users: users.map((u) => ({
      id: String(u._id),
      email: u.email,
      role: u.role,
      permissions: u.permissions,
      createdVia: u.createdVia,
    })),
  });
});
