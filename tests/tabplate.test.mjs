import { test } from "node:test";
import assert from "node:assert/strict";
import { closePlan, closeAction, closeToast, runClose, parked, tabActions, paneOfTab } from "../skin/mods/endfield/tabplate.js";
import { tabTerminals } from "../skin/mods/endfield/archive.js";

const CLAUDE = { agent: true, name: "Claude Code", key: "claude" };
const PWSH = { shell: true, name: "pwsh", key: "pwsh" };
const agent = (pane, tab, extra = {}) => ({ pane, terminal: `t${pane}`, tab, focused: false, program: CLAUDE, ...extra });
const shell = (pane, tab, extra = {}) => ({ pane, terminal: `t${pane}`, tab, focused: false, program: PWSH, ...extra });
const term = (address, extra = {}) => ({ address, state: "live", created_ms: 1, parent: null, labels: {}, program: PWSH, ...extra });
const ids = (list) => list.map((a) => a.id);

/** A World where every pane's terminal is listed live with its pane's program, plus `more` terminals without a pane. */
const world = (panes, more = [], listed = []) => ({
  panes, listed,
  terms: [...panes.filter((p) => p.terminal).map((p) => term(p.terminal, { program: p.program, labels: { "herdr.tab": p.tab } })), ...more],
});

test("a tab of shells closes with Herdr's tab.close", () => {
  const plan = closePlan("a", world([shell("1", "a"), shell("2", "a"), agent("3", "b")]));
  assert.deepEqual(plan, { tab: "a", hide: [], close: ["1", "2"], left: [], why: null, closeTab: true });
  assert.deepEqual(closeAction(plan).keys, ["tab.close"]);
  assert.equal(closeAction(plan).tip, "Close tab");
});

test("a tab with an agent never runs tab.close: agents are hidden, only the other panes close", () => {
  const plan = closePlan("a", world([agent("1", "a"), shell("2", "a"), shell("3", "b")]));
  assert.equal(plan.closeTab, false, "tab.close would end the agent");
  assert.deepEqual(plan.hide, [{ terminal: "t1", name: "Claude Code" }]);
  assert.deepEqual(plan.close, ["2"], "the shell in this tab closes, the other tab's stays");
  const a = closeAction(plan);
  assert.deepEqual(a.keys, [], "the tooltip never names Herdr's tab.close key, which ends agents");
  assert.equal(a.tip, "Close (agents keep running, the rest end)");
});

test("an agent Herdr lists but reports as a shell is hidden, never closed", () => {
  const plan = closePlan("a", world([shell("1", "a", { listed: true })]));
  assert.equal(plan.closeTab, false);
  assert.deepEqual(plan.hide.map((h) => h.terminal), ["t1"]);
  assert.deepEqual(plan.close, []);
});

test("a tab of only agents hides them all and closes nothing", () => {
  const plan = closePlan("a", world([agent("1", "a"), agent("2", "a")]));
  assert.deepEqual(plan.hide.map((h) => h.terminal), ["t1", "t2"]);
  assert.deepEqual(plan.close, []);
  assert.equal(closeAction(plan).tip, "Close (agents keep running)");
  assert.ok(!closeAction(plan).danger, "hiding ends nothing");
});

test("a tab of shells that a paneless agent belongs to by its herdr.tab label never gets tab.close, and keeps its panes", () => {
  const sub = term("t9", { program: CLAUDE, labels: { "herdr.tab": "a" } });
  const plan = closePlan("a", world([shell("1", "a"), shell("2", "a")], [sub]));
  assert.equal(plan.closeTab, false, "tab.close ends every terminal in the tab, the paneless agent too");
  assert.deepEqual(plan.close, [], "closing the tab's last pane closes the tab");
  assert.deepEqual(plan.left, ["1", "2"]);
  assert.equal(plan.why, "hosts");
  assert.deepEqual(closeAction(plan).keys, []);
});

test("a label on another machine's id still counts: the list form and a machine prefix are read", () => {
  const sub = term("t9", { program: CLAUDE, labels: ["herdr.space=s1", "herdr.tab=a"] });
  assert.equal(closePlan("box/a", world([shell("1", "box/a")], [sub])).closeTab, false);
});

