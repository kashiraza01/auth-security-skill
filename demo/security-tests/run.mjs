// Demo wrapper: spawn the lab backend, then run the SHARED generic auditor
// (skills/auth-security-breaker/scripts/audit.mjs) against the baseline + hardened
// profiles. One auditor implementation for the whole repo.
import { spawn } from "node:child_process";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runAudit } from "../../skills/auth-security-breaker/scripts/audit.mjs";
import { HttpClient, waitForHealth } from "../../skills/auth-security-breaker/scripts/lib/http.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const scriptsDir = path.join(repoRoot, "skills", "auth-security-breaker", "scripts");
const target = "http://localhost:4000";

function arg(name, dflt) { const h = process.argv.find((a) => a.startsWith(`--${name}=`)); return h ? h.split("=").slice(1).join("=") : dflt; }

async function ensureBackend() {
  const http = new HttpClient(target);
  if (await waitForHealth(http, "/api/health", 1500)) { console.log(`  using the backend already running at ${target}`); return null; }
  if (process.argv.includes("--no-spawn")) { console.error(`  no backend at ${target} and --no-spawn given`); process.exit(3); }
  const serverEntry = path.join(repoRoot, "demo", "backend", "src", "server.ts");
  console.log(`  starting a backend for the audit -> ${serverEntry}`);
  const require = createRequire(import.meta.url);
  const child = spawn(process.execPath, [require.resolve("tsx/cli"), serverEntry], {
    cwd: path.join(repoRoot, "demo", "backend"),
    env: { ...process.env, PORT: "4000", NODE_ENV: "development", MONGO_URI: "", LAB_ENDPOINTS: "on",
      JWT_ACCESS_SECRET: "", JWT_REFRESH_SECRET: "",
      HARDENED_JWT_ACCESS_SECRET: crypto.randomBytes(48).toString("base64url"),
      HARDENED_JWT_REFRESH_SECRET: crypto.randomBytes(48).toString("base64url"),
      HARDENED_ACCESS_TTL: "900" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (d) => process.stderr.write(`  [backend] ${d}`));
  if (!(await waitForHealth(http, "/api/health", 30000))) { child.kill(); console.error("  backend did not become healthy"); process.exit(3); }
  return child;
}

const stackArg = arg("stack", "both");
const profiles = (stackArg === "both" ? ["baseline", "hardened"] : [stackArg]).map((s) => path.join(scriptsDir, "profiles", `auth-lab-${s}.json`));

const child = await ensureBackend();
try {
  const report = await runAudit({ profiles, samples: Number(arg("samples", "60")), out: path.join(repoRoot, "docs", "findings.json") });
  const confirmed = report.findings.filter((f) => f.verdict === "CONFIRMED").length;
  console.log(`  done — ${confirmed} CONFIRMED across ${report.stacksTested.join(" + ")}\n`);
} finally {
  if (child) child.kill();
}
