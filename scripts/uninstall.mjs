#!/usr/bin/env node
// Removes what install.mjs wrote and puts back what it backed up. Touches only endfield paths.
// Leaves data/endfield/ runtime files (session cache, your operator overrides) and art/operators/.
import { existsSync, readFileSync, rmSync, copyFileSync, readdirSync, rmdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { entries, home, owned, same, herdrWritten, modDirs } from "./skin.mjs";

const HOME = home();
const STATE = join(HOME, ".endfield-install");
const LEDGER = join(STATE, "ledger.json");

let shown = null;
try { shown = JSON.parse(execFileSync("herdr-app", ["status"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 })).layout; } catch {}
if (shown === "endfield" && !process.argv.includes("--force")) {
  console.error("Herdr is showing the Endfield layout. Switch away first (ctrl-shift-l, or: herdr-app do layout.switch --name main), then rerun.\nOr pass --force.");
  process.exit(1);
}
if (!existsSync(LEDGER)) {
  console.error(`No install record at ${LEDGER}: nothing this script installed is there.`);
  process.exit(1);
}

const created = new Set(JSON.parse(readFileSync(LEDGER, "utf8")).created);
const done = { restored: [], removed: [], kept: [] };
for (const e of entries()) {
  if (!owned(e.rel)) continue;
  const dest = join(HOME, e.rel);
  const backup = join(STATE, "backup", e.rel);
  if (existsSync(backup)) { copyFileSync(backup, dest); done.restored.push(e.rel); }
  else if (created.has(e.rel) && existsSync(dest)) {
    if (e.seed && !same(e.src, dest)) { done.kept.push(e.rel); continue; }
    rmSync(dest);
    done.removed.push(e.rel);
  }
}

// A mod folder this script created goes entirely, including what Herdr wrote into it.
const prune = (dir) => {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (herdrWritten(d.name)) rmSync(p, { recursive: true, force: true });
    else if (d.isDirectory()) prune(p);
  }
  if (!readdirSync(dir).length) rmdirSync(dir);
};
for (const m of modDirs()) if (created.has(`${m}/mod.json`) && existsSync(join(HOME, m))) prune(join(HOME, m));
for (const e of entries())
  for (let rel = dirname(e.rel); owned(`${rel}/`); rel = dirname(rel))
    if (existsSync(join(HOME, rel)) && !readdirSync(join(HOME, rel)).length) rmdirSync(join(HOME, rel));
rmSync(STATE, { recursive: true, force: true });

const list = (label, xs) => xs.length && console.log(`${label} (${xs.length}):\n${xs.map((x) => `  ${x}`).join("\n")}`);
console.log(`Herdr home: ${HOME}`);
list("restored from backup", done.restored);
list("removed", done.removed);
list("kept (you edited it)", done.kept);
if (existsSync(join(HOME, "data", "endfield"))) console.log("left in place: data/endfield/ (session cache and your settings); delete it by hand if you want it gone");
