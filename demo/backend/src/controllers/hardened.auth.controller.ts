import type { Request, Response } from "express";
import { asyncHandler, clientIp, HttpError } from "../lib/http";
import { env } from "../config/env";
import { User } from "../models/User";
import {
  getDummyArgon2Hash,
  hardenedHash,
  hardenedVerify,
} from "../services/password.service";
import {
  hardenedNewJti,
  hardenedSignAccess,
  hardenedSignRefresh,
  hardenedVerifyRefresh,
} from "../services/token.service";
import {
  createSession,
  isSessionActive,
  revokeAllForUser,
  revokeSession,
} from "../services/session.service";
import { hardenedLog, maskEmail } from "../services/audit-log.service";
import {
  isLocked,
  recordFailure,
  recordSuccess,
} from "../services/lockout.service";
import {
  changePasswordSchema,
  checkPasswordPolicy,
  loginSchema,
  registerSchema,
} from "../validation/schemas";

/**
 * ============================================================================
 * THE HARDENED VERSION
 * ============================================================================
 * Same feature set, same request/response shapes. The changes are all about (a)
 * making authentication cost the same whether or not the account exists, (b)
 * making authorization a server-side decision, and (c) giving logout something
 * real to invalidate. Each ✅ marks a fix that maps to a breaker finding.
 */

const REFRESH_COOKIE = "hardened_refresh_token";
const REFRESH_PATH = "/api/hardened/auth";

function refreshCookieOptions() {
  return {
    httpOnly: true, // ✅ not reachable from JavaScript
    secure: env.isProd, // ✅ TLS-only in production
    sameSite: "strict" as const, // ✅ not sent on cross-site requests
    path: REFRESH_PATH, // ✅ only sent to the refresh/logout endpoints
    maxAge: env.hardenedRefreshTtl * 1000,
  };
}

async function issueTokenPair(
  req: Request,
  res: Response,
  user: { _id: unknown; role: string; tokenVersion: number },
) {
  const jti = hardenedNewJti();
  await createSession({
    userId: user._id as never,
    jti,
    userAgent: String(req.headers["user-agent"] ?? ""),
    ip: clientIp(req),
  });
  const accessToken = hardenedSignAccess({
    sub: String(user._id),
    role: user.role,
    tokenVersion: user.tokenVersion,
    jti,
  });
  const refreshToken = hardenedSignRefresh({
    sub: String(user._id),
    jti,
    tokenVersion: user.tokenVersion,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  return { accessToken, jti };
}

export const hardenedRegister = asyncHandler(async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "email and password are required");
  }
  const { email, password } = parsed.data;

  const policyError = checkPasswordPolicy(password, email);
  if (policyError) throw new HttpError(400, policyError);

  // ✅ Neutral response. We do not tell the caller whether the address was already
  //    registered — that would be an enumeration oracle just like the login one.
  const existing = await User.findOne({ email }).select("_id").lean();
  if (!existing) {
    const passwordHash = await hardenedHash(password);
    await User.create({
      email,
      passwordHash,
      hashAlgo: "argon2",
      role: "user", // ✅ client cannot choose a role
      permissions: [],
      createdVia: "hardened",
    });
  }

  hardenedLog({ event: "register_succeeded", userId: "(neutral)", ip: clientIp(req) });
  return res.status(202).json({
    ok: true,
    message: "If the address is valid and unused, the account has been created. You can now sign in.",
  });
});

export const hardenedLogin = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    // Same generic error as a credential miss — a malformed body is not an oracle.
    throw new HttpError(401, "Invalid email or password");
  }
  const { email, password } = parsed.data;

  const lock = isLocked(email);
  if (lock.locked) {
    hardenedLog({ event: "account_locked", emailFragment: maskEmail(email), ip: clientIp(req) });
    res.setHeader("Retry-After", String(lock.retryAfterSec));
    throw new HttpError(429, "Too many failed attempts. Try again later.");
  }

  // ✅ CONSTANT WORK.
  //    Look the user up, then ALWAYS run exactly one Argon2id verify — against the
  //    real hash if we found a user, against a fixed dummy hash if we did not.
  //    Same code path, same cost, same error, same status for both branches.
  const user = await User.findOne({ email });
  const hashToCheck = user ? user.passwordHash : await getDummyArgon2Hash();
  const passwordOk = await hardenedVerify(hashToCheck, password);

  if (!user || !passwordOk) {
    const { nowLocked } = recordFailure(email);
    hardenedLog({
      event: "login_failed",
      emailFragment: maskEmail(email),
      ip: clientIp(req),
      reason: nowLocked ? "locked_now" : "bad_credentials",
    });
    throw new HttpError(401, "Invalid email or password"); // ✅ identical for both
  }

  recordSuccess(email);
  const { accessToken } = await issueTokenPair(req, res, user);
  hardenedLog({ event: "login_succeeded", userId: String(user._id), ip: clientIp(req) });

  return res.json({
    user: { id: String(user._id), email: user.email, role: user.role },
    accessToken,
    expiresIn: env.hardenedAccessTtl,
  });
});

