import rateLimit, { MemoryStore } from "express-rate-limit";
import type { Request, Response } from "express";
import { hardenedLog } from "../services/audit-log.service";
import { clientIp } from "../lib/http";

/**
 * HARDENED stack only. IP-scoped throttle on the auth endpoints.
 *
 * The IP limit is deliberately generous — it is the coarse secondary control
 * that stops a single noisy source. The PRIMARY brake on password guessing is
 * the per-account lockout in lockout.service, which trips after 5 failures
 * regardless of how the volume is spread across IPs.
 *
 * The stores are held here so the lab's /_lab/reset can clear them between audit
 * runs against a long-lived server.
 */
const authStore = new MemoryStore();
const refreshStore = new MemoryStore();

export const hardenedAuthRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: authStore,
  handler: (req: Request, res: Response) => {
    hardenedLog({ event: "rate_limited", ip: clientIp(req), path: req.path });
    res.status(429).json({ error: "Too many attempts. Try again shortly." });
  },
});

export const hardenedRefreshRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: refreshStore,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: "Too many attempts. Try again shortly." });
  },
});

/** Lab helper — clear the IP counters (not a data wipe). */
export function resetRateLimits(): void {
  authStore.resetAll?.();
  refreshStore.resetAll?.();
}
