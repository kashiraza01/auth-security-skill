import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http";
import { env } from "../config/env";

/**
 * BASELINE error handler — leaks. On any unhandled error it returns the message
 * and the stack trace in the JSON response. Great for debugging, terrible for an
 * attacker's reconnaissance (framework versions, file paths, query shapes).
 */
export function baselineErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const e = err as Error & { status?: number };
  res.status(e.status ?? 500).json({
    error: e.message ?? "error",
    stack: e.stack,
    name: e.name,
  });
}

/**
 * HARDENED error handler — fails closed. Known HttpErrors with `expose: true`
 * pass their message through (they are deliberate, user-facing). Everything else
 * becomes a generic 500 with a correlation id; the detail is logged server-side
 * only.
 */
export function hardenedErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError && err.expose) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const correlationId = Math.random().toString(36).slice(2, 10);
  // eslint-disable-next-line no-console
  console.error(`[error ${correlationId}]`, err);
  const body: Record<string, unknown> = { error: "Something went wrong.", correlationId };
  if (!env.isProd && err instanceof Error) body.debug = err.message;
  res.status(err instanceof HttpError ? err.status : 500).json(body);
}
