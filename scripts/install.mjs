#!/usr/bin/env node
// Copies skin/ into the Herdr home (HERDR_APP_HOME, else ~/.config/herdr-app). Safe to rerun.
// An endfield file already there that this script did not write is backed up first, once,
// to .endfield-install/backup/; uninstall.mjs puts it back.
import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { entries, home, owned, same, RETIRED } from "./skin.mjs";

const HOME = home();
if (!existsSync(HOME)) {
  console.error(`No Herdr home at ${HOME}. Start Herdr once, or set HERDR_APP_HOME.`);
  process.exit(1);
}
const STATE = join(HOME, ".endfield-install");
const LEDGER = join(STATE, "ledger.json");
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { created: [] };
const created = new Set(ledger.created);
const done = { added: [], updated: [], backedUp: [], unchanged: [], kept: [], retired: [] };

for (const e of entries()) {
  if (!owned(e.rel)) throw new Error(`refusing to write ${e.rel}: not an endfield path`);
  const dest = join(HOME, e.rel);
  if (existsSync(dest)) {
    if (e.seed) { done.kept.push(e.rel); continue; }
    if (same(e.src, dest)) { done.unchanged.push(e.rel); continue; }
    const backup = join(STATE, "backup", e.rel);
    if (!created.has(e.rel) && !existsSync(backup)) {
      mkdirSync(dirname(backup), { recursive: true });
      copyFileSync(dest, backup);
      done.backedUp.push(e.rel);
    }
    copyFileSync(e.src, dest);
    done.updated.push(e.rel);
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(e.src, dest);
    created.add(e.rel);
    done.added.push(e.rel);
  }
}

for (const rel of RETIRED) {
  if (!existsSync(join(HOME, rel))) continue;
  rmSync(join(HOME, rel), { recursive: true, force: true });
  for (const c of [...created]) if (c.startsWith(`${rel}/`)) created.delete(c);
  done.retired.push(rel);
}

if (created.size !== ledger.created.length || done.retired.length) {
  mkdirSync(STATE, { recursive: true });
  writeFileSync(LEDGER, JSON.stringify({ created: [...created].sort() }, null, 2) + "\n");
}

const list = (label, xs) => xs.length && console.log(`${label} (${xs.length}):\n${xs.map((x) => `  ${x}`).join("\n")}`);
console.log(`Herdr home: ${HOME}`);
list("added", done.added);
list("updated", done.updated);
list("backed up first, to .endfield-install/backup", done.backedUp);
list("kept your copy", done.kept);
list("removed, no longer part of the skin", done.retired);
console.log(`unchanged: ${done.unchanged.length}`);
console.log(done.added.length + done.updated.length
  ? "\nDone. In Herdr, press ctrl-shift-l until Endfield shows, or run: herdr-app do layout.switch --name endfield"
  : "\nNothing to do: the skin is already installed.");
