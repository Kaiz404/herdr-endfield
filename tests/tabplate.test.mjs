import { test } from "node:test";
import assert from "node:assert/strict";
import { closePlan, closeAction, tabActions, paneOfTab } from "../skin/mods/endfield/tabplate.js";

const agent = (pane, tab, extra = {}) => ({ pane, terminal: `t${pane}`, tab, focused: false, program: { agent: true, name: "Claude Code" }, ...extra });
const shell = (pane, tab, extra = {}) => ({ pane, terminal: `t${pane}`, tab, focused: false, program: { shell: true, name: "pwsh" }, ...extra });
const ids = (list) => list.map((a) => a.id);

test("a tab of shells closes with Herdr's tab.close and says nothing", () => {
  const plan = closePlan("a", [shell("1", "a"), shell("2", "a"), agent("3", "b")]);
  assert.deepEqual(plan, { tab: "a", hide: [], close: [], closeTab: true, toast: null });
  assert.deepEqual(closeAction(plan).keys, ["tab.close"]);
  assert.equal(closeAction(plan).tip, "Close tab");
});

test("a tab with an agent never runs tab.close: agents are hidden, only the other panes close", () => {
  const plan = closePlan("a", [agent("1", "a"), shell("2", "a"), shell("3", "b")]);
  assert.equal(plan.closeTab, false, "tab.close would end the agent");
  assert.deepEqual(plan.hide, ["t1"]);
  assert.deepEqual(plan.close, ["2"], "the shell in this tab closes, the other tab's stays");
  assert.equal(plan.toast.title, "Claude Code hidden");
  assert.match(plan.toast.body, /keeps running.*Closed 1 other pane\./);
  const a = closeAction(plan);
  assert.deepEqual(a.keys, [], "the tooltip never names Herdr's tab.close key, which ends agents");
  assert.equal(a.tip, "Close (agents keep running, the rest end)");
});

test("an agent Herdr lists but reports as a shell is hidden, never closed", () => {
  const plan = closePlan("a", [shell("1", "a", { listed: true })]);
  assert.equal(plan.closeTab, false);
  assert.deepEqual(plan.hide, ["t1"]);
  assert.deepEqual(plan.close, []);
});

test("a tab of only agents hides them all and closes nothing", () => {
  const plan = closePlan("a", [agent("1", "a"), agent("2", "a")]);
  assert.deepEqual(plan.hide, ["t1", "t2"]);
  assert.deepEqual(plan.close, []);
  assert.equal(plan.toast.title, "2 agents hidden");
  assert.doesNotMatch(plan.toast.body, /Closed/);
  assert.equal(closeAction(plan).tip, "Close (agents keep running)");
  assert.ok(!closeAction(plan).danger, "hiding ends nothing");
});

test("the menu works on the tab's focused pane, Rename first and Close last", () => {
  const panes = [shell("1", "a"), agent("2", "a", { focused: true })];
  const m = tabActions({ id: "a", space: "s1" }, panes);
  assert.equal(m.pane.pane, "2");
  assert.deepEqual(ids(m.actions), ["rename", "split", "down", "zoom", "pop"]);
  assert.deepEqual(m.actions[0].run, { cmd: "tab.rename", args: { id: "a" } });
  assert.deepEqual(m.actions.find((a) => a.id === "zoom").run, { cmd: "pane.zoom", args: { pane: "2" } });
  assert.ok(!m.actions.some((a) => a.id === "hide" || a.run?.cmd === "pane.close"), "the pane's own ✕ is not in the tab menu");
  assert.equal(m.close.id, "close");
});

test("a tab of one pane offers no Pop out, and its Zoom is greyed", () => {
  const m = tabActions({ id: "a", space: "s1" }, [agent("1", "a")]);
  assert.ok(!m.actions.some((a) => a.id === "pop"));
  assert.ok(m.actions.find((a) => a.id === "zoom").why);
});

test("the focused pane is the tab's, falling back to its first pane", () => {
  assert.equal(paneOfTab("a", [shell("1", "a"), shell("2", "a")]).pane, "1");
  assert.equal(paneOfTab("z", [shell("1", "a")]), null);
});

const SPACES = [
  { id: "s1", name: "one", machine: null, tabs: [{ id: "a", index: 1, active: true }] },
  { id: "s2", name: "two", machine: null, tabs: [{ id: "b", index: 1, active: true }] },
  { id: "s3", name: "three", machine: null, tabs: [{ id: "c", index: 1, active: true }] },
];

test("Move to squad lists every other squad, numbered, greying one it cannot reach", () => {
  const panes = [agent("1", "a", { focused: true }), shell("2", "b", { focused: true })];
  const chat = { terminal: "t1", pane: "1", tab: "a", space: "s1", machine: null, linked: null };
  const m = tabActions({ id: "a", space: "s1" }, panes, { spaces: SPACES, chat });
  assert.deepEqual(m.moves.map((x) => [x.tip, x.more.space, x.ask]), [["02  two", "s2", "move"], ["03  three", "s3", "move"]]);
  assert.equal(m.moves[0].why, null);
  assert.match(m.moves[1].why, /no pane to split/);
});

test("a mod pane has no terminal, so its tab offers no move", () => {
  const m = tabActions({ id: "a", space: "s1" }, [{ pane: "9", terminal: null, tab: "a", focused: true, program: null }], { spaces: SPACES, chat: null });
  assert.deepEqual(m.moves, []);
});
