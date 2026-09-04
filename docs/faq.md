# FAQ

Questions this project answers, phrased the way people actually ask them.

---

## About the problem

### What is user enumeration?

Any behaviour that lets someone determine whether an account exists without being logged in. It
does not require a data breach or an exotic exploit. Three ordinary versions:

- **Message enumeration** — "No account found with that email" for unknown accounts, "Incorrect
  password" for known ones.
- **Status or shape enumeration** — a different HTTP status, response body, or redirect between
  the two cases.
- **Timing enumeration** — identical responses, different response times, because the two paths
  do different amounts of work.

It matters because it turns a login into a lookup service. An attacker who can ask "is this email
registered" at scale gets a list of confirmed accounts to phish, credential-stuff, or price
against a breach dump.

### Why does my login respond faster for unknown emails?

Because the password hash never runs for them. The usual shape:

```ts
const user = await User.findOne({ email });
if (!user) return res.status(401).json({ error: "Invalid credentials" });  // returns in ~1 ms
const ok = await bcrypt.compare(password, user.passwordHash);              // ~20 ms
```

The early return skips the expensive work. On the demo in this repository that measures as a
**19.2 ms median gap** with Cliff's delta 1.00, meaning the two groups of samples do not overlap
at all. The error message is byte-for-byte identical in both cases and the timing still gives
the answer away.

### Is my login vulnerable to a timing attack?

Measure it rather than guessing. The answer depends on whether your unknown-account path does
less work than your known-account path, and by how much relative to network noise. Run:

```bash
node skills/auth-security-breaker/scripts/audit.mjs --profile=./your-profile.json
```

It samples both cohorts, discards warm-up, and reports the median delta, Cliff's delta (effect
size), and a Mann-Whitney U p-value. Method in
[`timing-methodology.md`](../skills/auth-security-breaker/references/timing-methodology.md).

### How do I stop my login leaking which accounts exist?

Two changes, both needed:

1. **One identical failure response.** Same status, same body, same headers for unknown account
   and wrong password. Registration and password reset need the same treatment, or they leak
   what login no longer does.
2. **Constant work.** When the account is not found, verify the supplied password against a
   fixed dummy hash anyway, so exactly one hash verification happens on every request.

```ts
const user = await User.findOne({ email });
const hashToCheck = user ? user.passwordHash : await getDummyArgon2Hash();
const passwordOk = await verify(hashToCheck, password);
if (!user || !passwordOk) throw new HttpError(401, "Invalid email or password");
```

On the demo that takes the gap from 19.2 ms to 0.13 ms. Implementation in
[`packages/constant-time-auth`](../packages/constant-time-auth/README.md).

### Is a `sleep()` enough to fix login timing?

No. Padding with a fixed sleep leaves the *distributions* different, so the signal survives once
an attacker takes enough samples; a random sleep adds variance that averages out. Do the work
instead of faking the delay. See [`hardening.md`](hardening.md) #1.

### How do I know whether a timing difference is actually exploitable?

You mostly don't, from a local measurement, and this project refuses to claim otherwise. A
CONFIRMED timing verdict here means the difference exists on the interface that was measured.
Exploiting it across a network needs many more samples, a stable network position, and tolerance
for load noise. Every timing finding carries a `limitations` line saying exactly that. Treat it
as a defect to fix rather than a breach to panic about.

### Should I read the user's role from the JWT?

No. A token claim is client-carried data. Authorization is what the server computes from trusted
state on every request. If your admin check reads `role` from the token, then anyone who can
influence what goes into the token at signing time — for example a registration endpoint that
accepts `{"role":"admin"}` in the body — is an admin. Look up the role from the database behind
the token's user id instead.

### Does logging out actually invalidate a JWT?

Not by itself. Clearing a cookie removes the client's copy; a stateless token stays valid until
it expires, so a stolen copy keeps working. If you need real logout, give each token a `jti`
bound to a server-side session record and revoke that record on logout. Same problem applies to
password changes: bump a per-user `tokenVersion` and reject older tokens, or a stolen token
survives the user's response to a compromise.

---

## About the skills

### How do I install a Claude Code skill from this repository?

```bash
./scripts/install-skills.sh              # all three, into ~/.claude
./scripts/install-skills.sh --project    # into ./.claude of the current project
./scripts/install-skills.sh breaker      # just the auditor
```

Or copy the folder: `cp -r skills/auth-security-breaker ~/.claude/skills/`. Restart Claude Code
afterwards. There is nothing to build and no dependencies to install.

### What's the difference between the three skills?

