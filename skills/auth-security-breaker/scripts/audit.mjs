#!/usr/bin/env node
// Generic, target-agnostic auth auditor. Runs the probes against any auth API
// described by a --profile JSON. Zero runtime dependencies (Node 18+ built-ins).
//
//   node audit.mjs --profile=./profiles/auth-lab-baseline.json
//   node audit.mjs --profile=a.json --profile=b.json --samples=60 --out=./findings.json
//
// Assumes the target is already running. Spawning a server is the demo wrapper's
// job, not this CLI's.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpClient, waitForHealth } from "./lib/http.mjs";
import { assertTargetInScope } from "./lib/scope-guard.mjs";
import { loadProfile, ep, has, credBody, readAccessToken } from "./lib/profile.mjs";
import { sortFindings } from "./lib/finding.mjs";
import { writeReport, printConsoleTable } from "./lib/report.mjs";

import { timingEnumerationProbe } from "./probes/timing-enumeration.mjs";
import { userEnumerationProbe } from "./probes/user-enumeration.mjs";
import { authzEscalationProbe } from "./probes/authz-escalation.mjs";
import { tokenSessionProbe } from "./probes/token-session.mjs";
import { infoLeakProbe } from "./probes/info-leak.mjs";
import { passwordResetProbe } from "./probes/password-reset.mjs";
import { lockoutDosProbe } from "./probes/lockout-dos.mjs";
import { bruteforceRateLimitProbe } from "./probes/bruteforce-ratelimit.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// order matters: bruteforce + lockout-dos LAST (they leave lock state)
const PROBES = [
  timingEnumerationProbe, userEnumerationProbe, authzEscalationProbe,
  tokenSessionProbe, infoLeakProbe, passwordResetProbe,
  bruteforceRateLimitProbe, lockoutDosProbe,
];

const KNOWN_PW = "Sup3r-Secret-Lab-Passphrase-01";
const ADMIN_PW = "Sn3ak-Attempt-Lab-Passphrase-02";

function parseArgs(argv) {
  const get = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=").slice(1).join("=") : d; };
  const profiles = argv.filter((a) => a.startsWith("--profile=")).map((a) => a.split("=").slice(1).join("="));
  return {
    profiles: profiles.length ? profiles : [get("profile", path.join(__dirname, "profiles/auth-lab-baseline.json"))],
    samples: Number(get("samples", "60")),
    out: get("out", path.resolve(__dirname, "../../..", "docs/findings.json")),
    iteration: Number(get("iteration", "0")),
  };
}

async function makeResetThrottle(http, profile) {
  const hook = profile.hooks.resetThrottle;
  if (!hook) return { fn: null, unavailable: true };
  const [m, ...rest] = hook.trim().split(/\s+/);
  const p = rest.join(" ");
  return { fn: async () => { try { await http.request({ method: m.toUpperCase(), path: p }); } catch { /* best effort */ } }, unavailable: false };
}

async function buildContext(http, profile, samples) {
  const reset = await makeResetThrottle(http, profile);
  // full data reset if the profile offers one
  if (profile.hooks.reset) { const [m, ...r] = profile.hooks.reset.trim().split(/\s+/); await http.request({ method: m.toUpperCase(), path: r.join(" ") }).catch(() => {}); }

  const name = profile._name;
  const knownId = profile.fixtures.known?.[profile.fields.identifier] ?? `known-${name}@lab.test`;
  const adminId = `sneak-${name}@lab.test`;
  const absentId = profile.fixtures.absentIdentifier ?? `nobody-${name}-${Date.now()}@lab.test`;

  let knownToken, adminToken;
  const register = ep(profile, "register"), login = ep(profile, "login");

  // create fixtures if we can; otherwise rely on profile.fixtures.known
  if (register && !profile.fixtures.known) {
    await http.request({ method: register.method, path: register.path, body: credBody(profile, knownId, KNOWN_PW) });
  }
  if (login) {
    const secret = profile.fixtures.known?.[profile.fields.secret] ?? KNOWN_PW;
    const l = await http.request({ method: login.method, path: login.path, body: credBody(profile, knownId, secret) });
    knownToken = readAccessToken(profile, l.body);
  }
  if (register && has(profile, "adminOnly")) {
    await http.request({ method: register.method, path: register.path, body: credBody(profile, adminId, ADMIN_PW, { role: "admin", [profile.fields.role]: "admin" }) });
    if (login) { const la = await http.request({ method: login.method, path: login.path, body: credBody(profile, adminId, ADMIN_PW) }); adminToken = readAccessToken(profile, la.body); }
  }

  let config = {};
  if (profile.hooks.config) { const [m, ...r] = profile.hooks.config.trim().split(/\s+/); const c = await http.request({ method: m.toUpperCase(), path: r.join(" ") }).catch(() => ({ body: {} })); config = c.body ?? {}; }

  return {
    http, profile, stack: name,
    known: { identifier: knownId, secret: profile.fixtures.known?.[profile.fields.secret] ?? KNOWN_PW, accessToken: knownToken },
    adminAttempt: { identifier: adminId, secret: ADMIN_PW, accessToken: adminToken },
    absentIdentifier: absentId, config,
    resetThrottle: reset.fn, throttleResetUnavailable: reset.unavailable,
    opts: {
      timingSamples: reset.unavailable ? Math.min(samples, 4) : samples,
      timingWarmup: Math.max(4, Math.round((reset.unavailable ? Math.min(samples, 4) : samples) * 0.15)),
      timingSleepMs: 12, bruteforceAttempts: 12,
    },
  };
}

export async function runAudit({ profiles, samples = 60, out, iteration = 0 } = {}) {
  const startedAt = Date.now();
  const allFindings = [];
  const stacks = [];
  let target = "";

  for (const file of profiles) {
    const profile = loadProfile(file);
    target = profile.baseUrl;
    stacks.push(profile._name);
    console.log(`\n  -- auditing ${profile._name} (${profile.baseUrl}) ${"-".repeat(30)}`);
    assertTargetInScope(profile.baseUrl, { allowList: (process.env.AUTH_LAB_ALLOW_TARGET ?? "").split(",") });
    const http = new HttpClient(profile.baseUrl);
    if (profile.endpoints.health) {
      const hp = ep(profile, "health");
      if (!(await waitForHealth(http, hp.path, 8000))) console.warn(`  (health check did not pass for ${profile.baseUrl} — continuing anyway)`);
    }
    const ctx = await buildContext(http, profile, samples);
    for (const probe of PROBES) {
      if (ctx.resetThrottle) await ctx.resetThrottle();
      const got = await probe(ctx);
      for (const f of got) { console.log(`     ${f.verdict.padEnd(13)} ${f.title}`); allFindings.push(f); }
    }
  }

  const report = {
    ranAt: new Date().toISOString(), durationMs: Date.now() - startedAt, target,
    iteration, stacksTested: stacks,
    environment: { node: process.version, platform: `${process.platform} ${process.arch}`, note: "Local audit. Timing verdicts describe this interface, not internet exploitability." },
    findings: sortFindings(allFindings),
  };
  if (out) writeReport(report, out);
  printConsoleTable(report);
  return report;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("audit.mjs")) {
  const args = parseArgs(process.argv.slice(2));
  console.log(`\n  auth-security-breaker · generic auditor`);
  runAudit(args)
    .then((r) => { const c = r.findings.filter((f) => f.verdict === "CONFIRMED").length; console.log(`  done — ${c} CONFIRMED across ${r.stacksTested.join(" + ")}\n`); })
    .catch((e) => { console.error(e); process.exit(1); });
}
