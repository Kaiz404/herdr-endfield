import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runStatus, subagentView, statusOf, rank, rowShape, pollPace } from "../skin/mods/endfield/fleet.js";
import { transcripts } from "./fixtures/waiting.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(HERE, "..", "skin", "mods", "endfield", "tools", "probe.mjs");
// The fixtures' clock starts here; a process that started later can't own what they launched.
const BEFORE_FIXTURES = Date.parse("2026-01-01T00:00:00Z");
const AFTER_FIXTURES = Date.parse("2026-03-01T00:00:00Z");
const SESSIONS = ["session-live", "session-dead", "session-batch"];

let dir;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "endfield-waiting-"));
  // Every transcript was last written 90s ago: nothing here is fresh, yet a foreground shell call
  // that old is still within its time limit.
  const old = new Date(Date.now() - 90000);
  for (const [rel, text] of Object.entries(transcripts)) {
    const p = path.join(dir, "projects", rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
    fs.utimesSync(p, old, old);
  }
  fs.mkdirSync(path.join(dir, "sidecars"));
  for (const id of SESSIONS) {
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
    targets: SESSIONS.map((terminal) => ({ terminal, cwd: null })) }));
  return JSON.parse(execFileSync("node", [PROBE, req], { encoding: "utf8" })).sessions;
}

const exited = () => spawnSync(process.execPath, ["-e", ""]).pid;
const owned = () => probe("owned", [
  { sessionId: "session-live", pid: process.pid, startedAt: BEFORE_FIXTURES },
  { sessionId: "session-dead", pid: exited(), startedAt: BEFORE_FIXTURES },
  // The registry has one file per pid, so the second live session borrows the test runner's.
  { sessionId: "session-batch", pid: process.ppid, startedAt: BEFORE_FIXTURES },
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

test("one notification block that names several tasks ends each of them, and none it only quotes", () => {
  const batch = owned()["session-batch"];
  const { bone, btwo, bwatch, bkept, bbroke } = states(batch);
  assert.deepEqual({ bone, btwo, bwatch, bkept }, { bone: "stopped", btwo: "stopped", bwatch: "stopped", bkept: "running" },
    "bkept is named after the status, in the summary");
  assert.equal(bbroke, "failed", "a task ends once: the block names it again after it had failed");
  assert.equal(statuses(batch).asubbatched, "done", "both the shells it waited on have ended");
});

test("a monitor with a timeout ends at it; a persistent one, or one whose timeout is ahead, runs on", () => {
  const batch = owned()["session-batch"];
  const { bexpired, blong, bforever } = states(batch);
  assert.deepEqual({ bexpired, blong, bforever }, { bexpired: "timed-out", blong: "running", bforever: "running" });
  const expired = batch.tasks.find((t) => t.id === "bexpired");
  assert.equal(expired.endedAt - expired.startedAt, 600000, "it ended when its ten minutes were up");
  assert.equal(statuses(batch).asubexpired, "done", "the monitor it waited on has timed out");
  const ended = owned()["session-live"].subagents.find((s) => s.id === "asubwaiting").tasks.find((t) => t.id === "bmonitor");
  assert.equal(ended.state, "completed", "an end that was written wins over the timeout");
});

test("a shell call is a wait only when every command in it pauses or looks", () => {
  const { asubsleepbuild, asubreadloop, asubredirect, asubuntil, asubpwsh, asubpwshloop } = statuses(owned()["session-batch"]);
  assert.deepEqual({ asubsleepbuild, asubreadloop, asubredirect }, { asubsleepbuild: "working", asubreadloop: "working", asubredirect: "working" },
    "a sleep before a build, a loop that converts files and a suite writing to a task's output all do work");
  assert.deepEqual({ asubuntil, asubpwsh, asubpwshloop }, { asubuntil: "waiting", asubpwsh: "waiting", asubpwshloop: "waiting" });
});

// A registry file's procStart on Windows: the process's start as a FILETIME.
const procStart = (pid) => execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid}).StartTime.ToFileTimeUtc()`], { encoding: "utf8" }).trim();

test("a registry file whose pid now belongs to another process does not keep its session alive", { skip: process.platform !== "win32" && "process start times are read on Windows only" }, () => {
  const owner = { sessionId: "session-live", pid: process.pid, startedAt: BEFORE_FIXTURES };
  const reused = probe("reused", [{ ...owner, procStart: "1" }])["session-live"];
  assert.equal(reused.live, false, "this process did not start when the file says its session's did");
  assert.deepEqual(states(reused), { asubwaiting: "ended-with-session", asubresumed: "ended-with-session", bserver: "ended-with-session", bfailed: "failed", bstopped: "stopped" });
  assert.equal(probe("reused", null)["session-live"].live, false, "asked again within the minute, the answer is the same");
  assert.equal(probe("same", [{ ...owner, procStart: procStart(process.pid) }])["session-live"].live, true);
});

test("an end written to another transcript moves to the one that holds its task, and is still read from there", () => {
  owned();
  const again = owned()["session-live"];
  assert.equal(again.subagents.find((s) => s.id === "asubwaiting").tasks.find((t) => t.id === "bmonitor").state, "completed");
  const cache = JSON.parse(fs.readFileSync(path.join(dir, "cache-owned.json"), "utf8"));
  const folds = Object.values(cache).filter((c) => c.fold);
  assert.ok(folds.length > 10);
  assert.deepEqual(folds.flatMap((c) => Object.keys(c.fold.ends).filter((id) => !c.fold.tasks[id])), [], "no transcript keeps an end for a task it did not start");
});

test("the poller keeps a fast pace while a sub-agent works, a slow one while anything waits, and none otherwise", () => {
  const session = (waiting, ...subs) => ({ waiting, subagents: subs.map((status) => ({ status })) });
  assert.equal(pollPace([session(false, "done"), session(false, "waiting", "working")]), "fast");
  assert.equal(pollPace([session(false, "done", "waiting")]), "slow", "a waiting row clears only by a poll: its session may have crashed");
  assert.equal(pollPace([session(true)]), "slow");
  assert.equal(pollPace([session(false, "done", "idle"), session(false)]), null);
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

test("a foreground shell call quiet past its time limit no longer reads working", () => {
  const now = 10_000_000;
  const pending = { tool: "Bash", wait: false, limit: 120000 };
  assert.equal(runStatus({ live: true, now, mtime: now - 30000, pending, final: false }, "working"), "working");
  assert.equal(runStatus({ live: true, now, mtime: now - 15821000, pending, final: false }, "working"), "done");
  assert.equal(runStatus({ live: true, now, mtime: now - 15821000, pending: { ...pending, limit: null }, final: false }, "working"), "working");
});
