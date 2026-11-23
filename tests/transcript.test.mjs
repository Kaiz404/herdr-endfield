import { test } from "node:test";
import assert from "node:assert/strict";
import { transcriptPlan, transcriptsIn, opening, paneRole } from "../skin/mods/endfield/fleet.js";

// A tab as Herdr leaves it after an opener runs: registry written, then the split lands as a new
// endfield pane whose props panes() never reports.
function split(state, role) {
  const reg = opening(state.reg, state.panes, "t1", role);
  const pane = `p${state.next + 1}`;
  return { ...state, reg, panes: [...state.panes, { pane, tab: "t1", mod: "endfield" }], next: state.next + 1 };
}
function click(state, path) {
  const plan = transcriptPlan(state.panes, "t1", state.shown, path, state.reg);
  if (plan.focus) return { ...state, focused: plan.focus };
  const kept = { ...state, panes: state.panes.filter((p) => !plan.close.includes(p.pane)) };
  return { ...split(kept, "transcript"), shown: path };
}
const parent = { pane: "p0", tab: "t1", terminal: "a1" };
const start = { panes: [parent], reg: undefined, shown: null, next: 0, focused: "p0" };
const transcripts = (s) => transcriptsIn(s.panes, "t1", s.reg);
const comms = (s) => s.panes.filter((p) => paneRole(s.reg, p) === "comms");

test("five different sub-agents in a row leave the parent and one transcript, showing the last", () => {
  let s = start;
  for (const path of ["a", "b", "c", "d", "e"]) s = click(s, path);
  assert.equal(s.panes.length, 2);
  assert.equal(transcripts(s).length, 1);
  assert.equal(s.shown, "e");
});

test("clicking the sub-agent already shown focuses its pane and opens nothing", () => {
  const s = click(start, "a");
  const again = click(s, "a");
  assert.deepEqual(again.panes, s.panes);
  assert.equal(again.focused, transcripts(s)[0].pane);
});

test("after the pane is closed, the next click opens it fresh, even for the same sub-agent", () => {
  assert.deepEqual(transcriptPlan([parent], "t1", "a", "a"), { close: [] });
});

test("Comms and a transcript in one tab keep their own roles, whichever opened first", () => {
  for (const order of [["comms", "a"], ["a", "comms"]]) {
    let s = start;
    for (const step of order) s = step === "comms" ? split(s, "comms") : click(s, step);
    assert.equal(transcripts(s).length, 1, order.join(" then "));
    assert.equal(comms(s).length, 1, order.join(" then "));
    assert.notEqual(transcripts(s)[0].pane, comms(s)[0].pane);
    s = click(s, "b");
    assert.equal(comms(s).length, 1, "replacing the transcript leaves Comms open");
  }
});

test("a Comms pane opened before the registry existed stays Comms, and is never closed as a transcript", () => {
  const s = { ...start, panes: [parent, { pane: "old", tab: "t1", mod: "endfield" }] };
  assert.deepEqual(transcriptPlan(s.panes, "t1", null, "a", s.reg), { close: [] });
  const after = click(s, "a");
  assert.deepEqual(comms(after).map((p) => p.pane), ["old"]);
  assert.equal(transcripts(after).length, 1);
});

test("a pane of the retired endfield-transcript mod is replaced, even when it showed the same sub-agent", () => {
  const stale = { pane: "x", tab: "t1", mod: "endfield-transcript" };
  assert.deepEqual(transcriptPlan([parent, stale], "t1", "a", "a"), { close: ["x"] });
});

test("another tab's transcript pane and other mod panes are left alone", () => {
  const reg = { roles: { o: "transcript" } };
  const panes = [parent, { pane: "o", tab: "t2", mod: "endfield" }, { pane: "m", tab: "t1", mod: "files" }];
  assert.deepEqual(transcriptPlan(panes, "t1", null, "a", reg), { close: [] });
});

test("the registry forgets closed panes", () => {
  const s = click(click(start, "a"), "b");
  assert.deepEqual(Object.keys(opening(s.reg, s.panes, "t1", "comms").roles), transcripts(s).map((p) => p.pane));
});
