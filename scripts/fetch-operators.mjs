#!/usr/bin/env node
// node scripts/fetch-operators.mjs --accept          download the official operator renders and build the art pack
// node scripts/fetch-operators.mjs --list            show the catalogue
// node scripts/fetch-operators.mjs --dry-run         show what a run would do; writes nothing
// node scripts/fetch-operators.mjs --only a,b ...    limit to these slugs
//
// Downloads only the files named in art-pack/operators.json, checks each against its sha256, builds them with
// art-pack/build_pack.py in a temp folder, then copies the pack into <Herdr home>/art/operators.
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { ROOT, home } from "./skin.mjs";

const CATALOGUE = join(ROOT, "art-pack", "operators.json");
const BUILD = join(ROOT, "art-pack", "build_pack.py");
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const FILES = { avatar32: "avatar-32.png", avatar64: "avatar-64.png", avatar128: "avatar-128.png", avatar64round: "avatar-64-round.png", signal: "signal.png" };
const STATE = ".fetch-operators.json";

const catalogue = JSON.parse(readFileSync(CATALOGUE, "utf8"));
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const die = (msg, code = 1) => { console.error(`\n${msg}`); process.exit(code); };
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const shaOf = (p) => (existsSync(p) ? sha(readFileSync(p)) : null);

if (flag("--help") || flag("-h")) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 5).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}
const unknownFlag = args.find((a, i) => a.startsWith("-") && !["--accept", "--list", "--dry-run", "--only"].includes(a) && args[i - 1] !== "--only");
if (unknownFlag) die(`Unknown option ${unknownFlag}. Try --help.`);

