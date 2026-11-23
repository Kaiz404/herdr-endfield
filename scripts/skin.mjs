// What the skin is, as files: every path under skin/ and where it lands in a Herdr home.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, dirname, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SKIN = join(ROOT, "skin");
export const home = () => process.env.HERDR_APP_HOME || join(homedir(), ".config", "herdr-app");
export const posix = (p) => p.split(sep).join("/");

// A seed is the person's to edit once installed: written only when absent, never overwritten.
const SEEDS = { "data/endfield/operators.example.json": "data/endfield/operators.json", "data/endfield/settings.example.json": "data/endfield/settings.json" };

// The only paths in a Herdr home this project may write or delete.
export const owned = (rel) => /^(layouts|themes)\/endfield[\w-]*\.\w+$|^mods\/endfield[\w-]*\/|^data\/endfield\//.test(rel);

// Files Herdr writes into a mod folder by itself; never the skin's, never stale.
export const herdrWritten = (name) => name.endsWith(".d.ts") || name === "jsconfig.json" || name.startsWith(".") || name === "__pycache__" || name === "node_modules";

export const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});

// Install order: each mod's mod.json before the rest of its folder (Herdr docks a mod folder it sees
// without one), mods before the layout that names them.
const RANK = (rel) => (rel.startsWith("mods/") ? (rel.endsWith("/mod.json") ? 0 : 1) : rel.startsWith("layouts/") ? 3 : 2);

export function entries() {
  return walk(SKIN)
    .map((src) => {
      const from = posix(relative(SKIN, src));
      return { src, from, rel: SEEDS[from] ?? from, seed: from in SEEDS };
    })
    .sort((a, b) => RANK(a.rel) - RANK(b.rel) || a.rel.localeCompare(b.rel));
}

// Folders earlier versions installed or wrote and this one no longer has (endfield-toast and
// endfield-transcript are now the endfield mod's toast and transcript roles). sync, install and
// uninstall delete them from the home; nothing else would.
export const RETIRED = ["mods/endfield-toast", "mods/endfield-transcript", "data/endfield-transcript"];

export const modDirs = () => [...new Set(entries().filter((e) => e.rel.startsWith("mods/")).map((e) => e.rel.split("/").slice(0, 2).join("/")))];

const TEXT = /\.(js|mjs|json|md|svg|txt|py|ps1|sh)$/;
// Text compares with line endings normalised: a Windows checkout may hold CRLF for the same file.
export const read = (p) => (TEXT.test(p) ? readFileSync(p, "utf8").replace(/\r\n/g, "\n") : readFileSync(p));
export const same = (a, b) => existsSync(b) && Buffer.compare(Buffer.from(read(a)), Buffer.from(read(b))) === 0;
