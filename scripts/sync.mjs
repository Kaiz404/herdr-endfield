#!/usr/bin/env node
// Dev loop: make the Herdr home's endfield files equal this repo's skin/. Herdr hot-reloads them.
// node scripts/sync.mjs --dry-run   prints the differences, writes nothing
// No backups: run install.mjs first on a home whose endfield files you want to keep.
import { mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { entries, home, owned, same, walk, posix, herdrWritten, modDirs } from "./skin.mjs";

const DRY = process.argv.includes("--dry-run");
const HOME = home();
const skin = entries();
const wanted = new Set(skin.map((e) => e.rel));
const plan = [];

for (const e of skin) {
  if (!owned(e.rel)) throw new Error(`refusing to write ${e.rel}: not an endfield path`);
  const dest = join(HOME, e.rel);
  if (!existsSync(dest)) plan.push(["add", e.rel, e.src]);
  else if (!same(e.src, dest)) plan.push([e.seed ? "differs (your copy, kept)" : "update", e.rel, e.src]);
}
for (const m of modDirs()) {
  if (!existsSync(join(HOME, m))) continue;
  for (const p of walk(join(HOME, m))) {
    const rel = posix(p.slice(HOME.length + 1));
    if (!wanted.has(rel) && !rel.split("/").some(herdrWritten)) plan.push(["remove", rel]);
  }
}

for (const [op, rel, src] of plan) {
  console.log(`${DRY ? "would " : ""}${op}  ${rel}`);
  if (DRY || op.startsWith("differs")) continue;
  const dest = join(HOME, rel);
  if (op === "remove") rmSync(dest);
  else { mkdirSync(dirname(dest), { recursive: true }); copyFileSync(src, dest); }
}
console.log(`\n${plan.length} difference${plan.length === 1 ? "" : "s"} between skin/ and ${HOME} (${skin.length} skin files)${DRY ? ", dry run" : ""}`);
