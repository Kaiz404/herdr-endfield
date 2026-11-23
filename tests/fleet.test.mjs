import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRoster, BY, PINNED, subNumbers, subagentView, rowMeta, rowShape } from "../skin/mods/endfield/fleet.js";

// Every claude agent is PERLICA unless spares are free; a repeat takes a spare, then a number.
const identity = (spares = []) => ({
  resolve: (program) => ({ operator: program.key === "claude" ? "perlica" : null, name: program.key === "claude" ? "Perlica" : program.name, pinned: false }),
  as: (slug, program) => ({ operator: slug, name: slug[0].toUpperCase() + slug.slice(1), pinned: false, program }),
  spares: () => spares,
});
const claude = { key: "claude", name: "Claude Code" };
const codex = { key: "codex", name: "Codex" };
const spaces = [{ id: "s1", name: "one" }, { id: "s2", name: "two" }, { id: "s3", name: "three" }];
let seq = 0;
const agent = (address, space, status, extra = {}) => ({ address, program: claude, status, title: address, space, space_name: space, tab: `${space}-tab`, tab_index: 1, pane: `p-${address}`, seq: ++seq, pinned: false, focused: false, ...extra });
const term = (address, created, parent = null, extra = {}) => ({ address, created_ms: created, parent, state: "live", program: claude, ...extra });
const build = (listed, terms, opts = {}) => buildRoster({ listed, terms, spaces, identity: identity(opts.spares), sort: opts.sort ?? BY.priority });

test("callsigns follow creation order, so a newcomer listed first never takes one", () => {
  const terms = [term("t1", 100), term("t2", 200), term("t3", 300)];
  const before = build([agent("t1", "s1", "idle"), agent("t2", "s1", "idle")], terms);
  const after = build([agent("t3", "s1", "blocked"), agent("t1", "s1", "idle"), agent("t2", "s1", "idle")], terms);
  assert.equal(before.all.get("t2").ident.callsign, "PERLICA·2");
  assert.equal(after.all.get("t1").ident.callsign, "PERLICA");
  assert.equal(after.all.get("t2").ident.callsign, "PERLICA·2");
  assert.equal(after.all.get("t3").ident.callsign, "PERLICA·3");
});

test("a repeated operator takes a spare before it takes a number", () => {
  const R = build([agent("t1", "s1", "idle"), agent("t2", "s1", "idle"), agent("t3", "s1", "idle")], [term("t1", 1), term("t2", 2), term("t3", 3)], { spares: ["ember"] });
  assert.deepEqual(["t1", "t2", "t3"].map((a) => R.all.get(a).ident.callsign), ["PERLICA", "EMBER", "PERLICA·2"]);
});

test("pinned agents lead the whole list and agent.next, ahead of every space", () => {
  const listed = [agent("t1", "s1", "blocked"), agent("t2", "s2", "idle"), agent("t3", "s3", "idle", { pinned: true })];
  const R = build(listed, [term("t1", 1), term("t2", 2), term("t3", 3)]);
  assert.equal(R.squads[0].id, PINNED);
  assert.deepEqual(R.flat.map((m) => m.address), ["t3", "t1", "t2"]);
  assert.ok(!R.squads.some((q) => q.id === "s3"), "a space whose only agent is pinned has no squad of its own");
});

test("a pinned agent keeps its children under it", () => {
  const listed = [agent("t1", "s1", "idle", { pinned: true }), agent("t2", "s2", "idle")];
  const R = build(listed, [term("t1", 1), term("t2", 2), term("t9", 9, "t1", { program: codex, status: "working" })]);
  assert.deepEqual(R.flat.map((m) => [m.address, m.depth]), [["t1", 0], ["t9", 1], ["t2", 0]]);
});

test("priority ranks a parent by its most urgent child", () => {
  const listed = [agent("t1", "s1", "idle"), agent("t2", "s1", "working")];
  const R = build(listed, [term("t1", 1), term("t2", 2), term("t5", 5, "t1", { status: "error" })]);
  assert.deepEqual(R.flat.map((m) => m.address), ["t1", "t5", "t2"], "t1's child is blocked (error), so t1 outranks a working t2");
});

test("tab order ignores urgency but still keeps trees whole", () => {
  const listed = [agent("t2", "s1", "blocked", { tab_index: 2 }), agent("t1", "s1", "idle", { tab_index: 1 })];
  const R = build(listed, [term("t1", 1), term("t2", 2), term("t7", 7, "t2")], { sort: BY.order });
  assert.deepEqual(R.flat.map((m) => m.address), ["t1", "t2", "t7"]);
});

