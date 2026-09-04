#!/usr/bin/env node
// Emit the accumulated DO / DON'T rules from the lessons ledger as a compact
// block. Step 0 of every breaker and hardener run loads this so each run starts
// from what previous runs learned.
//
// Resilient to install layout: it looks for the ledger next to this script's
// skill AND in a sibling auth-security-loop skill, whichever exist, and merges
// them. If none exist it prints a harmless "(none yet)" — never an error — so the
// skill works whether installed alone or with its siblings.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.join(here, "..", "references", "lessons.md"),                             // this skill's own ledger
  path.join(here, "..", "..", "auth-security-loop", "references", "lessons.md"), // sibling loop skill
];

const dos = new Set(), donts = new Set();
let found = 0;
for (const file of candidates) {
  if (!fs.existsSync(file)) continue;
  found++;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(DO|DON'T|DONT):\s*(.+)$/i);
    if (!m) continue;
    (/^don'?t$/i.test(m[1]) ? donts : dos).add(m[2].trim());
  }
}

if (!found) { console.log("(no lessons recorded yet)"); process.exit(0); }

console.log("# Lessons digest — apply these before you start\n");
console.log("## DO");
for (const d of dos) console.log(`- ${d}`);
console.log("\n## DON'T");
for (const d of donts) console.log(`- ${d}`);
console.log(`\n(${dos.size} DO / ${donts.size} DON'T rules)`);