test("a shell an agent runs under stays open, and the tab's other shell closes", () => {
  const child = term("t9", { program: CLAUDE, parent: "t1" });
  const grandchild = term("t10", { program: CLAUDE, parent: "t9" });
  const plan = closePlan("a", world([shell("1", "a"), shell("2", "a")], [child, grandchild]));
  assert.equal(plan.closeTab, false);
  assert.deepEqual(plan.close, ["2"]);
  assert.deepEqual(plan.left, ["1"], "pane.close on t1 would end its dependent children");
  assert.equal(plan.why, "hosts");
});

test("an agent in another tab that runs under a shell here keeps that shell open", () => {
  const panes = [shell("1", "a"), shell("2", "a"), agent("3", "b")];
  const w = world(panes);
  w.terms.find((t) => t.address === "t3").parent = "t1";
  const plan = closePlan("a", w);
  assert.equal(plan.closeTab, false);
  assert.deepEqual(plan.left, ["1"]);
  assert.deepEqual(plan.hide, [], "its pane is in tab b, which this close doesn't touch");
});

test("an agent Herdr lists that terminals() calls a shell still counts as an agent of the tab", () => {
  const child = term("t9", { parent: "t1" });
  const plan = closePlan("a", world([shell("1", "a"), shell("2", "a")], [child], [{ address: "t9", program: PWSH }]));
  assert.equal(plan.closeTab, false);
  assert.deepEqual(plan.left, ["1"]);
});

test("a shell with only shell children closes with its tab", () => {
  const plan = closePlan("a", world([shell("1", "a")], [term("t9", { parent: "t1" })]));
  assert.equal(plan.closeTab, true);
});

test("a finished child agent holds nothing open", () => {
  const plan = closePlan("a", world([shell("1", "a")], [term("t9", { program: CLAUDE, parent: "t1", state: "exited" })]));
  assert.equal(plan.closeTab, true);
});

test("a pane whose terminal terminals() doesn't list closes nothing: what runs under it can't be checked", () => {
  const plan = closePlan("a", { panes: [shell("1", "a"), agent("2", "a")], listed: [], terms: [] });
  assert.equal(plan.closeTab, false);
  assert.deepEqual(plan.close, []);
  assert.deepEqual(plan.left, ["1"]);
  assert.equal(plan.why, "unlisted");
  assert.deepEqual(plan.hide.map((h) => h.terminal), ["t2"], "hiding ends nothing, so it still may");
});

test("a tab of one mod pane closes with tab.close, and a tab with no pane left is never closed by id", () => {
  assert.equal(closePlan("a", world([{ pane: "9", terminal: null, tab: "a", program: null }])).closeTab, true);
  assert.equal(closePlan("a", world([shell("1", "b")])).closeTab, false, "tab.close on a tab Herdr already closed could close another");
});

test("tabTerminals: a tab's panes, its labelled paneless terminals and their descendants, not the next tab's", () => {
  const w = world([shell("1", "a"), shell("2", "b")], [term("t7", { labels: { "herdr.tab": "a" } }), term("t8", { parent: "t7" }), term("t9", { parent: "t2" })]);
  assert.deepEqual(tabTerminals("a", w).map((e) => e.terminal), ["t1", "t7", "t8"]);
});

test("a park shows once the pane is gone and the terminal no longer carries the tab's label", () => {
  const p = agent("1", "a");
  assert.equal(parked("a", "t1", world([p])), false);
  assert.equal(parked("a", "t1", { panes: [], terms: [term("t1", { labels: { "herdr.tab": "a" } })] }), false, "the pane went but the core change is still pending");
  assert.equal(parked("a", "t1", { panes: [], terms: [term("t1")] }), true);
});

/**
 * A fake Herdr for runClose. park and the closes change its lists as Herdr would; `on` lets a test
 * change them first or refuse. Every command is logged in order, with "seen" when a park's wait ends.
 */
