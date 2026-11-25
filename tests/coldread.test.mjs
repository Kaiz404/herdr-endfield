import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(HERE, "..", "skin", "mods", "endfield", "tools", "probe.mjs");
const FOLDERS = ["/srv/a", "/srv/b", "/srv/c"];

const LINES = [
  { type: "user", timestamp: "2026-02-01T10:00:01.000Z", message: { role: "user", content: "Tidy the readme" } },
  { type: "assistant", timestamp: "2026-02-01T10:00:02.000Z", message: { model: "claude-opus-5-5", id: "msg_1", role: "assistant",
    content: [{ type: "text", text: "Done." }], usage: { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 20 } } },
];

let dir, home;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "endfield-coldread-"));
  home = path.join(dir, "home");
  for (const cwd of FOLDERS) {
    const project = path.join(home, ".claude", "projects", cwd.replace(/[^A-Za-z0-9]/g, "-"));
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, `session${cwd.replace(/\//g, "-")}.jsonl`), LINES.map((l) => JSON.stringify(l)).join("\n") + "\n");
  }
  fs.mkdirSync(path.join(dir, "registry"));
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

function probe() {
  const req = path.join(dir, "req.json");
  fs.writeFileSync(req, JSON.stringify({ cmd: "sessions", cache: path.join(dir, "cache.json"), registry: path.join(dir, "registry"), budget: 0,
    targets: FOLDERS.map((cwd, i) => ({ terminal: `t${i}`, cwd })) }));
  return JSON.parse(execFileSync("node", [PROBE, req], { encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home } }));
}

test("a cold read past its budget answers what it read, saves it, and the next run carries on", () => {
  const runs = [probe(), probe(), probe()];
  assert.deepEqual(runs.map((r) => Object.keys(r.sessions).length), [1, 2, 3], "each run adds the transcript it had time for");
  assert.deepEqual(runs.map((r) => r.partial), [true, true, false]);
  assert.equal(runs[2].sessions.t2.turns, 1, "a transcript read across runs folds the same as one read at once");
  assert.equal(probe().partial, false, "a warm run reads nothing new, so the budget never cuts it");
});
