import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isWsl, askAgainAt } from "../skin/mods/endfield/fleet.js";

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

function probe(targets, more = {}) {
  const req = path.join(dir, "req.json");
  fs.writeFileSync(req, JSON.stringify({ cmd: "sessions", cache: path.join(dir, "cache.json"), registry: path.join(dir, "registry"), targets, ...more }));
  const env = { ...process.env, HOME: local, USERPROFILE: local };
  return JSON.parse(execFileSync("node", [PROBE, req], { encoding: "utf8", env }));
}

test("an agent on another machine is read from that machine's home, with no word on whether it runs", () => {
  const out = probe([{ terminal: "t2", cwd: CWD }], { home: remote });
  const s = out.sessions.t2;
  assert.equal(s?.sessionId, "session-remote");
  assert.equal(s.model, "claude-opus-5-5");
  assert.equal(s.turns, 1);
  assert.equal(s.live, null, "this computer's registry can't say whether a process on another machine runs");
  const project = path.join(remote, ".claude", "projects", "-srv-proj");
  assert.ok(out.missing.includes(project), "its project folder is polled");
  assert.ok(!out.watch.includes(project), "Herdr is never asked to watch another machine's folder");
});

test("an agent with no home is read from this computer's home only", () => {
  const out = probe([{ terminal: "t9", cwd: CWD }]);
  assert.equal(out.sessions.t9, undefined);
});

test("a statusline on the other machine names its agent's exact session, by that machine's path", () => {
  const project = path.join(remote, ".claude", "projects", "-srv-two");
  fs.mkdirSync(project, { recursive: true });
  const text = LINES.map((l) => JSON.stringify(l)).join("\n") + "\n";
  fs.writeFileSync(path.join(project, "session-named.jsonl"), text);
  fs.writeFileSync(path.join(project, "session-newer.jsonl"), text);
  const before = new Date(Date.now() - 60000);
  fs.utimesSync(path.join(project, "session-named.jsonl"), before, before);
  const sidecars = path.join(remote, ".config", "herdr-app", "data", "endfield", "sessions");
  fs.mkdirSync(sidecars, { recursive: true });
  fs.writeFileSync(path.join(sidecars, "session-named.json"), JSON.stringify({ session_id: "session-named", terminal: "t4", cwd: "/srv/two",
    transcript_path: "/opt/agent/.claude/projects/-srv-two/session-named.jsonl", updated_at: new Date().toISOString() }));
  const out = probe([{ terminal: "t4", cwd: "/srv/two" }], { home: remote, sidecars });
  const s = out.sessions.t4;
  assert.equal(s?.sessionId, "session-named", "the sidecar's session, not the folder's newest transcript");
  assert.equal(s.approx, false);
  assert.equal(s.transcript, path.join(project, "session-named.jsonl"));
  assert.ok(out.missing.includes(sidecars) && !out.watch.includes(sidecars), "the other machine's sidecar folder is polled, never watched");
});

test("a machine is read through its home only when Herdr reaches it through wsl.exe", () => {
  assert.equal(isWsl("wsl.exe -d Ubuntu -e sh -c"), true);
  assert.equal(isWsl("C:\\Windows\\System32\\wsl.exe -d Debian -e sh -c"), true);
  assert.equal(isWsl("ssh vps"), false, "an ssh machine with wslpath on it is still another computer");
  assert.equal(isWsl("C:\\Program Files\\WSL\\wsl.exe -d Ubuntu -e sh -c"), true, "a path with a space, unquoted");
  assert.equal(isWsl("\"C:\\Program Files\\WSL\\wsl.exe\" -d Ubuntu -e sh -c"), true, "a path with a space, quoted");
  assert.equal(isWsl("\"C:\\Program Files\\OpenSSH\\ssh.exe\" box"), false);
  assert.equal(isWsl("ssh wsl.exe-box"), false);
  assert.equal(isWsl("ssh wsl"), false);
  assert.equal(isWsl(undefined), false);
});

test("a machine that couldn't be asked is asked again later, less often each time, never more than five minutes apart", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 12].map((n) => askAgainAt(n, 0)), [15000, 30000, 60000, 120000, 240000, 300000, 300000]);
});

test("two agents in one folder on another machine each show their own session, found by their Claude Code process", () => {
  const project = path.join(remote, ".claude", "projects", "-srv-pair");
  const reg = path.join(remote, ".claude", "sessions");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(reg, { recursive: true });
  const text = LINES.map((l) => JSON.stringify(l)).join("\n") + "\n";
  for (const id of ["session-idle", "session-busy", "session-newest"]) fs.writeFileSync(path.join(project, `${id}.jsonl`), text);
  const old = new Date(Date.now() - 60000);
  for (const id of ["session-idle", "session-busy"]) fs.utimesSync(path.join(project, `${id}.jsonl`), old, old);
  fs.writeFileSync(path.join(reg, "872.json"), JSON.stringify({ pid: 872, sessionId: "session-idle", cwd: "/srv/pair" }));
  fs.writeFileSync(path.join(reg, "6524.json"), JSON.stringify({ pid: 6524, sessionId: "session-busy", cwd: "/srv/pair" }));
  const out = probe([{ terminal: "t5", cwd: "/srv/pair", pid: 872 }, { terminal: "t7", cwd: "/srv/pair", pid: 6524 }, { terminal: "t8", cwd: "/srv/pair" }], { home: remote });
  assert.equal(out.sessions.t5?.sessionId, "session-idle");
  assert.equal(out.sessions.t5.approx, false);
  assert.equal(out.sessions.t7?.sessionId, "session-busy");
  assert.equal(out.sessions.t7.approx, false);
  assert.equal(out.sessions.t8?.sessionId, "session-newest", "with no process to look up, the folder's newest transcript, marked approx");
  assert.equal(out.sessions.t8.approx, true);
});

test("a registry file from another folder never names an agent's session", () => {
  const reg = path.join(remote, ".claude", "sessions");
  fs.mkdirSync(reg, { recursive: true });
  const project = path.join(remote, ".claude", "projects", "-srv-pair");
  fs.writeFileSync(path.join(project, "session-other.jsonl"), LINES.map((l) => JSON.stringify(l)).join("\n") + "\n");
  fs.writeFileSync(path.join(reg, "990.json"), JSON.stringify({ pid: 990, sessionId: "session-other", cwd: "/srv/elsewhere" }));
  const out = probe([{ terminal: "t5", cwd: "/srv/pair", pid: 990 }], { home: remote });
  assert.equal(out.sessions.t5?.approx, true, "the registry file is not taken: the folder's newest transcript stands in, marked approx");
});

test("a registry file older than the agent's terminal is an earlier process on a reused pid, never its session", () => {
  const reg = path.join(remote, ".claude", "sessions");
  fs.writeFileSync(path.join(reg, "991.json"), JSON.stringify({ pid: 991, sessionId: "session-idle", cwd: "/srv/pair", startedAt: 1000 }));
  const out = probe([{ terminal: "t6", cwd: "/srv/pair", pid: 991, since: 5000 }], { home: remote });
  assert.notEqual(out.sessions.t6?.sessionId, "session-idle");
  assert.equal(out.sessions.t6?.approx, true);
});
