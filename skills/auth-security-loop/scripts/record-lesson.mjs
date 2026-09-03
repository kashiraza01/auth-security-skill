#!/usr/bin/env node
// Append a VALIDATED lesson to references/lessons.md. Rejects a missing DO/DON'T
// and refuses a duplicate finding+iteration key, so the ledger format cannot drift.
//
//   node record-lesson.mjs --finding=timing-user-enumeration --iteration=2 \
//     --transition="still-present -> fixed" --signal="..." \
//     --worked="dummy-hash constant work" --failed="sleep(200)" \
//     --do="equalise work then re-measure with same caps" \
//     --dont="add a fixed delay and call it closed"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, "..", "references", "lessons.md");
const get = (n) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=").slice(1).join("=") : ""; };

const finding = get("finding"), iteration = get("iteration");
const doRule = get("do"), dontRule = get("dont");
const problems = [];
if (!finding) problems.push("--finding is required");
if (iteration === "") problems.push("--iteration is required");
if (!doRule) problems.push("--do is required (a DO rule)");
if (!dontRule) problems.push("--dont is required (a DON'T rule)");
if (problems.length) { console.error("record-lesson refused:\n  " + problems.join("\n  ")); process.exit(2); }

const key = `${finding} · iteration ${iteration}`;
if (fs.existsSync(file) && fs.readFileSync(file, "utf8").includes(`<!--key:${key}-->`)) {
  console.error(`record-lesson refused: a lesson for "${key}" already exists (no duplicates).`);
  process.exit(3);
}

const date = new Date().toISOString().slice(0, 10);
const entry = [
  `\n## ${date} · ${finding} · ${get("transition") || "state change"} (iteration ${iteration}) <!--key:${key}-->`,
  get("signal") ? `Signal:          ${get("signal")}` : null,
  get("worked") ? `Fix that worked: ${get("worked")}` : null,
  get("failed") ? `Fix that did NOT: ${get("failed")}` : null,
  `DO:              ${doRule}`,
  `DON'T:           ${dontRule}`,
].filter(Boolean).join("\n") + "\n";

fs.mkdirSync(path.dirname(file), { recursive: true });
if (!fs.existsSync(file)) fs.writeFileSync(file, "# Lessons — the self-improvement ledger\n\nAppend-only. One entry per finding whose state changed in a loop iteration. `lessons-digest.mjs` turns the DO/DON'T lines into the rules each run loads at step 0.\n");
fs.appendFileSync(file, entry);
console.log(`recorded lesson for ${key}`);
