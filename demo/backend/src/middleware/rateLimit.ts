import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { hardenedLog } from "../services/audit-log.service";
import { clientIp } from "../lib/http";

/**
 * HARDENED stack only. IP-scoped throttle on the auth endpoints. This is the
 * coarse net; per-account lockout (lockout.service) is the targeted one.
 *
 * The baseline stack mounts nothing here at all.
 */
export const hardenedAuthRateLimit = rateLimit({
  // Deliberately generous. The IP limit is the coarse secondary control — it
  // stops a single noisy source. The PRIMARY brake on password guessing is the
  // per-account lockout in lockout.service, which trips after 5 failures
  // regardless of how the attempt volume is spread across IPs.
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    hardenedLog({ event: "rate_limited", ip: clientIp(req), path: req.path });
    res.status(429).json({ error: "Too many attempts. Try again shortly." });
  },
});

/** A gentler limit for token refresh (called more often, legitimately). */
export const hardenedRefreshRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: "Too many attempts. Try again shortly." });
  },
});
