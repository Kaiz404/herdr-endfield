import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(HERE, "..", "skin", "mods", "endfield", "tools", "probe.mjs");
const CWD = "/srv/proj";

// A made-up transcript in the line shapes Claude Code writes, trimmed to what the fold reads.
const LINES = [
  { type: "user", timestamp: "2026-02-01T10:00:01.000Z", message: { role: "user", content: "Tidy the readme" } },
  { type: "assistant", timestamp: "2026-02-01T10:00:02.000Z", message: { model: "claude-opus-5-5", id: "msg_1", role: "assistant",
    content: [{ type: "text", text: "Done." }], usage: { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 20 } } },
];

let dir, remote, local;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "endfield-machines-"));
  // Another machine's home as this computer reads it (a WSL distro's \\wsl.localhost share), and an empty home here.
  remote = path.join(dir, "remote-home");
  local = path.join(dir, "local-home");
  const project = path.join(remote, ".claude", "projects", "-srv-proj");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(local);
  fs.writeFileSync(path.join(project, "session-remote.jsonl"), LINES.map((l) => JSON.stringify(l)).join("\n") + "\n");
  // A registry here that names the remote session: a pid on this computer says nothing about one on another.
  fs.mkdirSync(path.join(dir, "registry"));
  fs.writeFileSync(path.join(dir, "registry", `${process.pid}.json`), JSON.stringify({ sessionId: "session-remote", pid: process.pid, startedAt: 0 }));
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

function probe(targets) {
  const req = path.join(dir, "req.json");
  fs.writeFileSync(req, JSON.stringify({ cmd: "sessions", cache: path.join(dir, "cache.json"), registry: path.join(dir, "registry"), targets }));
  const env = { ...process.env, HOME: local, USERPROFILE: local };
  return JSON.parse(execFileSync("node", [PROBE, req], { encoding: "utf8", env }));
}

test("an agent on another machine is read from that machine's home, with no word on whether it runs", () => {
  const out = probe([{ terminal: "wsl/t2", cwd: CWD, home: remote }]);
  const s = out.sessions["wsl/t2"];
  assert.equal(s?.sessionId, "session-remote");
  assert.equal(s.model, "claude-opus-5-5");
  assert.equal(s.turns, 1);
  assert.equal(s.live, null, "this computer's registry can't say whether a process on another machine runs");
  assert.ok(out.watch.includes(path.join(remote, ".claude", "projects", "-srv-proj")), "its project folder is watched");
});

test("an agent with no home is read from this computer's home only", () => {
  const out = probe([{ terminal: "t9", cwd: CWD }]);
  assert.equal(out.sessions.t9, undefined);
});