function herdr(panes, { more = [], listed = [], parks = () => true, before = () => {} } = {}) {
  const h = { ...world(panes, more, listed), log: [] };
  const io = {
    world: () => ({ panes: h.panes, listed: h.listed, terms: h.terms }),
    park(terminal) {
      h.log.push(`park:${terminal}`);
      before(h, terminal);
      if (!parks(terminal)) return;
      h.pending = () => {
        h.panes = h.panes.filter((p) => p.terminal !== terminal);
        h.terms = h.terms.map((t) => (t.address === terminal ? { ...t, labels: {} } : t));
      };
    },
    run(cmd, args) {
      h.log.push(`${cmd}:${args.pane ?? args.id}`);
      const gone = h.panes.filter((p) => (cmd === "tab.close" ? p.tab === args.id : p.pane === args.pane));
      h.panes = h.panes.filter((p) => !gone.includes(p));
      const dead = new Set(gone.map((p) => p.terminal));
      for (let grew = true; grew;) {
        grew = false;
        for (const t of h.terms) if (!dead.has(t.address) && t.state === "live" && (dead.has(t.parent) || (cmd === "tab.close" && t.labels?.["herdr.tab"] === args.id))) { dead.add(t.address); grew = true; }
      }
      h.terms = h.terms.map((t) => (dead.has(t.address) ? { ...t, state: "exited" } : t));
    },
    // The first poll never sees the change, as Herdr applies a park after the machine replies.
    async until(ok) {
      if (ok()) return true;
      await null;
      h.pending?.();
      h.pending = null;
      const seen = ok();
      if (seen) h.log.push("seen");
      return seen;
    },
  };
  const ended = () => h.terms.filter((t) => t.state !== "live" && t.program?.agent).map((t) => t.address);
  return { h, io, ended };
}

test("the job parks each agent and sees it parked before the next, and closes only after the last", async () => {
  const { h, io, ended } = herdr([agent("1", "a"), shell("2", "a"), agent("3", "a"), shell("4", "b")]);
  const r = await runClose("a", io);
  assert.deepEqual(h.log, ["park:t1", "seen", "park:t3", "seen", "tab.close:a"]);
  assert.deepEqual(r, { hidden: ["Claude Code", "Claude Code"], closed: 1, tabClosed: true, left: 0, why: null, stopped: null });
  assert.deepEqual(ended(), []);
  assert.deepEqual(h.panes.map((p) => p.pane), ["4"]);
});

test("a park that never shows stops the job before any close", async () => {
  const { h, io, ended } = herdr([agent("1", "a"), shell("2", "a"), agent("3", "a")], { parks: (t) => t !== "t3" });
  const r = await runClose("a", io);
  assert.deepEqual(h.log, ["park:t1", "seen", "park:t3"]);
  assert.deepEqual(r.stopped, { name: "Claude Code", why: "park" });
  assert.equal(r.closed, 0);
  assert.deepEqual(h.panes.map((p) => p.pane), ["2", "3"], "the shell and the agent that didn't park are still there");
  assert.deepEqual(ended(), []);
  const toast = closeToast(r);
  assert.equal(toast.title, "Tab left open");
  assert.match(toast.body, /did not hide in time, so nothing was closed\. Claude Code was hidden and keeps running/);
});

test("a shell that became an agent after the click is hidden, not closed", async () => {
  const start = (h) => { h.panes = h.panes.map((p) => (p.pane === "2" ? { ...p, listed: true } : p)); };
  const { h, io, ended } = herdr([agent("1", "a"), shell("2", "a")], { before: start });
  const r = await runClose("a", io);
  assert.deepEqual(h.log, ["park:t1", "seen", "park:t2", "seen"]);
  assert.equal(r.hidden.length, 2);
  assert.equal(r.closed, 0);
  assert.deepEqual(ended(), []);
});

test("a tab of shells where an agent started under one since the click: no tab.close, that shell stays", async () => {
  const { h, io, ended } = herdr([shell("1", "a"), shell("2", "a")], { more: [term("t9", { program: CLAUDE, parent: "t1" })] });
  const r = await runClose("a", io);
  assert.deepEqual(h.log, ["pane.close:2"]);
  assert.deepEqual(r, { hidden: [], closed: 1, tabClosed: false, left: 1, why: "hosts", stopped: null });
  assert.deepEqual(ended(), []);
  assert.match(closeToast(r).body, /Closed 1 pane\. Left 1 pane open: closing there could end an agent/);
});

test("a sub-agent that keeps the tab's label after its parent is hidden keeps the tab and its shell", async () => {
  const sub = term("t9", { program: CLAUDE, parent: "t1", labels: { "herdr.tab": "a" } });
  const { h, io, ended } = herdr([agent("1", "a"), shell("2", "a")], { more: [sub] });
  const r = await runClose("a", io);
  assert.deepEqual(h.log, ["park:t1", "seen"]);
  assert.deepEqual(r, { hidden: ["Claude Code"], closed: 0, tabClosed: false, left: 1, why: "hosts", stopped: null });
  assert.deepEqual(ended(), []);
});

