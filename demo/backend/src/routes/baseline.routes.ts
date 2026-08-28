import { Router } from "express";
import cors from "cors";
import {
  baselineAdminListUsers,
  baselineChangePassword,
  baselineLogin,
  baselineLogout,
  baselineMe,
  baselineRefresh,
  baselineRegister,
} from "../controllers/baseline.auth.controller";
import { baselineAuthenticate } from "../middleware/authenticate";
import { baselineRequireAdmin } from "../middleware/authorize";
import { baselineErrorHandler } from "../middleware/error";

/**
 * /api/baseline/auth/*  — the ordinary implementation.
 * Note what is NOT here: no rate limiter, no helmet, and the CORS config reflects
 * any origin with credentials.
 */
export const baselineRouter = Router();

// ❌ Reflects the caller's Origin AND allows credentials — any website can drive
//    authenticated requests against this API in a logged-in user's browser.
baselineRouter.use(cors({ origin: true, credentials: true }));

baselineRouter.post("/auth/register", baselineRegister);
baselineRouter.post("/auth/login", baselineLogin);
baselineRouter.post("/auth/refresh", baselineRefresh);
baselineRouter.post("/auth/logout", baselineLogout);
baselineRouter.get("/auth/me", baselineAuthenticate, baselineMe);
baselineRouter.post("/auth/change-password", baselineAuthenticate, baselineChangePassword);
baselineRouter.get(
  "/admin/users",
  baselineAuthenticate,
  baselineRequireAdmin,
  baselineAdminListUsers,
);

baselineRouter.use(baselineErrorHandler);
