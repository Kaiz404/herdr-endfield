import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zoneAt, landing, collapsed, exitSide, workRect, dockPlan, anchorIn, movePlan, applied, machineOf, ARM, headerArmed, homeOf, whereIs, moveToast } from "../skin/mods/endfield/dock.js";

const R = { x: 100, y: 50, w: 400, h: 200 };
const at = (u, v) => ({ x: R.x + u * R.w, y: R.y + v * R.h });

test("the middle half each way is the centre, the rest the nearest edge, outside nothing", () => {
  assert.equal(zoneAt(at(0.5, 0.5), R), "centre");
  assert.equal(zoneAt(at(0.05, 0.5), R), "left");
  assert.equal(zoneAt(at(0.95, 0.4), R), "right");
  assert.equal(zoneAt(at(0.5, 0.1), R), "top");
  assert.equal(zoneAt(at(0.5, 0.9), R), "bottom");
  assert.equal(zoneAt(at(0.1, 0.2), R), "left", "a corner goes to the nearer edge");
  assert.equal(zoneAt(at(-0.01, 0.5), R), null);
  assert.equal(zoneAt(at(0.5, 1.2), R), null);
});

test("the slab takes the half it lands in, and grows from that edge", () => {
  assert.deepEqual(landing("left", R), { x: 100, y: 50, w: 200, h: 200 });
  assert.deepEqual(landing("right", R), { x: 300, y: 50, w: 200, h: 200 });
  assert.deepEqual(landing("centre", R), landing("right", R), "the centre splits right, never replaces");
  assert.deepEqual(landing("bottom", R), { x: 100, y: 150, w: 400, h: 100 });
  assert.deepEqual(collapsed("right", R), { x: 500, y: 50, w: 0, h: 200 });
  assert.deepEqual(collapsed("top", R), { x: 100, y: 50, w: 400, h: 0 });
  assert.deepEqual(collapsed("bottom", R), { x: 100, y: 250, w: 400, h: 0 });
});

test("leaving the list by its right edge is the way into the work area", () => {
  const list = { x: 0, y: 100, width: 248, height: 500 };
  assert.equal(exitSide({ x: 245, y: 300 }, list), "right");
  assert.equal(exitSide({ x: 120, y: 102 }, list), "top");
  assert.equal(exitSide({ x: 3, y: 300 }, list), "left");
});

test("the work area is the window right of the sidebar, between the tab strip and the status bar", () => {
  const tree = JSON.parse(readFileSync(new URL("../skin/layouts/endfield.json", import.meta.url), "utf8"));
  assert.deepEqual(workRect({ width: 1440, height: 900 }, 248, tree), { x: 256, y: 44, w: 1176, h: 804 });
  assert.equal(workRect({ width: 200, height: 900 }, 248, tree), null);
});

const chat = (extra = {}) => ({ terminal: "t7", pane: "p7", tab: "tabA", space: "s1", machine: null, linked: null, ...extra });
const anchor = { pane: "p1", tab: "tabB", space: "s2", machine: null };
const cmds = (plan) => plan.steps.map((s) => [s.cmd, s.args.place ?? s.args.target ?? s.args.pane ?? s.args.terminal]);

test("a chat in another tab is parked, the anchor focused, then kept beside it", () => {
  assert.deepEqual(cmds(dockPlan(chat(), anchor, "right")), [["terminal.park", "t7"], ["pane.focus", "p1"], ["terminal.keep", "right"]]);
  assert.deepEqual(cmds(dockPlan(chat(), anchor, "bottom")), [["terminal.park", "t7"], ["pane.focus", "p1"], ["terminal.keep", "down"]]);
  assert.deepEqual(cmds(dockPlan(chat(), anchor, "centre")), [["terminal.park", "t7"], ["pane.focus", "p1"], ["terminal.keep", "right"]]);
});

