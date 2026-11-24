import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRoster, BY, PINNED, subagentView, rowMeta, rowShape, subLabel, programLabel, siblingLabels, railSpans } from "../skin/mods/endfield/fleet.js";
import { identityOf } from "./identity.mjs";

// Every claude agent with no model is PERLICA; a repeat takes a spare, then a number.
const identity = (spares = []) => identityOf({ defaults: { claude: "perlica" }, operators: ["perlica", "ember"], spares });
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
  assert.equal(before.all.get("t2").ident.callsign, "PERLICA-2");
  assert.equal(after.all.get("t1").ident.callsign, "PERLICA");
  assert.equal(after.all.get("t2").ident.callsign, "PERLICA-2");
  assert.equal(after.all.get("t3").ident.callsign, "PERLICA-3");
});

test("a repeated operator takes a spare before it takes a number", () => {
  const R = build([agent("t1", "s1", "idle"), agent("t2", "s1", "idle"), agent("t3", "s1", "idle")], [term("t1", 1), term("t2", 2), term("t3", 3)], { spares: ["ember"] });
  assert.deepEqual(["t1", "t2", "t3"].map((a) => R.all.get(a).ident.callsign), ["PERLICA", "EMBER", "PERLICA-2"]);
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

const sub = (id, status, startedAt, lastAt = startedAt) => ({ id, status, startedAt, lastAt });

const ids = (ks) => ks.map((k) => k.id);

test("a parent shows its working sub-agents newest first, and offers the rest as earlier", () => {
  const subs = [sub("a1", "done", 1), sub("a2", "working", 2), sub("a3", "idle", 3), sub("a4", "done", 4),
    sub("a5", "working", 5), sub("a6", "done", 6), sub("a7", "done", 7), sub("a8", "done", 8)];
  const folded = subagentView(subs, false);
  assert.deepEqual(ids(folded.active), ["a5", "a2"], "eight sub-agents, two working: only those two, newest first");
  assert.deepEqual(folded.finished, [], "folded: none of the finished ones");
  assert.equal(folded.earlier, 6);
  const open = subagentView(subs, true);
  assert.deepEqual(ids(open.active), ["a5", "a2"], "open: the active ones still come first, above the toggle");
  assert.deepEqual(ids(open.finished), ["a8", "a7", "a6", "a4", "a3", "a1"], "then every finished one, newest first, no cap");
  assert.equal(open.earlier, 6, "the toggle stays so it can fold back");
});

test("newest means started last, so a busy old sub-agent doesn't jump ahead of a newer one", () => {
  const view = subagentView([sub("old", "working", 1, 99), sub("new", "working", 2, 3)], false);
  assert.deepEqual(ids(view.active), ["new", "old"]);
});

test("with none working only the toggle is offered; with none finished there is no toggle", () => {
  assert.deepEqual(subagentView([sub("a1", "done", 1), sub("a2", "idle", 2)], false), { active: [], finished: [], earlier: 2 });
  const busy = subagentView([sub("a1", "working", 1)], true);
  assert.deepEqual([ids(busy.active), busy.finished, busy.earlier], [["a1"], [], 0]);
});

const MIN = 60000;

test("a generating run: model and effort beside the callsign, elapsed to now, and an 8-block gauge with its numbers", () => {
  const meta = rowMeta({ startedAt: 1, lastAt: 3 * MIN, live: true, model: "Opus 5.5", effort: "medium", used: 157000, total: 1000000, program: "Claude Code" }, 1 + 67 * MIN, 8);
  assert.deepEqual(meta, { model: "Opus 5.5", effort: "med", time: "1h07", ticking: false, running: 0, gauge: { lit: 1, hot: false, tip: "157K / 1M, 16%" } });
});

test("elapsed reads seconds, minutes, hours with minutes, then whole hours and days", () => {
  const at = (ms) => rowMeta({ startedAt: 1, lastAt: 1 + ms }, 0, 8).time;
  assert.deepEqual([0, 42500, 59999, MIN, 27 * MIN, 60 * MIN, 67 * MIN, 599 * MIN, 12 * 60 * MIN, 3 * 24 * 60 * MIN].map(at),
    ["0s", "42s", "59s", "1m", "27m", "1h00", "1h07", "9h59", "12h", "3d"]);
});

test("only a generating run under a minute ticks each second", () => {
  const tick = (live, ms) => rowMeta({ startedAt: 1, lastAt: 1 + ms, live }, 1 + ms, 8).ticking;
  assert.deepEqual([tick(true, 42000), tick(true, MIN), tick(false, 42000)], [true, false, false],
    "a finished run's seconds never change, and past a minute the slower refresh keeps up");
  assert.equal(rowMeta({ live: true }, 5, 8).ticking, false, "no start time: no clock to tick");
});

test("a finished run's elapsed stops at its last write, not now", () => {
  assert.equal(rowMeta({ startedAt: 1, lastAt: 1 + 65 * MIN, live: false }, 500 * MIN, 8).time, "1h05");
});

test("past 75% of the window the gauge runs hot; a context over the window fills every block", () => {
  const g = (used, total) => rowMeta({ used, total }, 0, 8).gauge;
  assert.deepEqual([g(149000, 200000).hot, g(150000, 200000).hot], [false, true]);
  assert.equal(g(250000, 200000).lit, 8);
  assert.equal(g(100000, 200000).lit, 4);
});

test("with no total the window is inferred: 1M for a [1m] model or a context past 200K, else 200K", () => {
  assert.equal(rowMeta({ used: 50000 }, 0, 8).gauge.tip, "50K / 200K, 25%");
  assert.equal(rowMeta({ used: 50000, modelId: "claude-opus-5-5[1m]" }, 0, 8).gauge.tip, "50K / 1M, 5%");
  assert.equal(rowMeta({ used: 300000 }, 0, 8).gauge.tip, "300K / 1M, 30%");
});

test("what isn't known is null or left out; the program is the row's label, not its model", () => {
  assert.deepEqual(rowMeta({ program: "Codex" }, 0, 8), { model: null, effort: null, time: null, ticking: false, running: 0, gauge: null });
  assert.equal(rowMeta({ model: "Opus 5.5", used: 0 }, 0, 8).gauge, null, "no assistant turn yet: no gauge");
  assert.deepEqual(["low", "medium", "high", "xhigh", "max", "ultra"].map((effort) => rowMeta({ model: "M", effort }, 0, 8).effort),
    ["low", "med", "high", "xhigh", "max", "ultra"]);
});

test("only idle rows fold to one line; working, blocked, done and error keep their two-line height", () => {
  assert.deepEqual([rowShape("idle", 0), rowShape("idle", 2)], ["idle", "idle"]);
  assert.deepEqual(["working", "blocked", "done", "error"].map((s) => [rowShape(s, 0), rowShape(s, 1)]),
    [["lead", "child"], ["lead", "child"], ["lead", "child"], ["lead", "child"]]);
});

test("a sub-agent whose transcript has no timestamp yet sorts by its last write", () => {
  const view = subagentView([sub("old", "done", 10), sub("new", "done", null, 20)], true);
  assert.deepEqual(ids(view.finished), ["new", "old"]);
});

test("a sub-agent row reads its Claude Code type without the plugin prefix, else sub-agent", () => {
  assert.deepEqual(["pstack:poteto-agent", "general-purpose", "Explore", "a:b:deep", null, "", " "].map(subLabel),
    ["poteto-agent", "general-purpose", "Explore", "deep", "sub-agent", "sub-agent", "sub-agent"]);
});

test("a lead row reads its program in capitals", () => {
  assert.deepEqual([claude, codex, { key: "cursor", name: "Cursor" }, { name: "pi" }, null].map(programLabel), ["CLAUDE", "CODEX", "CURSOR", "PI", "AGENT"]);
});

test("siblings get a number only when two would read the same row, the earliest keeping the bare label", () => {
  const named = siblingLabels([
    { id: "c", label: "Explore", title: "find the bug", at: 3 },
    { id: "a", label: "Explore", title: "find the bug", at: 1 },
    { id: "b", label: "Explore", title: "read the docs", at: 2 },
    { id: "d", label: "general-purpose", title: "find the bug", at: 4 },
    { id: "e", label: "Explore", title: "find the bug", at: 5 },
  ]);
  assert.deepEqual(Object.fromEntries(named), { a: "Explore", b: "Explore", c: "Explore-2", d: "general-purpose", e: "Explore-3" });
  assert.ok(![...named.values()].some((l) => /[\u00b7\u2022]/.test(l)), "no dot divider in a name");
});

test("the roster labels each pane agent by its program, never numbered (its task line tells it apart)", () => {
  const listed = [agent("t1", "s1", "idle", { title: "fix" }), agent("t2", "s1", "idle", { title: "fix" }), agent("t3", "s2", "idle", { title: "fix" }), agent("t4", "s1", "working", { title: "ship", program: codex })];
  const R = build(listed, [term("t1", 1), term("t2", 2), term("t3", 3), term("t4", 4), term("t9", 9, "t1", { title: "fix" })]);
  const label = (a) => R.all.get(a).label;
  assert.deepEqual(["t1", "t2", "t3", "t4", "t9"].map(label), ["CLAUDE", "CLAUDE", "CLAUDE", "CODEX", "CLAUDE"],
    "a number keyed on a live title would come and go with its spinner");
  assert.deepEqual(["t1", "t2"].map((a) => R.all.get(a).ident.callsign), ["PERLICA", "PERLICA-2"], "the callsign is still cast for the card and portrait");
});

test("an archived chat's leftover shell stays out; an agent started there, or a new terminal at its address, shows", () => {
  const shell = { key: "shell", name: "pwsh", agent: false, shell: true };
  const live = { ...claude, agent: true };
  const hidden = [{ life: "t1@100", program: "claude" }];
  const shown = (listed, terms) => buildRoster({ listed, terms, spaces, identity: identity(), hidden }).flat.map((m) => m.address);
  assert.deepEqual(shown([agent("t1", "s1", "idle", { program: shell }), agent("t2", "s1", "idle")], [term("t1", 100, null, { program: shell }), term("t2", 200)]), ["t2"]);
  assert.deepEqual(shown([agent("t1", "s1", "idle", { program: live })], [term("t1", 100, null, { program: live })]), ["t1"], "a new agent in the same shell tab");
  assert.deepEqual(shown([agent("t1", "s1", "idle", { program: shell })], [term("t1", 900, null, { program: shell })]), ["t1"], "a new terminal at the address");
});

test("a link rail spans its group's rows and the rows under them, and ends where the group does", () => {
  const rows = [
    { depth: 0, h: 34 },
    { depth: 0, h: 56, group: "a" }, { depth: 1, h: 50 }, { depth: 1, h: 26 },
    { depth: 0, h: 56, group: "a" }, { depth: 1, h: 50 },
    { depth: 0, h: 56, group: "c" }, { depth: 0, h: 34, group: "c" },
    { depth: 0, h: 34 }, { depth: 1, h: 50 },
  ];
  assert.deepEqual(railSpans(rows), [
    { group: "a", top: 34, h: 238, rows: [1, 2, 3, 4, 5] },
    { group: "c", top: 272, h: 90, rows: [6, 7] },
  ], "two groups back to back are two rails, and an ungrouped row's sub-agent joins none");
  assert.deepEqual(railSpans([{ depth: 0, h: 34 }, { depth: 1, h: 50 }]), []);
});