export const hardenedMe = asyncHandler(async (req: Request, res: Response) => {
  // ✅ Everything comes from the database record, keyed by the token's subject.
  const user = await User.findById(req.auth?.userId).lean();
  if (!user) throw new HttpError(401, "Authentication required");
  return res.json({
    id: String(user._id),
    email: user.email,
    role: user.role,
    permissions: user.permissions,
  });
});

export const hardenedRefresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new HttpError(401, "Authentication required");

  let decoded: { sub: string; jti: string; tokenVersion: number };
  try {
    decoded = hardenedVerifyRefresh(token);
  } catch {
    throw new HttpError(401, "Authentication required");
  }

  const user = await User.findById(decoded.sub);
  if (!user || user.tokenVersion !== decoded.tokenVersion) {
    throw new HttpError(401, "Authentication required");
  }

  // ✅ REUSE DETECTION. If the jti is not active, this refresh token has already
  //    been rotated away — treat it as a stolen-token replay and burn every
  //    session for the user.
  if (!(await isSessionActive(decoded.jti))) {
    const revoked = await revokeAllForUser(user._id, "refresh_reuse_detected");
    hardenedLog({ event: "logout_all", userId: String(user._id), revoked });
    throw new HttpError(401, "Authentication required");
  }

  // ✅ ROTATION. Revoke the old jti, mint a brand new pair.
  await revokeSession(decoded.jti, "rotated");
  const { accessToken } = await issueTokenPair(req, res, user);
  return res.json({ accessToken, expiresIn: env.hardenedAccessTtl });
});

export const hardenedLogout = asyncHandler(async (req: Request, res: Response) => {
  // ✅ Revoke the server-side session so the access token stops working now, not
  //    in 15 minutes.
  if (req.auth?.jti) {
    await revokeSession(req.auth.jti, "logout");
    hardenedLog({ event: "logout", userId: req.auth.userId, jti: req.auth.jti });
  }
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
  return res.json({ ok: true });
});

export const hardenedLogoutAll = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.auth?.userId);
  if (!user) throw new HttpError(401, "Authentication required");
  const revoked = await revokeAllForUser(user._id, "logout_all");
  user.tokenVersion += 1; // ✅ invalidate any token that somehow escaped the sweep
  await user.save();
  hardenedLog({ event: "logout_all", userId: String(user._id), revoked });
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
  return res.json({ ok: true, sessionsRevoked: revoked });
});

export const hardenedChangePassword = asyncHandler(async (req: Request, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "currentPassword and a newPassword (min 12) are required");
  const { currentPassword, newPassword } = parsed.data;

  const user = await User.findById(req.auth?.userId);
  if (!user) throw new HttpError(401, "Authentication required");

  // ✅ Requires the current password.
  const currentOk = await hardenedVerify(user.passwordHash, currentPassword);
  if (!currentOk) throw new HttpError(400, "Current password is incorrect");

  const policyError = checkPasswordPolicy(newPassword, user.email);
  if (policyError) throw new HttpError(400, policyError);

  user.passwordHash = await hardenedHash(newPassword);
  user.tokenVersion += 1;
  await user.save();

  // ✅ Every session minted with the old password is now dead.
  const revoked = await revokeAllForUser(user._id, "password_changed");
  hardenedLog({ event: "password_changed", userId: String(user._id), sessionsRevoked: revoked });
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
  return res.json({ ok: true, sessionsRevoked: revoked });
});

export const hardenedAdminListUsers = asyncHandler(async (_req: Request, res: Response) => {
  // Reached only after hardenedRequireRole("admin"), which reads the DB.
  const users = await User.find().select("email role createdVia").lean();
  return res.json({
    users: users.map((u) => ({ id: String(u._id), email: u.email, role: u.role, createdVia: u.createdVia })),
  });
});
