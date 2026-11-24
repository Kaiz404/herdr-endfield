import { test } from "node:test";
import assert from "node:assert/strict";
import { taskView, tasksOf, memberStatus, buildRoster, rowMeta, rank } from "../skin/mods/endfield/fleet.js";
import { identityOf } from "./identity.mjs";

const NOW = Date.parse("2026-02-01T12:00:00Z");
const S = 1000, MIN = 60 * S;
const task = (id, state, startedAgo, endedAgo = null, extra = {}) => ({
  id, kind: "shell", description: `task ${id}`, startedAt: NOW - startedAgo, endedAt: endedAgo == null ? null : NOW - endedAgo, state, ...extra,
});

test("running tasks come first, newest started first, with their elapsed time", () => {
  const v = taskView([task("a", "running", 42 * S), task("b", "completed", 90 * MIN, 30 * MIN), task("c", "running", 67 * MIN)], NOW);
  assert.deepEqual(v.running.map((t) => [t.id, t.time, t.end]), [["a", "42s", null], ["c", "1h07", null]]);
  assert.deepEqual(v.finished.map((t) => [t.id, t.time]), [["b", "1h00"]]);
});

test("finished tasks fold newest ended first, each named by its end", () => {
  const v = taskView([
    task("old", "failed", 20 * MIN, 19 * MIN),
    task("new", "timed-out", 10 * MIN, 1 * MIN),
    task("mid", "killed", 10 * MIN, 5 * MIN),
    task("st", "stopped", 10 * MIN, 6 * MIN),
    task("ok", "completed", 10 * MIN, 7 * MIN),
    task("gone", "ended-with-session", 10 * MIN, 8 * MIN),
  ], NOW);
  assert.deepEqual(v.running, []);
  assert.deepEqual(v.finished.map((t) => [t.id, t.end.word]),
    [["new", "timed out"], ["mid", "killed"], ["st", "stopped"], ["ok", "done"], ["gone", "ended"], ["old", "failed"]]);
  assert.equal(v.finished.at(-1).end.hue, "error");
  assert.equal(v.finished[0].end.hue, undefined);
});

test("a task seen twice (a resumed agent) shows once; one without a description reads as its kind", () => {
  const v = taskView([task("a", "running", 5 * S, null, { kind: "agent", description: null }), task("a", "completed", 5 * S, 1 * S)], NOW);
  assert.equal(v.running.length + v.finished.length, 1);
  assert.equal(v.running[0].description, "agent");
});

test("a finished task with no end time has no duration", () => {
  assert.equal(taskView([task("x", "completed", 5 * MIN, null)], NOW).finished[0].time, null);
});

test("a session's tasks include the ones its sub-agents started", () => {
  const s = { tasks: [task("main", "running", S)], subagents: [{ tasks: [task("sub", "running", 2 * S)] }, { tasks: [] }] };
  assert.deepEqual(tasksOf(s).map((t) => t.id), ["main", "sub"]);
  assert.deepEqual(tasksOf(null), []);
  assert.deepEqual(tasksOf({ tasks: [task("k", "running", S)] }).map((t) => t.id), ["k"]);
});

test("a Squads row counts the background tasks running", () => {
  const meta = rowMeta({ tasks: [task("a", "running", S), task("b", "running", S), task("c", "failed", S, 0)] }, NOW, 10);
  assert.equal(meta.running, 2);
  assert.equal(rowMeta({}, NOW, 10).running, 0);
});

test("idle or done with a session waiting on background work reads waiting; other statuses stay Herdr's", () => {
  assert.equal(memberStatus("idle", true), "waiting");
  assert.equal(memberStatus("done", true), "waiting");
  for (const s of ["working", "blocked", "error"]) assert.equal(memberStatus(s, true), s);
  for (const s of ["idle", "done", "working"]) assert.equal(memberStatus(s, false), s);
  // Waiting sorts below Finished and above Generating in agent.next and the priority sort.
  assert.ok(rank("done") > rank("waiting") && rank("waiting") > rank("working"));
});

const claude = { key: "claude", name: "Claude Code" };
const agent = (address, status, seq) => ({ address, program: claude, status, title: address, space: "s1", space_name: "one", tab: "t", tab_index: 1, pane: `p-${address}`, seq, pinned: false, focused: false });
const roster = (waiting) => buildRoster({
  listed: [agent("1", "done", 1), agent("2", "idle", 2), agent("3", "working", 3)],
  terms: ["1", "2", "3"].map((a, i) => ({ address: a, created_ms: i, parent: null, state: "live", program: claude })),
  spaces: [{ id: "s1", name: "one" }],
  identity: identityOf({ defaults: { claude: "perlica" }, operators: ["perlica"], spares: [] }),
  waiting,
});

test("the roster maps a waiting session's agent to waiting and keeps Herdr's own status for delivery", () => {
  const R = roster(["1", "2", "3"]);
  assert.deepEqual(["1", "2", "3"].map((a) => [R.all.get(a).status, R.all.get(a).herdrStatus]),
    [["waiting", "done"], ["waiting", "idle"], ["working", "working"]]);
  assert.deepEqual(["1", "2"].map((a) => R.all.get(a).urgency), [rank("waiting"), rank("waiting")]);
  const plain = roster([]);
  assert.deepEqual(["1", "2"].map((a) => plain.all.get(a).status), ["done", "idle"]);
});
