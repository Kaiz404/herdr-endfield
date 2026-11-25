import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { railStreaks } from "../skin/mods/endfield/fleet.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(HERE, "..", "skin", "mods", "endfield", "tools", "probe.mjs");
const SOCKET_A = String.raw`\\.\pipe\LOCAL\cc-msg-00000000000000000000000000000a0a`;
const SOCKET_GONE = String.raw`\\.\pipe\LOCAL\cc-msg-00000000000000000000000000000dead`;

const prompt = (at, text) => ({ type: "user", timestamp: at, message: { role: "user", content: text } });
// A message from another session, in the shape Claude Code 2.1.332 writes on the receiving side.
const peer = (at, id, from, body) => ({ type: "user", isMeta: true, timestamp: at,
  origin: { kind: "peer", from: `uds:${from}`, msg_id: id, name: "sender", fromMode: "prompting", body },
  message: { role: "user", content: `Another Claude session sent a message:\n<cross-session-message from="uds:${from}" from-name="sender" from-mode="prompting">\n${body}\n</cross-session-message>` } });

let dir, home;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "endfield-streak-"));
  home = path.join(dir, "home");
  const write = (cwd, session, lines) => {
    const project = path.join(home, ".claude", "projects", cwd.replace(/[^A-Za-z0-9]/g, "-"));
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, `${session}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  };
  write("/srv/a", "session-a", [prompt("2026-02-01T10:00:00.000Z", "Build the API")]);
  write("/srv/b", "session-b", [
    prompt("2026-02-01T10:00:01.000Z", "Build the client"),
    peer("2026-02-01T10:00:05.000Z", "msg-1", SOCKET_A, "The schema is in"),
    peer("2026-02-01T10:00:09.000Z", "msg-2", SOCKET_GONE, "From a session that has ended"),
  ]);
  const registry = path.join(dir, "registry");
  fs.mkdirSync(registry);
  fs.writeFileSync(path.join(registry, "101.json"), JSON.stringify({ pid: 101, sessionId: "session-a", messagingSocketPath: SOCKET_A }));
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("a session's received cross-session messages name the sending session, found by its inbox socket", () => {
  const req = path.join(dir, "req.json");
  fs.writeFileSync(req, JSON.stringify({ cmd: "sessions", cache: path.join(dir, "cache.json"), registry: path.join(dir, "registry"),
    targets: [{ terminal: "t1", cwd: "/srv/a" }, { terminal: "t2", cwd: "/srv/b" }] }));
  const out = JSON.parse(execFileSync("node", [PROBE, req], { encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home } }));
  assert.deepEqual(out.sessions.t2.messages, [
    { id: "msg-1", at: Date.parse("2026-02-01T10:00:05.000Z"), from: "session-a" },
    { id: "msg-2", at: Date.parse("2026-02-01T10:00:09.000Z"), from: null },
  ]);
  assert.deepEqual(out.sessions.t1.messages, [], "sending writes nothing into the sender's received list");
  assert.equal(out.sessions.t2.turns, 1, "a message from another session is not a prompt from the person");
});

const TIMING = { recent: 20000, gap: 1500 };
const NOW = 100000;
const upper = { session: "A", y: 20 }, lower = { session: "B", y: 70 };
const msg = (id, at, from, to) => ({ id, at, from, to });

test("a streak runs from the sender's row to the receiver's: down when the upper agent sent it, up when the lower did", () => {
  assert.deepEqual(railStreaks([upper, lower], [msg("m1", NOW - 5000, "A", "B")], NOW, TIMING), [{ id: "m1", from: 20, to: 70 }]);
  assert.deepEqual(railStreaks([upper, lower], [msg("m2", NOW - 5000, "B", "A")], NOW, TIMING), [{ id: "m2", from: 70, to: 20 }]);
});

test("a burst of messages plays as one streak, and the next one after the gap plays again", () => {
  const burst = [msg("m1", NOW - 3000, "A", "B"), msg("m2", NOW - 2800, "B", "A"), msg("m3", NOW - 2500, "A", "B"), msg("m4", NOW - 1000, "B", "A")];
  assert.deepEqual(railStreaks([upper, lower], burst, NOW, TIMING).map((s) => s.id), ["m1", "m4"]);
});

test("a burst held back never plays late, once the streak that played for it is too old", () => {
  const at = (s) => NOW + s * 1000;
  const burst = [msg("m1", at(0), "A", "B"), msg("m2", at(1), "B", "A"), msg("m3", at(2), "A", "B"), msg("m4", at(3), "B", "A")];
  const played = (s) => railStreaks([upper, lower], burst, at(s), TIMING).map((k) => k.id);
  assert.deepEqual(played(3), ["m1", "m3"]);
  assert.deepEqual(played(20.5), ["m3"], "m1 is too old, and m2 and m4 stay held back");
  assert.deepEqual(played(23.5), [], "past `recent` after the last message, nothing plays");
});

test("a quiet rail stays still: old messages, unknown senders and agents outside the rail play nothing", () => {
  const messages = [msg("old", NOW - 30000, "A", "B"), msg("anon", NOW - 1000, null, "B"), msg("outside", NOW - 1000, "C", "B")];
  assert.deepEqual(railStreaks([upper, lower], messages, NOW, TIMING), []);
  assert.deepEqual(railStreaks([upper, lower], [], NOW, TIMING), []);
});