test("a sub-agent that belongs to the tab only through its hidden parent lets the tab close", async () => {
  const { h, io, ended } = herdr([agent("1", "a"), shell("2", "a")], { more: [term("t9", { program: CLAUDE, parent: "t1" })] });
  const r = await runClose("a", io);
  assert.deepEqual(h.log, ["park:t1", "seen", "tab.close:a"]);
  assert.deepEqual(ended(), []);
  assert.equal(r.tabClosed, true);
});

test("a pane opened after the click is not closed, so tab.close doesn't run either", async () => {
  const split = (h) => { h.panes = [...h.panes, shell("5", "a")]; h.terms = [...h.terms, term("t5")]; };
  const { h, io } = herdr([agent("1", "a"), shell("2", "a")], { before: split });
  const r = await runClose("a", io);
  assert.deepEqual(h.log, ["park:t1", "seen", "pane.close:2"]);
  assert.equal(r.closed, 1);
  assert.deepEqual(h.panes.map((p) => p.pane), ["5"]);
});

test("a tab of shells runs tab.close and says nothing", async () => {
  const { h, io } = herdr([shell("1", "a"), shell("2", "a")]);
  const r = await runClose("a", io);
  assert.deepEqual(h.log, ["tab.close:a"]);
  assert.equal(closeToast(r), null);
});

test("a throw inside the job stops it and is reported, with nothing closed", async () => {
  const { h, io } = herdr([agent("1", "a"), shell("2", "a")]);
  io.park = () => { throw new Error("no core"); };
  const r = await runClose("a", io);
  assert.deepEqual(r.stopped, { name: "Claude Code", why: "error" });
  assert.deepEqual(h.log, []);
  assert.match(closeToast(r).body, /^A step failed, so nothing was closed\.$/);
});

test("the notice says what the job did", () => {
  const base = { hidden: [], closed: 0, tabClosed: false, left: 0, why: null, stopped: null };
  assert.deepEqual(closeToast({ ...base, hidden: ["Claude Code"], closed: 2, tabClosed: true }),
    { title: "Claude Code hidden", level: "info", body: "It keeps running. Click its Hidden row in Squads to show it again. Closed 2 other panes." });
  const two = closeToast({ ...base, hidden: ["Claude Code", "Codex"] });
  assert.equal(two.title, "2 agents hidden");
  assert.doesNotMatch(two.body, /Closed/);
  assert.match(closeToast({ ...base, left: 2, why: "unlisted" }).body, /^Left 2 panes open: Herdr's terminal list was not ready/);
});

test("the menu works on the tab's focused pane, Rename first and Close last", () => {
  const panes = [shell("1", "a"), agent("2", "a", { focused: true })];
  const m = tabActions({ id: "a", space: "s1" }, world(panes));
  assert.equal(m.pane.pane, "2");
  assert.deepEqual(ids(m.actions), ["rename", "split", "down", "zoom", "pop"]);
  assert.deepEqual(m.actions[0].run, { cmd: "tab.rename", args: { id: "a" } });
  assert.deepEqual(m.actions.find((a) => a.id === "zoom").run, { cmd: "pane.zoom", args: { pane: "2" } });
  assert.ok(!m.actions.some((a) => a.id === "hide" || a.run?.cmd === "pane.close"), "the pane's own ✕ is not in the tab menu");
  assert.equal(m.close.id, "close");
  assert.ok(!("plan" in m.close), "Close carries no plan: the list plans it when it runs");
});

test("a tab of one pane offers no Pop out, and its Zoom is greyed", () => {
  const m = tabActions({ id: "a", space: "s1" }, world([agent("1", "a")]));
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
  const m = tabActions({ id: "a", space: "s1" }, world(panes), { spaces: SPACES, chat });
  assert.deepEqual(m.moves.map((x) => [x.tip, x.more.space, x.ask]), [["02  two", "s2", "move"], ["03  three", "s3", "move"]]);
  assert.equal(m.moves[0].why, null);
  assert.match(m.moves[1].why, /no pane to split/);
});

test("a mod pane has no terminal, so its tab offers no move", () => {
  const m = tabActions({ id: "a", space: "s1" }, world([{ pane: "9", terminal: null, tab: "a", focused: true, program: null }]), { spaces: SPACES, chat: null });
  assert.deepEqual(m.moves, []);
});
