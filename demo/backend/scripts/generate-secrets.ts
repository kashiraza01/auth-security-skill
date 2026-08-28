/**
 * Write cryptographically random JWT secrets into demo/backend/.env.
 * Existing non-secret keys are preserved. Existing secrets are only replaced with
 * --force.
 *
 *   npm run generate:secrets            # fill blanks
 *   npm run generate:secrets -- --force # regenerate everything
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const force = process.argv.includes("--force");
const envPath = path.resolve(__dirname, "../.env");
const examplePath = path.resolve(__dirname, "../.env.example");

const rand = () => crypto.randomBytes(48).toString("base64url");

let lines: string[];
if (fs.existsSync(envPath)) {
  lines = fs.readFileSync(envPath, "utf8").split("\n");
} else if (fs.existsSync(examplePath)) {
  lines = fs.readFileSync(examplePath, "utf8").split("\n");
  console.log("[generate:secrets] created demo/backend/.env from .env.example");
} else {
  lines = ["JWT_ACCESS_SECRET=", "JWT_REFRESH_SECRET="];
}

function setSecret(key: string): void {
  const idx = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
  const current = idx >= 0 ? lines[idx].slice(key.length + 1).trim() : "";
  if (current && !force) {
    console.log(`[generate:secrets] ${key} already set — skipping (use --force)`);
    return;
  }
  const value = `${key}=${rand()}`;
  if (idx >= 0) lines[idx] = value;
  else lines.push(value);
  console.log(`[generate:secrets] ${key} written`);
}

// The hardened stack's dedicated secrets. We deliberately do NOT fill
// JWT_ACCESS_SECRET / JWT_REFRESH_SECRET — the baseline stack's tolerance of a
// missing secret is a finding the lab keeps demonstrable.
setSecret("HARDENED_JWT_ACCESS_SECRET");
setSecret("HARDENED_JWT_REFRESH_SECRET");

fs.writeFileSync(envPath, lines.join("\n"), "utf8");
console.log(`[generate:secrets] done → ${envPath}`);
console.log(
  "[generate:secrets] note: JWT_ACCESS_SECRET (baseline) is left blank on purpose — " +
    "the baseline stack falling back to a hardcoded secret is one of the demonstrated issues.",
);