const onlyAt = args.indexOf("--only");
const only = onlyAt < 0 ? null : (args[onlyAt + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (only && !only.length) die("--only needs a comma-separated list of slugs. See --list.");
const missing = (only ?? []).filter((s) => !catalogue.operators[s]);
if (missing.length) die(`Not in the catalogue: ${missing.join(", ")}. See --list.`);
const slugs = only ?? Object.keys(catalogue.operators);

if (flag("--list")) {
  for (const [slug, o] of Object.entries(catalogue.operators))
    console.log(`${slug.padEnd(16)} ${o.name.padEnd(16)} ${(o.class ?? "").padEnd(10)} ${(o.element ?? "").padEnd(9)} ${o.rarity ? `${o.rarity}*` : ""}`);
  const assigned = Object.entries(catalogue.default_assignment).map(([k, v]) => `${k} -> ${v ?? "program tile"}`);
  console.log(`\ndefault assignment: ${assigned.join(", ")}`);
  process.exit(0);
}

console.log(`Arknights: Endfield operator art, fetched for your own machine

  This is an unofficial fan project, not affiliated with Hypergryph or Gryphline.
  The character art is (c) Hypergryph / Gryphline. This tool downloads it from the
  official site onto this computer for your personal, local use only.
  Do not redistribute the files: no commits, forks, packs, mods or uploads.
  Fan content guidelines: ${catalogue.guidelines}
`);

const out = join(home(), "art", "operators");
const statePath = join(out, STATE);
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { sources: {}, files: {} };
const rel = (p) => p.slice(out.length + 1).replaceAll("\\", "/");

// Built means: this source hash was built before, and every file it produced is still on disk unchanged.
const built = (slug) => state.sources[slug] === catalogue.operators[slug].source.sha256 &&
  Object.values(FILES).every((f) => { const r = `${slug}/${f}`; return state.files[r] && state.files[r] === shaOf(join(out, r)); });
const todo = slugs.filter((s) => !built(s));

// A file this tool did not write (or one edited since) is copied aside before it is replaced.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
function put(dest, buf, dry) {
  const before = shaOf(dest);
  if (before === sha(buf)) return false;
  if (dry) return true;
  if (before && state.files[rel(dest)] !== before) {
    const backup = join(out, ".fetch-operators-backup", stamp, rel(dest));
    mkdirSync(dirname(backup), { recursive: true });
    copyFileSync(dest, backup);
    console.log(`  kept your ${rel(dest)} as ${rel(backup)}`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  state.files[rel(dest)] = sha(buf);
  return true;
}

function manifestFor(fresh) {
  const path = join(out, "manifest.json");
  const old = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const ops = [...(old.operators ?? [])];
  for (const op of fresh) {
    const i = ops.findIndex((o) => o.slug === op.slug);
    const merged = i < 0 ? op : { ...ops[i], ...op, files: { ...ops[i].files, ...op.files } };
    i < 0 ? ops.push(merged) : (ops[i] = merged);
  }
  const assignment = old.default_assignment ?? Object.fromEntries(Object.entries(catalogue.default_assignment).map(([k, v]) => [k, { operator: v }]));
  return { ...old, default_assignment: assignment, operators: ops };
}

function credits(manifest) {
  const ours = manifest.operators.filter((o) => catalogue.operators[o.slug] && state.sources[o.slug]);
  return `# Operator art credits

The character art in this folder is (c) Hypergryph / Gryphline (GRYPH FRONTIER PTE. LTD.), from Arknights: Endfield.
It was downloaded from the official site by herdr-endfield's \`scripts/fetch-operators.mjs\` for personal, local use on
this computer. It is not part of herdr-endfield and must not be redistributed: do not commit, upload or share this folder.

Fan content guidelines: ${catalogue.guidelines}

| Folder | Operator | Source | sha256 |
|---|---|---|---|
${ours.map((o) => { const c = catalogue.operators[o.slug]; return `| \`${o.slug}/\` | ${c.name} | ${c.source.url} | \`${c.source.sha256.slice(0, 16)}\` |`; }).join("\n")}

Each folder's files are crops and colour treatments of the source render, made by \`art-pack/build_pack.py\`.
They are still Hypergryph / Gryphline's art. Operator page: ${catalogue.operators[slugs[0]].page_url}
`;
}

async function consent() {
  if (flag("--accept")) return;
  if (!process.stdin.isTTY) die("Nothing downloaded. Rerun with --accept to confirm you have read the notice above.", 2);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Download for personal use on this machine? [y/N] ");
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) die("Nothing downloaded.", 2);
}

function findPython() {
  const candidates = process.platform === "win32" ? [["python"], ["py", "-3"], ["python3"]] : [["python3"], ["python"]];
  const run = (c, code) => spawnSync(c[0], [...c.slice(1), "-c", code], { encoding: "utf8" });
  const py = candidates.find((c) => run(c, "import sys; sys.exit(sys.version_info < (3, 8))").status === 0);
  if (!py) die(`Python 3.8 or newer is needed to build the pack, and none was found on PATH.
Install it from https://www.python.org/downloads/ (on Windows, tick "Add python.exe to PATH"), then rerun.`);
  if (run(py, "import PIL").status !== 0) die(`Pillow is needed to build the pack. Install it with:

  ${py.join(" ")} -m pip install Pillow

then rerun.`);
  return py;
}

async function download(slug) {
  const { url, sha256, bytes } = catalogue.operators[slug].source;
  if (!url.startsWith(catalogue.cdn)) die(`${slug}: ${url} is not on the official CDN (${catalogue.cdn}); refusing to download it.`);
  let res;
  try { res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "herdr-endfield-fetch" } }); }
  catch (e) { die(`${slug}: download failed (${e.cause?.code ?? e.name}: ${e.message}). Check your connection and rerun.`); }
  if (!res.ok) die(`${slug}: ${url} answered HTTP ${res.status}. The official site may have moved this file; the catalogue needs an update.`);
  if (Number(res.headers.get("content-length")) > MAX_BYTES) die(`${slug}: the file is larger than ${MAX_BYTES} bytes; refusing it.`);
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_BYTES) die(`${slug}: the file is larger than ${MAX_BYTES} bytes; refusing it.`);
    chunks.push(chunk);
  }
  const buf = Buffer.concat(chunks);
  const got = sha(buf);
  if (got !== sha256) die(`${slug}: the official site now serves a different file than the catalogue expects.
  ${url}
  expected sha256 ${sha256} (${bytes} bytes)
  got      sha256 ${got} (${buf.length} bytes)
Nothing was installed. The catalogue (art-pack/operators.json) needs an update before this operator can be fetched.`);
  console.log(`  ${slug}: ${buf.length} bytes, sha256 ok`);
  return buf;
}

