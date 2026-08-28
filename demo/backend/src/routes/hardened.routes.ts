import { Router } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "../config/env";
import {
  hardenedAdminListUsers,
  hardenedChangePassword,
  hardenedLogin,
  hardenedLogout,
  hardenedLogoutAll,
  hardenedMe,
  hardenedRefresh,
  hardenedRegister,
} from "../controllers/hardened.auth.controller";
import { hardenedAuthenticate } from "../middleware/authenticate";
import { hardenedRequireRole } from "../middleware/authorize";
import { hardenedAuthRateLimit, hardenedRefreshRateLimit } from "../middleware/rateLimit";
import { hardenedErrorHandler } from "../middleware/error";

/**
 * /api/hardened/auth/*  — same endpoints, hardened.
 * helmet for headers, a strict CORS allowlist, an IP rate limit on the
 * credential endpoints, and its own fail-closed error handler.
 */
export const hardenedRouter = Router();

hardenedRouter.use(helmet());
hardenedRouter.use(
  cors({
    origin: [env.frontendUrl], // ✅ exact allowlist, not a reflector
    credentials: true,
  }),
);

hardenedRouter.post("/auth/register", hardenedAuthRateLimit, hardenedRegister);
hardenedRouter.post("/auth/login", hardenedAuthRateLimit, hardenedLogin);
hardenedRouter.post("/auth/refresh", hardenedRefreshRateLimit, hardenedRefresh);
hardenedRouter.post("/auth/logout", hardenedAuthenticate, hardenedLogout);
hardenedRouter.post("/auth/logout-all", hardenedAuthenticate, hardenedLogoutAll);
hardenedRouter.get("/auth/me", hardenedAuthenticate, hardenedMe);
hardenedRouter.post(
  "/auth/change-password",
  hardenedAuthRateLimit,
  hardenedAuthenticate,
  hardenedChangePassword,
);
hardenedRouter.get(
  "/admin/users",
  hardenedAuthenticate,
  hardenedRequireRole("admin"),
  hardenedAdminListUsers,
);

hardenedRouter.use(hardenedErrorHandler);