test("a session's sub-agents are numbered among those shown, not every one it ever started", () => {
  const shown = ["a27", "a28", "a29", "a30"];
  const first = subNumbers(new Map(), shown);
  assert.deepEqual(shown.map((id) => first.get(id)), [1, 2, 3, 4], "30 started, 4 shown: ARDELIA to ARDELIA·4, never ARDELIA·30");
  const next = subNumbers(first, ["a28", "a30", "a31"]);
  assert.deepEqual(["a28", "a30"].map((id) => next.get(id)), [2, 4], "a sub-agent still shown keeps its number");
  assert.equal(next.get("a31"), 1, "a newcomer takes the lowest number no shown sub-agent holds");
});

const sub = (id, status, startedAt, lastAt = startedAt) => ({ id, status, startedAt, lastAt });

test("a parent shows its working sub-agents newest first, and offers the rest as earlier", () => {
  const subs = [sub("a1", "done", 1), sub("a2", "working", 2), sub("a3", "idle", 3), sub("a4", "done", 4),
    sub("a5", "working", 5), sub("a6", "done", 6), sub("a7", "done", 7), sub("a8", "done", 8)];
  const folded = subagentView(subs, false);
  assert.deepEqual(folded.shown.map((k) => k.id), ["a5", "a2"], "eight sub-agents, two working: only those two, newest first");
  assert.equal(folded.earlier, 6);
  const open = subagentView(subs, true);
  assert.deepEqual(open.shown.map((k) => k.id), ["a8", "a7", "a6", "a5", "a4", "a3", "a2", "a1"], "open: every one, newest first, no cap");
  assert.equal(open.earlier, 6, "the toggle stays so it can fold back");
});

test("newest means started last, so a busy old sub-agent doesn't jump ahead of a newer one", () => {
  const view = subagentView([sub("old", "working", 1, 99), sub("new", "working", 2, 3)], false);
  assert.deepEqual(view.shown.map((k) => k.id), ["new", "old"]);
});

test("with none working only the toggle is offered; with none finished there is no toggle", () => {
  assert.deepEqual(subagentView([sub("a1", "done", 1), sub("a2", "idle", 2)], false), { shown: [], earlier: 2 });
  const busy = subagentView([sub("a1", "working", 1)], false);
  assert.deepEqual([busy.shown.map((k) => k.id), busy.earlier], [["a1"], 0]);
});

const MIN = 60000;

test("a generating sub-agent's meta reads elapsed, model, effort and context, with no address or tool count", () => {
  const meta = rowMeta({ startedAt: 1, lastAt: 3 * MIN, live: true, model: "Opus 5.5", effort: "high", used: 151000, program: "Claude Code" }, 1 + 12 * MIN);
  assert.equal(meta, "12m · Opus 5.5 · high · 151K ctx");
});

test("a finished run's elapsed stops at its last write, not now", () => {
  assert.equal(rowMeta({ startedAt: 1, lastAt: 1 + 65 * MIN, live: false }, 500 * MIN), "1h 05m");
  assert.equal(rowMeta({ startedAt: 1, lastAt: 20000, live: false }, 500 * MIN), "<1m");
});

test("what isn't known is left out, and an agent with no session shows its program", () => {
  assert.equal(rowMeta({ program: "Codex" }, 0), "Codex");
  assert.equal(rowMeta({ model: "Opus 5.5", used: 0, program: "Claude Code" }, 0), "Opus 5.5", "no assistant turn yet: no context part");
  assert.equal(rowMeta({ startedAt: 5, live: true, model: "Opus 5.5" }, 5 + 2 * MIN), "2m · Opus 5.5");
});

test("only idle rows fold to one line; working, blocked, done and error keep their two-line height", () => {
  assert.deepEqual([rowShape("idle", 0), rowShape("idle", 2)], ["idle", "idle"]);
  assert.deepEqual(["working", "blocked", "done", "error"].map((s) => [rowShape(s, 0), rowShape(s, 1)]),
    [["lead", "child"], ["lead", "child"], ["lead", "child"], ["lead", "child"]]);
});

test("a sub-agent whose transcript has no timestamp yet sorts by its last write", () => {
  const view = subagentView([sub("old", "done", 10), sub("new", "done", null, 20)], true);
  assert.deepEqual(view.shown.map((k) => k.id), ["new", "old"]);
});
