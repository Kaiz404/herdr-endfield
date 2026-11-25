#!/usr/bin/env node
// node scripts/verify.mjs            static checks on this repo, then live checks on the Herdr home
// node scripts/verify.mjs --static   repo only; needs no Herdr (what CI runs)
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { ROOT, SKIN, home, posix, owned, walk, entries, modDirs, RETIRED } from "./skin.mjs";
import { dividers } from "./dividers.mjs";

const STATIC = process.argv.includes("--static");
const failures = [];
const fail = (msg) => failures.push(msg);
const ok = (msg) => console.log(`ok   ${msg}`);
const check = (good, ...msgs) => (msgs.length ? msgs.forEach(fail) : ok(good));

const sh = (cmd, args) => {
  try { return { code: 0, out: execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
  catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
};

const repoFiles = walk(ROOT).filter((p) => !/[\\/](\.git|node_modules)[\\/]/.test(p)).map((p) => ({ p, rel: posix(p.slice(ROOT.length + 1)) }));
const BINARY = /\.(ttf|otf|png|jpe?g|webp|gif|bmp|ico|mp3)$/i;
const text = (f) => readFileSync(f.p, "utf8");

// ---- the skin's own rules (ported from the Endfield lever)

const skin = entries();
check("every retired path is an endfield folder the skin no longer ships",
  ...RETIRED.filter((rel) => !/^(mods|data)\/endfield-[\w-]+$/.test(rel) || entries().some((e) => e.rel.startsWith(`${rel}/`))).map((rel) => `scripts/skin.mjs RETIRED has ${rel}: install, sync and uninstall delete it, so it must be an endfield-* folder the skin no longer ships`));
check("every skin file lands on an endfield-owned path", ...skin.filter((e) => !owned(e.rel)).map((e) => `skin/${e.from}: lands on ${e.rel}, which is not an endfield path; install would touch the person's own files`));

for (const m of modDirs()) {
  const f = join(SKIN, m, "mod.json");
  if (!existsSync(f)) { fail(`skin/${m}: mod.json missing (Herdr docks a folder without one into the shown layout)`); continue; }
  const place = JSON.parse(readFileSync(f, "utf8")).place;
  place === "none" ? ok(`${m}: mod.json place "none"`) : fail(`skin/${m}: mod.json place is ${JSON.stringify(place)}, must be "none" so it never auto-docks`);
}

const layout = JSON.parse(readFileSync(join(SKIN, "layouts", "endfield.json"), "utf8"));
const ids = new Set();
const docked = [];
const PANE_ONLY = new Set(["comms", "transcript"]);
(function visit(n) {
  if (!n || typeof n !== "object") return;
  if (n.id) ids.add(n.id);
  if (n.content?.mod === "endfield" && PANE_ONLY.has(n.content.props?.role)) docked.push(`the ${n.content.props.role} role`);
  Object.values(n).forEach(visit);
})(layout);
const contract = ["sidebar", "panel", "panel-body", "files", "changes"];
check("layout node-id contract intact", ...contract.filter((id) => !ids.has(id)).map((id) => `layouts/endfield.json lost node id "${id}", which other mods look up`));
check("no pane-only mod docked into the layout", ...docked.map((m) => `layouts/endfield.json docks ${m}, which must only open as a pane`));

const sources = skin.filter((e) => /\.m?js$/.test(e.from)).map((e) => ({ p: e.src, rel: e.from }));
const DATA_TIMERS = { checkNew: "ported verbatim from shipped mods/spaces: polls for new spaces, not animation" };
for (const f of sources) {
  const src = text(f);
  if (/\bset(Timeout|Interval)\s*\(/.test(src) && !f.rel.includes("/tools/")) fail(`${f.rel}: setTimeout/setInterval are not available in mods`);
  for (const m of src.matchAll(/timer\.every\(\s*(\d+)[^\n]*?this\.(\w+)/g))
    if (Number(m[1]) < 1000 && !DATA_TIMERS[m[2]]) fail(`${f.rel}: timer.every(${m[1]}) repaints the window for animation; use .loop/.frames/.transition`);
  if (/["'`](claude|codex|gemini|opencode)["'`]\s*[,\]]/.test(src) && /\b(hc|exec)\s*\(/.test(src) && /\brun\b/.test(src) && /["'`]run["'`]/.test(src))
    fail(`${f.rel}: looks like it starts an agent session via hc run; skins must never spawn agents`);
}
ok(`scanned ${sources.length} skin sources for banned timers and agent spawns`);
const BUILDERS = ["v_flex", "h_flex", "div", "svg", "image"];
const unbound = (src) => BUILDERS.filter((b) => new RegExp(String.raw`(^|[^.\w])${b}\(`, "m").test(src)
  && !new RegExp(String.raw`import\s*\{[^}]*\b${b}\b[^}]*\}|\b(const|let|function)\s+${b}\b`).test(src));
check("every gpui builder a source calls is imported (Herdr only reports a missing one when the view renders)",
  ...sources.flatMap((f) => unbound(text(f)).map((b) => `${f.rel}: calls ${b}() without importing it`)));
check("no dots between data in skin code (CONTRIBUTING: design rules)",
  ...sources.filter((f) => !f.rel.includes("/tools/")).flatMap((f) => dividers(text(f)).map((d) => `${f.rel}:${d.line}: a glyph separates data (${d.text.slice(0, 80)}); use a gap, tone or a hairline, or a comma in a tooltip`)));

const kit = readFileSync(join(SKIN, "mods", "endfield", "kit.js"), "utf8");
const braces = (src, from) => {
  let depth = 0;
  const i = src.indexOf("{", from);
  for (let j = i; j < src.length; j++) { if (src[j] === "{") depth++; if (src[j] === "}" && --depth === 0) return src.slice(i, j + 1); }
  return "";
};
const block = (name) => (kit.indexOf(`${name} = {`) < 0 ? "" : braces(kit, kit.indexOf(`${name} = {`)));
const keysOf = (src) => new Set([...src.matchAll(/^\s*([A-Za-z_]\w*)\s*:/gm)].map((m) => m[1]));
const palette = block("PALETTE");
const variants = [...palette.matchAll(/^\s{2}(\w+):\s*\{/gm)].map((m) => [m[1], keysOf(braces(palette, palette.indexOf(`${m[1]}: {`)).slice(1, -1))]);
const signal = keysOf(block("SIGNAL"));
const used = new Map();
for (const f of sources) {
  const src = text(f);
  if (!/from\s+["']\.\/kit\.js["']|palette\(\)/.test(src) || /const C\s*=\s*\{|const PALETTE/.test(src)) continue;
  for (const m of src.matchAll(/\bC\.([A-Za-z_]\w*)/g)) used.set(m[1], (used.get(m[1]) ?? new Set()).add(f.rel));
}
check(`all ${used.size} palette keys used are defined in ${variants.map(([v]) => v).join(" + ")} or SIGNAL`,
  ...[...used].filter(([k]) => !signal.has(k) && !variants.every(([, ks]) => ks.has(k)))
    .map(([k, files]) => `palette key C.${k} is used (${[...files].join(", ")}) but not defined in every variant or SIGNAL`));

const artUsers = sources.filter((f) => /art[\\/]operators/.test(text(f)));
check("operator art is only reached through a fallback", ...artUsers.filter((f) => !/existsSync|exists\(|readTextFile|fallback|\?\?/.test(text(f))).map((f) => `${f.rel}: references art/operators without a fallback; the skin must work with no art pack`));

// ---- the repo as a whole

const jsonBad = repoFiles.filter((f) => f.rel.endsWith(".json")).flatMap((f) => { try { JSON.parse(text(f)); return []; } catch (e) { return [`${f.rel}: invalid JSON (${e.message})`]; } });
check(`every JSON file parses`, ...jsonBad);

// node --check reads .js as CommonJS; a temp .mjs copy makes it parse mod sources as the modules they are.
const tmp = mkdtempSync(join(tmpdir(), "endfield-check-"));
const syntax = repoFiles.filter((f) => /\.m?js$/.test(f.rel)).flatMap((f, i) => {
  const copy = join(tmp, `${i}-${basename(f.rel).replace(/\.m?js$/, "")}.mjs`);
  copyFileSync(f.p, copy);
  const r = sh(process.execPath, ["--check", copy]);
  return r.code === 0 ? [] : [`${f.rel}: node --check failed: ${r.out.trim().split("\n").slice(0, 4).join(" | ")}`];
});
rmSync(tmp, { recursive: true, force: true });
check(`node --check passes on ${repoFiles.filter((f) => /\.m?js$/.test(f.rel)).length} scripts`, ...syntax);

// The skin's pure logic (the modules with no Herdr import) has node tests under tests/.
const TESTS = join(ROOT, "tests");
const testFiles = existsSync(TESTS) ? readdirSync(TESTS).filter((f) => f.endsWith(".test.mjs")).map((f) => join(TESTS, f)) : [];
const tested = sh(process.execPath, ["--test", ...testFiles]);
check(`node --test: ${testFiles.length} test files pass`, ...(testFiles.length && tested.code === 0 ? [] : [`node --test failed:\n${tested.out.split("\n").filter((l) => /^not ok|^# (pass|fail)|Error|expected|actual/.test(l.trim())).slice(0, 20).join("\n")}`]));

// Personal data: this repo is published. Placeholders in angle brackets (C:\Users\<name>) are allowed.
const PERSONAL = [
  ["absolute user path", /\b[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}(?!<)[^\\/\s"'`<>]+|(?<![\w.~$}])\/(?:Users|home)\/(?!<)[A-Za-z0-9._-]+/],
  ["email address", /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/],
  ["session id (UUID)", /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
  ["Herdr space/tab/pane id", /\b(?:sp|tb|p)[0-9a-f]{32}\b/],
];
// The official asset CDN may be named in one place: the catalogue fetch-operators.mjs downloads from on the person's machine.
const CDN = /hg-cdn\.com/i;
const CATALOGUE = "art-pack/operators.json";
const IMAGES_ALLOWED = new Set(["preview.png"]);
const personal = repoFiles.flatMap((f) => {
  const found = [];
  if (/(^|\/)art\/operators\//.test(f.rel)) found.push(`${f.rel}: files under art/operators are official art and never ship`);
  if (/\.(jsonl|ndjson|log)$/i.test(f.rel) || /herdr-shot/i.test(f.rel)) found.push(`${f.rel}: transcripts, logs and window shots never ship`);
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(f.rel) && !IMAGES_ALLOWED.has(f.rel)) found.push(`${f.rel}: images ship only as ${[...IMAGES_ALLOWED].join(", ")} (no screenshots, no official art)`);
  if (BINARY.test(f.rel)) return found;
  text(f).split("\n").forEach((line, i) => {
    for (const [what, re] of PERSONAL) if (re.test(line)) found.push(`${f.rel}:${i + 1}: ${what}: ${line.match(re)[0]}`);
    if (CDN.test(line) && f.rel !== CATALOGUE) found.push(`${f.rel}:${i + 1}: official CDN URL outside ${CATALOGUE}: ${line.match(CDN)[0]}`);
  });
  return found;
});
check(`no personal data, transcripts or official art in ${repoFiles.length} files`, ...personal);

const catalogue = JSON.parse(readFileSync(join(ROOT, CATALOGUE), "utf8"));
const urls = JSON.stringify(catalogue).match(/https?:\/\/[^"\s]+/g) ?? [];
const offsite = urls.filter((u) => !u.startsWith(catalogue.cdn) && !u.startsWith("https://endfield.gryphline.com/"));
const unpinned = Object.entries(catalogue.operators).filter(([, o]) => !o.source?.url?.startsWith(catalogue.cdn) || !/^[0-9a-f]{64}$/.test(o.source?.sha256 ?? ""));
check(`${CATALOGUE}: ${urls.length} URLs, all official; every source pinned by sha256`,
  ...offsite.map((u) => `${CATALOGUE}: ${u} is not on the official site or its CDN (no wikis or mirrors)`),
  ...unpinned.map(([slug]) => `${CATALOGUE}: ${slug} needs source.url on ${catalogue.cdn} and a 64-hex source.sha256`));

// ---- live: the installed skin in a running Herdr

if (!STATIC) {
  const HOME = home();
  for (const m of modDirs()) {
    const r = sh("herdr-app", ["check", join(HOME, m)]);
    r.code === 0 ? ok(`herdr-app check ${m}`) : fail(`herdr-app check ${m}: ${r.out.trim().split("\n").slice(-3).join(" | ")}`);
  }
  const errorFiles = [HOME, join(HOME, "layouts"), join(HOME, "themes"), ...modDirs().map((m) => join(HOME, m))]
    .flatMap((d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".error")).map((f) => join(d, f)) : []));
  check("no *.error files", ...(errorFiles.length ? [`error files: ${errorFiles.join(", ")}`] : []));
  const status = sh("herdr-app", ["status"]);
  try {
    const s = JSON.parse(status.out);
    check("herdr-app status has no errors", ...((s.errors ?? []).length ? [`herdr-app status errors: ${JSON.stringify(s.errors)}`] : []));
  } catch { fail(`herdr-app status unreadable (is Herdr running?): ${status.out.slice(0, 200)}`); }
  const manifest = join(HOME, "art", "operators", "manifest.json");
  if (existsSync(manifest)) {
    const list = JSON.parse(readFileSync(manifest, "utf8")).operators ?? [];
    const gone = list.flatMap((o) => Object.values(o.files ?? {}).filter((p) => typeof p === "string" && !existsSync(join(HOME, p))).map((p) => `${o.slug}:${p}`));
    check(`art pack: ${list.length} operators, all files present`, ...(gone.length ? [`art pack manifest points at missing files: ${gone.slice(0, 5).join(", ")}`] : []));
  } else ok("no art pack installed (the skin falls back to program tiles)");
}

console.log(failures.length ? `\nFAIL ${failures.length}\n${failures.map((f) => `  - ${f}`).join("\n")}` : `\nPASS${STATIC ? " (static)" : ""}`);
process.exit(failures.length ? 1 : 0);
