import type { NextFunction, Request, Response } from "express";

/** Express 4 does not forward errors thrown in async handlers — wrap them. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/** A thrown error that carries an HTTP status. */
export class HttpError extends Error {
  status: number;
  expose: boolean;
  constructor(status: number, message: string, expose = true) {
    super(message);
    this.status = status;
    this.expose = expose;
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}