test("left and top keep it right or below, then swap it with the anchor", () => {
  const left = dockPlan(chat(), anchor, "left");
  assert.deepEqual(cmds(left), [["terminal.park", "t7"], ["pane.focus", "p1"], ["terminal.keep", "right"], ["pane.swap", "p1"]]);
  assert.equal(left.steps[3].own, true, "the swap moves the chat's new pane");
  assert.deepEqual(cmds(dockPlan(chat(), anchor, "top")).slice(2), [["terminal.keep", "down"], ["pane.swap", "p1"]]);
});

test("each step waits for what Herdr shows: the pane gone, the anchor focused, the chat shown", () => {
  assert.deepEqual(dockPlan(chat(), anchor, "left").steps.map((s) => s.wait), ["gone", "focused", "shown", null]);
});

test("a chat already in the anchor's tab trades places with it from every zone, and no zone promises a side", () => {
  const same = chat({ tab: "tabB", space: "s2" });
  for (const zone of ["left", "right", "top", "bottom", "centre"]) {
    const plan = dockPlan(same, anchor, zone);
    assert.deepEqual(plan.steps, [{ cmd: "pane.swap", args: { pane: "p7", target: "p1" }, wait: null }], zone);
    assert.equal(plan.label, "Trade places with the focused pane", zone);
    assert.equal(plan.whole, true, "the slab covers the work area, not a half the chat may not land in");
  }
});

test("a chat from another tab says the side it lands on, and its keep names the pane it must split", () => {
  const plan = dockPlan(chat(), anchor, "left");
  assert.equal(plan.label, "Left of the focused pane");
  assert.ok(!plan.whole);
  assert.equal(plan.steps.find((s) => s.cmd === "terminal.keep").beside, "p1");
  assert.equal(movePlan(chat(), SPACES, PANES, "s2").steps.find((s) => s.cmd === "terminal.keep").beside, "p3");
});

test("a squad header arms only after enough travel and a dwell over it", () => {
  const p0 = { x: 100, y: 300 };
  assert.equal(headerArmed(p0, { x: 100, y: 304 }, 0, 5000), false, "a 4px wobble never arms, however long it rests");
  assert.equal(headerArmed(p0, { x: 100, y: 300 + ARM.px }, 1000, 1000 + ARM.ms - 1), false, "far enough, but just arrived");
  assert.equal(headerArmed(p0, { x: 100, y: 300 + ARM.px }, 1000, 1000 + ARM.ms), true);
  assert.equal(headerArmed(p0, { x: 100 - ARM.px, y: 300 }, 1000, 2000), true, "travel counts in any direction");
  assert.equal(headerArmed(p0, { x: 100, y: 400 }, null, 2000), false, "not over a header");
  assert.equal(headerArmed(null, { x: 100, y: 400 }, 0, 2000), false);
});

test("a failed move goes back beside another pane of the tab the chat came from", () => {
  const panes = [...PANES, { pane: "p8", terminal: null, tab: "tabA", focused: false }, { pane: "p9", terminal: "t9", tab: "tabA", focused: false }];
  assert.equal(homeOf(panes, chat()), "p9", "a terminal's pane before a mod's");
  assert.equal(homeOf(panes.map((p) => ({ ...p, focused: p.pane === "p8" })), chat()), "p8", "the focused one first");
  assert.equal(homeOf(PANES, chat()), null, "alone in its tab: nowhere to go back to");
  assert.equal(homeOf(PANES, chat({ pane: null, tab: null })), null);
});