| Skill | Role | Touches your files? |
|---|---|---|
| `auth-security-breaker` | Audits. Finds weaknesses and proves them with evidence. | No. Reads code, makes HTTP requests, writes a findings file. |
| `auth-security-hardener` | Fixes. Implements the findings with a test each. | Yes. Edits auth source and tests. |
| `auth-security-loop` | Runs the two against each other until the audit is clean. | Yes, plus it runs your server locally. |

Start with the breaker. It changes nothing, so it is the safest way to see what the tooling
claims about your code. Full routing in [`SKILL.md`](../SKILL.md).

### Can I use these on a project that isn't this demo?

Yes, that is the point. The probes read endpoints and field names from a JSON target profile, so
nothing is hardcoded to this repository. Copy
`skills/auth-security-breaker/scripts/profiles/example-generic.json`, fill in your routes, and
run the CLI against it.

### Does it only work with Node, Express, and MongoDB?

The probes work at the HTTP layer, so any stack that serves an auth API over HTTP can be
audited: Express, Fastify, NestJS, Django, Rails, Go, anything. The demo is MERN because that is
what the paired vulnerable and hardened implementations are written in. Framework-specific notes
on where the auth boundary usually sits live in each skill's `references/frameworks.md`.

### Is it safe to run these against my code?

The breaker is read-only with respect to your files and makes tens of sequential HTTP requests,
not thousands. The hardener edits code, so review its diff the way you would review any PR. The
loop does both and runs your server locally.

All three enforce scope in code, not by convention
(`skills/auth-security-breaker/scripts/lib/scope-guard.mjs`): loopback addresses always, anything
else only if listed in `AUTH_LAB_ALLOW_TARGET`, and `NODE_ENV=production` or a target described
as production is refused. There is no bypass flag.

### Can I point this at a site I don't own?

No. Only systems you own or have explicit written authorisation to test. The scope guard blocks
non-loopback targets that are not on your allowlist, and that guard exists so an accident stays
an accident. Unauthorised testing of someone else's system is illegal in most jurisdictions
regardless of intent.

### How does the loop know when it's finished?

A script decides, not the agent. `skills/auth-security-loop/scripts/loop.mjs` ingests each
iteration's findings, diffs it against the previous one, and returns one of CONVERGED,
REGRESSION, STALLED, CAP, or CONTINUE with a matching exit code. An agent asserting "it
converged" in prose without that verdict does not count. A previously-clean finding coming back
CONFIRMED stops the loop immediately and gets reported rather than quietly re-patched.

### Do the skills get better over time?

They accumulate. Every finding whose state changes writes a validated DO/DON'T entry to a lessons
ledger, and both the breaker and the hardener load the digest before their next run. It's a
record of what worked on this codebase, not a model update.

### How is this different from `npm audit` or a dependency scanner?

Different layer. `npm audit` tells you a package you depend on has a known CVE. These skills test
the authentication logic *you* wrote: the order of operations in your login handler, where your
authorization check reads its data from, whether your logout does anything server-side. No
scanner finds those, because they aren't known vulnerabilities in known packages, they're
ordinary code doing something reasonable-looking.

### Will it find everything?

No, and it says so. It reports what its probes found on the interface they measured. It does not
prove absence of vulnerabilities. Out of scope: XSS and CSRF as topics in their own right,
network and TLS configuration, secrets and infrastructure compromise, distributed high-volume
attacks, MFA, and account recovery. Boundaries in [`threat-model.md`](threat-model.md).

---

## Running the demo

### What do I need installed?

Node 20 or newer. That's it. An in-memory MongoDB boots automatically, so no database setup and
no Docker required. The first test or audit run downloads a mongod binary (~130 MB) once. Docker
is optional if you want a persistent Mongo instead.

### How do I see the comparison?

```bash
npm install
npm run generate:secrets
npm run dev
```

Then open `http://localhost:3000/lab`. Pick a check, read the real source on each side, and press
run audit. Every number shown comes from that run.

### How do I just get the numbers without the UI?

```bash
npm run audit
```

Spawns a backend if none is running, audits both stacks, writes `docs/findings.json`, and prints
a table with the fixed-by-hardening diff. Expect 12 CONFIRMED on baseline and 0 on hardened.

### Can I copy the demo's auth code into my project?

Copy from `demo/backend/src/controllers/hardened.auth.controller.ts` if you want a reference, and
read [`hardening.md`](hardening.md) for what each decision costs. **Never copy anything from
`baseline.*`** — those files are deliberately vulnerable and labelled as such in every one of
them.
