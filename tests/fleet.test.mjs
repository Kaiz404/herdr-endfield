import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRoster, BY, PINNED, subNumbers } from "../skin/mods/endfield/fleet.js";

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