test("a move that ends where it was sent says nothing; anywhere else says where the chat is", () => {
  const c = { ...chat(), label: "CLAUDE" };
  assert.deepEqual(whereIs("t3", PANES, SPACES), { pane: "p3", tab: "tabC", name: "two", index: 2 });
  assert.equal(whereIs("t99", PANES, SPACES), null);
  assert.equal(moveToast(c, "tabC", whereIs("t3", PANES, SPACES)), null);
  const home = moveToast(c, "tabC", whereIs("t7", PANES, SPACES));
  assert.equal(home.level, "warning");
  assert.match(home.title, /Couldn't move CLAUDE t7/);
  assert.match(home.body, /keeps running in one, tab 1, where it came from/);
  const elsewhere = moveToast(c, "tabC", { pane: "p1", tab: "tabB", name: "two", index: 1 });
  assert.match(elsewhere.body, /keeps running in two, tab 1\./);
  assert.doesNotMatch(elsewhere.body, /where it came from/);
  const parked = moveToast(c, "tabC", null);
  assert.equal(parked.level, "error");
  assert.match(parked.title, /CLAUDE t7 has no pane/);
  assert.match(parked.body, /herdr-app do terminal\.keep --terminal t7/);
  assert.match(parked.body, /hc attach t7/);
  assert.match(moveToast(c, null, whereIs("t7", PANES, SPACES)).body, /where it came from/, "a recovery always says where it is");
});

test("a chat with no pane (an hc child) is kept without a park", () => {
  assert.deepEqual(cmds(dockPlan(chat({ pane: null }), anchor, "right")), [["pane.focus", "p1"], ["terminal.keep", "right"]]);
});

test("what can't land says why and has no steps", () => {
  assert.match(dockPlan(chat(), null, "right").problem, /Focus a pane/);
  assert.match(dockPlan(chat({ pane: "p1" }), anchor, "right").problem, /focused pane/);
  assert.match(dockPlan(chat({ terminal: "box/t7", machine: machineOf("box/t7") }), anchor, "right").problem, /another machine/);
  assert.match(dockPlan(chat({ linked: "t2" }), anchor, "right").problem, /Linked to t2/, "a link holds only within one squad");
  assert.ok(dockPlan(chat({ linked: "t2", space: "s2" }), anchor, "right").steps, "a linked chat may move within its squad");
  assert.match(dockPlan(chat(), anchor, null).problem, /work area/);
});

const SPACES = [
  { id: "s1", name: "one", machine: null, tabs: [{ id: "tabA", index: 1, active: true }] },
  { id: "s2", name: "two", machine: null, tabs: [{ id: "tabB", index: 1, active: false }, { id: "tabC", index: 2, active: true }] },
  { id: "s3", name: "three", machine: null, tabs: [{ id: "tabD", index: 1, active: true }] },
];
const PANES = [
  { pane: "p7", terminal: "t7", tab: "tabA", focused: true },
  { pane: "p1", terminal: "t1", tab: "tabB", focused: true },
  { pane: "p2", terminal: "t2", tab: "tabC", focused: false },
  { pane: "p3", terminal: "t3", tab: "tabC", focused: true },
];

test("a squad drop lands beside the focused pane of the tab that squad shows", () => {
  assert.deepEqual(anchorIn(SPACES, PANES, "s2"), { pane: "p3", tab: "tabC", space: "s2", machine: null });
  assert.deepEqual(cmds(movePlan(chat(), SPACES, PANES, "s2")), [["terminal.park", "t7"], ["pane.focus", "p3"], ["terminal.keep", "right"]]);
});

test("a squad drop on its own squad, or on one with no pane, does nothing and says why", () => {
  assert.match(movePlan(chat(), SPACES, PANES, "s1").problem, /Already in this squad/);
  assert.match(movePlan(chat(), SPACES, PANES, "s3").problem, /three has no pane to split/);
});

test("applied reads each wait off panes() and the focused pane", () => {
  const park = { wait: "gone" }, keep = { wait: "shown" }, focus = { wait: "focused", args: { pane: "p1" } };
  assert.equal(applied(park, "t7", PANES, "p7"), false);
  assert.equal(applied(park, "t7", PANES.slice(1), "p7"), true);
  assert.equal(applied(keep, "t7", PANES, null), true);
  assert.equal(applied(focus, "t7", PANES, "p7"), false);
  assert.equal(applied(focus, "t7", PANES, "p1"), true);
});
