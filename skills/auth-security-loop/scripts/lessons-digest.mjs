#!/usr/bin/env node
// Emit the accumulated DO / DON'T rules from references/lessons.md as a compact
// block. Step 0 of every breaker and hardener run loads this so each run starts
// from what previous runs learned.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, "..", "references", "lessons.md");

if (!fs.existsSync(file)) { console.log("(no lessons recorded yet)"); process.exit(0); }
const text = fs.readFileSync(file, "utf8");

const dos = [], donts = [];
for (const line of text.split("\n")) {
  const m = line.match(/^\s*(DO|DON'T|DONT):\s*(.+)$/i);
  if (!m) continue;
  const rule = m[2].trim();
  if (/^don'?t$/i.test(m[1])) { if (!donts.includes(rule)) donts.push(rule); }
  else if (!dos.includes(rule)) dos.push(rule);
}

console.log("# Lessons digest — apply these before you start\n");
console.log("## DO");
for (const d of dos) console.log(`- ${d}`);
console.log("\n## DON'T");
for (const d of donts) console.log(`- ${d}`);
console.log(`\n(${dos.length} DO / ${donts.length} DON'T rules, from ${file})`);
