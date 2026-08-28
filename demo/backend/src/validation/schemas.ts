import { z } from "zod";

/**
 * HARDENED input contracts. Each field is a string of bounded length — this alone
 * closes the NoSQL-operator-injection hole the baseline has (baseline passes
 * `req.body.email` straight into `User.findOne({ email })`, so a body of
 * `{"email": {"$ne": null}}` matches the first user in the collection).
 */

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(1).max(200);

export const registerSchema = z.object({
  email,
  password,
  // NOTE: role is intentionally NOT in the schema. Any client-supplied role is
  // dropped before it can reach the database.
});

export const loginSchema = z.object({
  email,
  password,
});

export const changePasswordSchema = z.object({
  currentPassword: password,
  newPassword: z.string().min(12).max(200),
});

/** Hardened password policy, applied on register + change-password. */
const TINY_COMMON_LIST = new Set([
  "password", "password1", "12345678", "123456789", "qwertyuiop",
  "letmein12345", "iloveyou1234", "adminadmin12", "welcome12345",
]);

export function checkPasswordPolicy(pw: string, emailAddr: string): string | null {
  if (pw.length < 12) return "Password must be at least 12 characters.";
  if (pw.length > 200) return "Password is too long.";
  if (TINY_COMMON_LIST.has(pw.toLowerCase())) return "That password is too common.";
  const localPart = emailAddr.split("@")[0]?.toLowerCase() ?? "";
  // Only meaningful for a local part of a few characters or more — a one- or
  // two-letter local part matches half the dictionary and is just noise.
  if (localPart.length >= 4 && pw.toLowerCase().includes(localPart)) {
    return "Password must not contain your email name.";
  }
  return null;
}
