import express from "express";
import cookieParser from "cookie-parser";
import { baselineRouter } from "./routes/baseline.routes";
import { hardenedRouter } from "./routes/hardened.routes";
import { labRouter } from "./routes/lab.routes";
import { hardenedErrorHandler } from "./middleware/error";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());

  // trust the first proxy hop so req.ip is the client, not 127.0.0.1
  app.set("trust proxy", 1);

  // Lab plumbing + health. Disable by setting LAB_ENDPOINTS=off.
  if (process.env.LAB_ENDPOINTS !== "off") {
    app.use("/api", labRouter);
  }

  // The two implementations under comparison.
  app.use("/api/baseline", baselineRouter);
  app.use("/api/hardened", hardenedRouter);

  app.get("/", (_req, res) => {
    res.json({
      name: "auth-security-skill demo backend",
      stacks: ["/api/baseline/auth", "/api/hardened/auth"],
      health: "/api/health",
    });
  });

  app.use((_req, res) => res.status(404).json({ error: "not found" }));

  // Final safety net for anything thrown outside the per-stack routers
  // (e.g. the lab router). Fails closed.
  app.use(hardenedErrorHandler);

  return app;
}