async function main() {
  const dry = flag("--dry-run");
  console.log(`Pack folder: ${out}`);
  for (const s of slugs) console.log(`  ${s.padEnd(16)} ${todo.includes(s) ? `download ${catalogue.operators[s].source.bytes} bytes and build` : "already built, skipped"}`);

  if (dry) {
    const kb = Math.round(todo.reduce((n, s) => n + catalogue.operators[s].source.bytes, 0) / 1024);
    console.log(`\nDry run: would download ${todo.length} file(s), about ${kb} KB, and update manifest.json and CREDITS.md as needed. Nothing was written.`);
    return;
  }
  if (!todo.length) {
    const manifest = manifestFor([]);
    const changed = [put(join(out, "manifest.json"), Buffer.from(JSON.stringify(manifest, null, 2) + "\n"), true), put(join(out, "CREDITS.md"), Buffer.from(credits(manifest)), true)];
    if (!changed.some(Boolean)) { console.log("\nNothing to do: every operator is built and up to date."); return; }
  }

  await consent();
  const py = todo.length ? findPython() : null;
  const tmp = mkdtempSync(join(tmpdir(), "herdr-endfield-fetch-"));
  process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
  let fresh = [];
  if (todo.length) {
    console.log("\nDownloading");
    const pack = { operators: {}, default_assignment: {} };
    for (const slug of todo) {
      const c = catalogue.operators[slug];
      writeFileSync(join(tmp, `${slug}.png`), await download(slug));
      pack.operators[slug] = {
        name: c.name, accent: c.accent, image: `${slug}.png`, eyes: c.eyes, face_width: c.face_width, bust: c.bust,
        ...Object.fromEntries(["class", "element", "rarity"].filter((k) => k in c).map((k) => [k, c[k]])),
        source_url: c.source.url, page_url: c.page_url,
        credit: `${c.name} official illustration (c) Hypergryph / Gryphline. Personal local use only; not redistributed.`,
      };
    }
    writeFileSync(join(tmp, "pack.json"), JSON.stringify(pack, null, 2));
    console.log("\nBuilding");
    const r = spawnSync(py[0], [...py.slice(1), BUILD, join(tmp, "pack.json"), "--home", join(tmp, "home")], { stdio: "inherit" });
    if (r.status !== 0) die(`art-pack/build_pack.py failed (exit ${r.status}). Nothing was installed.`);
    fresh = JSON.parse(readFileSync(join(tmp, "home", "art", "operators", "manifest.json"), "utf8")).operators;
  }

  console.log("\nInstalling");
  mkdirSync(out, { recursive: true });
  for (const op of fresh) {
    for (const f of Object.values(FILES)) put(join(out, op.slug, f), readFileSync(join(tmp, "home", "art", "operators", op.slug, f)), false);
    state.sources[op.slug] = catalogue.operators[op.slug].source.sha256;
    console.log(`  ${op.slug}: ${Object.keys(FILES).length} files`);
  }
  const manifest = manifestFor(fresh);
  if (put(join(out, "manifest.json"), Buffer.from(JSON.stringify(manifest, null, 2) + "\n"), false)) console.log("  manifest.json updated");
  if (put(join(out, "CREDITS.md"), Buffer.from(credits(manifest)), false)) console.log("  CREDITS.md updated");
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
  console.log(`\nDone. ${fresh.length} operator(s) built into ${out}.`);
}

await main();
