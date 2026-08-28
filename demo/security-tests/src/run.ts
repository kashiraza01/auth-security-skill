import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import crypto from "node:crypto";
import { HttpClient, waitForHealth } from "./harness/http";
import { assertTargetInScope } from "./harness/scope-guard";
import type { AuditReport, Finding, Stack } from "./harness/finding";
import { printConsoleTable, sortFindings, writeReport } from "./report";
import type { Probe, ProbeContext } from "./probes/context";
import { timingEnumerationProbe } from "./probes/timing-enumeration";
import { userEnumerationProbe } from "./probes/user-enumeration";
import { authzEscalationProbe } from "./probes/authz-escalation";
import { tokenSessionProbe } from "./probes/token-session";
import { infoLeakProbe } from "./probes/info-leak";
import { bruteforceRateLimitProbe } from "./probes/bruteforce-ratelimit";

// bruteforce LAST — it can leave the fixture account locked
const PROBES: Probe[] = [
  timingEnumerationProbe,
  userEnumerationProbe,
  authzEscalationProbe,
  tokenSessionProbe,
  infoLeakProbe,
  bruteforceRateLimitProbe,
];

interface Args {
  target: string;
  stacks: Stack[];
  out: string;
  samples: number;
  spawn: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, dflt: string) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : dflt;
  };
  const stackArg = get("stack", "both");
  const stacks: Stack[] =
    stackArg === "both" ? ["baseline", "hardened"] : [stackArg as Stack];
  return {
    target: get("target", "http://localhost:4000"),
    stacks,
    out: get("out", path.resolve(__dirname, "../../../docs/findings.json")),
    samples: Number(get("samples", "60")),
    spawn: !argv.includes("--no-spawn"),
  };
}

async function maybeSpawnBackend(target: string, allowSpawn: boolean): Promise<ChildProcess | null> {
  if (await waitForHealth(target, 1500)) {
    console.log(`  using the backend already running at ${target}`);
    return null;
  }
  if (!allowSpawn) {
    console.error(`  no backend at ${target} and --no-spawn was passed`);
    process.exit(3);
  }
  const url = new URL(target);
  const serverEntry = path.resolve(__dirname, "../../backend/src/server.ts");
  console.log(`  starting a backend for the audit → ${serverEntry}`);
  const child = spawn(process.execPath, [require.resolve("tsx/cli"), serverEntry], {
    env: {
      ...process.env,
      PORT: url.port || "4000",
      NODE_ENV: "development",
      MONGO_URI: "",
      LAB_ENDPOINTS: "on",
      // Hardened stack gets strong dedicated secrets. The baseline's
      // JWT_ACCESS_SECRET is intentionally left unset so it falls back to the
      // hardcoded "dev-secret" — that is the token-forgery finding.
      JWT_ACCESS_SECRET: "",
      JWT_REFRESH_SECRET: "",
      HARDENED_JWT_ACCESS_SECRET: crypto.randomBytes(48).toString("base64url"),
      HARDENED_JWT_REFRESH_SECRET: crypto.randomBytes(48).toString("base64url"),
      HARDENED_ACCESS_TTL: "900",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => process.env.AUDIT_VERBOSE && process.stdout.write(`  [backend] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`  [backend] ${d}`));

  const ok = await waitForHealth(target, 30_000);
  if (!ok) {
    child.kill();
    console.error("  backend did not become healthy in time");
    process.exit(3);
  }
  return child;
}

const KNOWN_PW = "Sup3r-Secret-Lab-Passphrase-01";
const ADMIN_PW = "Sn3ak-Attempt-Lab-Passphrase-02";

async function buildContext(
  http: HttpClient,
  stack: Stack,
  target: string,
  samples: number,
): Promise<ProbeContext> {
  await http.post("/api/_lab/reset");

  const knownEmail = `known-${stack}@lab.test`;
  const adminEmail = `sneak-${stack}@lab.test`;
  const absentEmail = `nobody-${stack}-${Date.now()}@lab.test`;

  let knownToken: string | undefined;
  let adminToken: string | undefined;

  if (stack === "baseline") {
    const r1 = await http.post("/api/baseline/auth/register", { email: knownEmail, password: KNOWN_PW });
    knownToken = (r1.body as { accessToken?: string }).accessToken;
    const r2 = await http.post("/api/baseline/auth/register", {
      email: adminEmail,
      password: ADMIN_PW,
      role: "admin",
    });
    adminToken = (r2.body as { accessToken?: string }).accessToken;
  } else {
    await http.post("/api/hardened/auth/register", { email: knownEmail, password: KNOWN_PW });
    const l1 = await http.post("/api/hardened/auth/login", { email: knownEmail, password: KNOWN_PW });
    knownToken = (l1.body as { accessToken?: string }).accessToken;
    await http.post("/api/hardened/auth/register", { email: adminEmail, password: ADMIN_PW, role: "admin" });
    const l2 = await http.post("/api/hardened/auth/login", { email: adminEmail, password: ADMIN_PW });
    adminToken = (l2.body as { accessToken?: string }).accessToken;
  }

  const cfg = await http.get("/api/_lab/config");

  return {
    http,
    stack,
    target,
    known: { email: knownEmail, password: KNOWN_PW, accessToken: knownToken },
    adminAttempt: { email: adminEmail, password: ADMIN_PW, accessToken: adminToken },
    absentEmail,
    config: (cfg.body as ProbeContext["config"]) ?? {},
    opts: {
      timingSamples: samples,
      timingWarmup: Math.max(8, Math.round(samples * 0.15)),
      timingSleepMs: 12,
      bruteforceAttempts: 12,
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`\n  auth-security-skill · adversarial auditor`);
  assertTargetInScope(args.target);

  const child = await maybeSpawnBackend(args.target, args.spawn);
  const startedAt = Date.now();
  const http = new HttpClient(args.target);
  const findings: Finding[] = [];

  try {
    for (const stack of args.stacks) {
      console.log(`\n  ── auditing ${stack} ${"─".repeat(50)}`);
      const ctx = await buildContext(http, stack, args.target, args.samples);
      for (const probe of PROBES) {
        const got = await probe(ctx);
        for (const f of got) {
          console.log(`     ${f.verdict.padEnd(13)} ${f.title}`);
          findings.push(f);
        }
      }
    }
  } finally {
    if (child) child.kill();
  }

  const report: AuditReport = {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    target: args.target,
    stacksTested: args.stacks,
    environment: {
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      note: "Local HTTP audit. Timing verdicts describe the loopback interface, not internet exploitability.",
    },
    findings: sortFindings(findings),
  };

  writeReport(report, args.out);
  printConsoleTable(report);

  const confirmed = findings.filter((f) => f.verdict === "CONFIRMED").length;
  console.log(`  done — ${confirmed} CONFIRMED finding(s) across ${args.stacks.join(" + ")}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
