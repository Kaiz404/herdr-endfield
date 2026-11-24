import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(HERE, "..", "skin", "mods", "endfield", "tools", "probe.mjs");
const START = Date.parse("2026-02-01T10:00:00.000Z");

// A made-up transcript in the line shapes Claude Code writes, trimmed to what the fold reads.
let clock = START, messages = 0;
const at = () => new Date((clock += 1000)).toISOString();
const use = (name, input) => ({ type: "assistant", timestamp: at(),
  message: { model: "claude-opus-5-5", id: `msg_${++messages}`, role: "assistant", content: [{ type: "tool_use", id: `tu_${messages}`, name, input }] } });
const done = () => ({ type: "user", timestamp: at(), message: { role: "user", content: [{ tool_use_id: `tu_${messages}`, type: "tool_result", content: "ok" }] } });
const prompt = (text) => ({ type: "user", timestamp: at(), message: { role: "user", content: text } });
const calls = (list) => list.flatMap(([name, input]) => [use(name, input), done()]);
const jsonl = (lines) => lines.map((l) => JSON.stringify(l)).join("\n") + "\n";

const FIRST = calls([
  ["Bash", { command: "cd site\nnpm test", description: "Run tests" }],
  ["Read", { file_path: "/work/site/README.md" }],
  ["Bash", { command: "git status" }],
  ["Edit", { file_path: "/work/site/src/films/moni.tsx" }],
  ["Grep", { pattern: "useFilm" }],
  ["Bash", { command: "npm run build" }],
  ["mcp__tracker__save_issue", { title: "x" }],
]);
const MORE = calls([["Read", { file_path: "/work/site/package.json" }], ["Bash", { command: "npm run lint" }]]);
const SUB = calls([["Glob", { pattern: "**/*.tsx" }], ["Read", { file_path: "/work/site/a.tsx" }]]);

let dir, transcript;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "endfield-dossier-"));
  transcript = path.join(dir, "projects", "session-dossier.jsonl");
  fs.mkdirSync(path.join(dir, "projects", "session-dossier", "subagents"), { recursive: true });
  fs.writeFileSync(transcript, jsonl([prompt("Polish the film pages"), ...FIRST]));
  fs.writeFileSync(path.join(dir, "projects", "session-dossier", "subagents", "agent-asubreader.jsonl"), jsonl([prompt("Find the film components"), ...SUB]));
  fs.mkdirSync(path.join(dir, "sidecars"));
  fs.writeFileSync(path.join(dir, "sidecars", "session-dossier.json"), JSON.stringify({ terminal: "t1", transcript_path: transcript, updated_at: "1" }));
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

function probe(cache) {
  const req = path.join(dir, `req-${cache}.json`);
  fs.writeFileSync(req, JSON.stringify({ cmd: "sessions", cache: path.join(dir, `${cache}.json`), sidecars: path.join(dir, "sidecars"),
    registry: path.join(dir, "no-registry"), targets: [{ terminal: "t1", cwd: null }] }));
  return JSON.parse(execFileSync("node", [PROBE, req], { encoding: "utf8" })).sessions.t1;
}

test("the fold counts calls per tool and keeps the last five, oldest first, with their time and argument", () => {
  const s = probe("cache-a");
  assert.deepEqual(s.counts, { Bash: 3, Read: 1, Edit: 1, Grep: 1, mcp__tracker__save_issue: 1 });
  assert.equal(s.tools, 7);
  assert.deepEqual(s.recent.map((r) => [r.tool, r.arg]),
    [["Bash", "git status"], ["Edit", "moni.tsx"], ["Grep", "useFilm"], ["Bash", "npm run build"], ["mcp__tracker__save_issue", ""]]);
  assert.equal(s.recent[0].at, START + 5000, "the third call is the fifth line built, a second apart");
  assert.deepEqual(s.subagents[0].counts, { Glob: 1, Read: 1 });
  assert.deepEqual(s.subagents[0].recent.map((r) => r.tool), ["Glob", "Read"]);
});

test("appended lines move the counts and the ring on from the cached fold, as a fold from scratch would", () => {
  probe("cache-b");
  fs.appendFileSync(transcript, jsonl(MORE));
  const grown = probe("cache-b");
  const scratch = probe("cache-c");
  assert.deepEqual(grown.counts, { Bash: 4, Read: 2, Edit: 1, Grep: 1, mcp__tracker__save_issue: 1 });
  assert.deepEqual(grown.recent.map((r) => r.arg), ["useFilm", "npm run build", "", "package.json", "npm run lint"]);
  assert.deepEqual([grown.counts, grown.recent], [scratch.counts, scratch.recent]);
});

test("a fold cached by an older probe, which has no counts, is folded again", () => {
  const cache = path.join(dir, "cache-old.json");
  fs.writeFileSync(cache, JSON.stringify({ [transcript]: { to: fs.statSync(transcript).size, v: 3, fold: { tools: 0, last: null, tasks: {}, ends: {}, uses: {} }, used: Date.now() } }));
  assert.equal(probe("cache-old").counts.Bash > 0, true);
});
