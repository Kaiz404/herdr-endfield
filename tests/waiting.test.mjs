import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runStatus, subagentView, statusOf, rank, rowShape } from "../skin/mods/endfield/fleet.js";
import { transcripts } from "./fixtures/waiting.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(HERE, "..", "skin", "mods", "endfield", "tools", "probe.mjs");
const HOUR = 3600000;
// The fixtures' clock starts here; a process that started later can't own what they launched.
const BEFORE_FIXTURES = Date.parse("2026-01-01T00:00:00Z");
const AFTER_FIXTURES = Date.parse("2026-03-01T00:00:00Z");

let dir;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "endfield-waiting-"));
  // Every transcript was last written an hour ago: nothing here is fresh.
  const old = new Date(Date.now() - HOUR);
  for (const [rel, text] of Object.entries(transcripts)) {
    const p = path.join(dir, "projects", rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
    fs.utimesSync(p, old, old);
  }
  fs.mkdirSync(path.join(dir, "sidecars"));
  for (const id of ["session-live", "session-dead"]) {
    fs.writeFileSync(path.join(dir, "sidecars", `${id}.json`), JSON.stringify({ terminal: id, transcript_path: path.join(dir, "projects", `${id}.jsonl`), updated_at: "1" }));
  }
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

// Runs the probe against a registry holding `owners`: [{sessionId, pid, startedAt}].
function probe(name, owners) {
  const registry = path.join(dir, `registry-${name}`);
  if (owners) {
    fs.mkdirSync(registry, { recursive: true });
    for (const o of owners) fs.writeFileSync(path.join(registry, `${o.pid}.json`), JSON.stringify({ status: "busy", ...o }));
  }
  const req = path.join(dir, `req-${name}.json`);
  fs.writeFileSync(req, JSON.stringify({ cmd: "sessions", cache: path.join(dir, `cache-${name}.json`), sidecars: path.join(dir, "sidecars"), registry,
    targets: [{ terminal: "session-live", cwd: null }, { terminal: "session-dead", cwd: null }] }));
  return JSON.parse(execFileSync("node", [PROBE, req], { encoding: "utf8" })).sessions;
}

const exited = () => spawnSync(process.execPath, ["-e", ""]).pid;
const owned = () => probe("owned", [
  { sessionId: "session-live", pid: process.pid, startedAt: BEFORE_FIXTURES },
  { sessionId: "session-dead", pid: exited(), startedAt: BEFORE_FIXTURES },
]);
const states = (run) => Object.fromEntries(run.tasks.map((t) => [t.id, t.state]));
const statuses = (session, parent = "working") => Object.fromEntries(session.subagents.map((s) => [s.id, runStatus({ ...s, live: session.live, now: Date.now() }, parent)]));

test("a sub-agent that ended its turn to wait on a render it started is waiting, an hour after its last write", () => {
  const live = owned()["session-live"];
  const sub = live.subagents.find((s) => s.id === "asubwaiting");
  assert.equal(sub.final, true);
  assert.deepEqual(states(sub), { brender: "running", bmonitor: "completed", bquick: "completed" },
    "the render has no end; the lint ended in this transcript, the monitor in the main one");
  assert.equal(statuses(live).asubwaiting, "waiting");
});

test("quiet sub-agents of a live session: a wait is waiting, work is working, an ended turn is done", () => {
  assert.deepEqual(statuses(owned()["session-live"]), {
    asubwaiting: "waiting",
    asubpolling: "waiting",
    asubtesting: "working",
    asubthinking: "working",
    asubfinished: "done",
    asubhandback: "done",
    asubstopped: "done",
  });
});

test("a turn that is over reads idle under an idle parent; one in flight keeps its status", () => {
  const under = statuses(owned()["session-live"], "idle");
  assert.deepEqual([under.asubfinished, under.asubhandback, under.asubwaiting, under.asubtesting], ["idle", "idle", "waiting", "working"]);
});

test("a task is read from the structured result that launched it, with its description and start", () => {
  const live = owned()["session-live"];
  const byId = Object.fromEntries(live.tasks.map((t) => [t.id, t]));
  assert.deepEqual(Object.values(byId).map((t) => [t.id, t.kind, t.description]), [
    ["asubwaiting", "agent", "Render promos"],
    ["asubresumed", "agent", "Review the stack"],
    ["bserver", "shell", "Start the preview server"],
    ["bfailed", "shell", "Build the site"],
    ["bstopped", "shell", "Watch the sources"],
  ]);
  assert.ok(byId.bserver.startedAt < byId.bfailed.startedAt, "starts are the tool calls' own times");
  const monitor = live.subagents.find((s) => s.id === "asubwaiting").tasks.find((t) => t.id === "bmonitor");
  assert.deepEqual([monitor.kind, monitor.description], ["monitor", "render log"]);
});

test("a task ends by a queued notification, a TaskStop or a notification typed in as a prompt, and runs again once resumed", () => {
  const live = owned()["session-live"];
  assert.deepEqual(states(live), { asubwaiting: "running", asubresumed: "running", bserver: "running", bfailed: "failed", bstopped: "stopped" });
  const failed = live.tasks.find((t) => t.id === "bfailed");
  assert.ok(failed.endedAt > failed.startedAt);
  assert.equal(live.tasks.find((t) => t.id === "bserver").endedAt, null);
});

test("the main session's turn has ended with background work in flight: it is waiting", () => {
  const live = owned()["session-live"];
  assert.equal(live.live, true);
  assert.equal(runStatus({ ...live, now: Date.now() }, "done"), "waiting");
});

test("a session whose process has exited is over, and so is all it left open", () => {
  const dead = owned()["session-dead"];
  assert.equal(dead.live, false);
  assert.deepEqual(states(dead), { borphan: "ended-with-session" });
  assert.equal(runStatus({ ...dead, now: Date.now() }, "done"), "done");
  assert.deepEqual(statuses(dead), { asuborphan: "done" }, "its sub-agent's tool call will never return");
});

test("a process that started after a task did not start it: the task ended with the earlier process", () => {
  const live = probe("restarted", [{ sessionId: "session-live", pid: process.pid, startedAt: AFTER_FIXTURES }])["session-live"];
  assert.equal(live.live, true);
  assert.deepEqual(states(live), { asubwaiting: "ended-with-session", asubresumed: "ended-with-session", bserver: "ended-with-session", bfailed: "failed", bstopped: "stopped" });
  assert.equal(runStatus({ ...live, now: Date.now() }, "done"), "done");
});

test("with no registry to ask, a run is alive only while its transcript is freshly written", () => {
  const live = probe("unknown", null)["session-live"];
  assert.equal(live.live, null);
  const sub = live.subagents.find((s) => s.id === "asubtesting");
  const now = Date.now();
  assert.equal(runStatus({ ...sub, live: null, mtime: now - 5000, now }, "working"), "working");
  assert.equal(runStatus({ ...sub, live: null, now }, "working"), "done", "an hour quiet and nothing says it lives");
});

test("an older probe's cached fold, which has no tasks, is folded again", () => {
  const cache = path.join(dir, "cache-stale.json");
  const transcript = path.join(dir, "projects", "session-live.jsonl");
  fs.writeFileSync(cache, JSON.stringify({ [transcript]: { to: fs.statSync(transcript).size, fold: { final: true, pending: null }, used: Date.now() } }));
  const live = probe("stale", [{ sessionId: "session-live", pid: process.pid, startedAt: BEFORE_FIXTURES }])["session-live"];
  assert.equal(live.tasks.length, 5);
});

const sub = (id, status, startedAt) => ({ id, status, startedAt, lastAt: startedAt });

test("a waiting sub-agent shows under its parent like a working one, and is not counted as earlier", () => {
  const view = subagentView([sub("a1", "done", 1), sub("a2", "waiting", 2), sub("a3", "working", 3), sub("a4", "idle", 4)], false);
  assert.deepEqual(view.shown.map((k) => k.id), ["a3", "a2"]);
  assert.equal(view.earlier, 2);
});

test("Waiting is a word and a still glyph, ranked between Generating and Finished, on a two-line row", () => {
  const st = statusOf("waiting");
  assert.equal(st.word, "Waiting");
  assert.equal(st.kind, "pause", "its glyph does not move: motion is kept for where work happens");
  assert.ok(rank("working") < rank("waiting") && rank("waiting") < rank("done"));
  assert.deepEqual([rowShape("waiting", 0), rowShape("waiting", 1)], ["lead", "child"]);
});
