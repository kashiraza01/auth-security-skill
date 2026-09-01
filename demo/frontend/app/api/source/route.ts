import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

// Kept in sync with demo/backend/src/routes/lab.routes.ts SOURCE_ALLOWLIST.
const ALLOWLIST: Record<string, string> = {
  "baseline-login": "demo/backend/src/controllers/baseline.auth.controller.ts",
  "hardened-login": "demo/backend/src/controllers/hardened.auth.controller.ts",
  "baseline-authn": "demo/backend/src/middleware/authenticate.ts",
  "baseline-authz": "demo/backend/src/middleware/authorize.ts",
  "token-service": "demo/backend/src/services/token.service.ts",
  "password-service": "demo/backend/src/services/password.service.ts",
  "session-service": "demo/backend/src/services/session.service.ts",
  "baseline-routes": "demo/backend/src/routes/baseline.routes.ts",
  "hardened-routes": "demo/backend/src/routes/hardened.routes.ts",
};

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const rel = ALLOWLIST[key];
  if (!rel) {
    return NextResponse.json(
      { error: "unknown source key", available: Object.keys(ALLOWLIST) },
      { status: 404 },
    );
  }
  try {
    const content = await readFile(path.join(REPO_ROOT, rel), "utf8");
    return NextResponse.json({ key, path: rel, content });
  } catch (e) {
    return NextResponse.json({ error: `could not read ${rel}: ${String(e)}` }, { status: 500 });
  }
}
