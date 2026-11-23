import { test } from "node:test";
import assert from "node:assert/strict";
import { transcriptPlan, TRANSCRIPT } from "../skin/mods/endfield/fleet.js";

// A tab as Herdr leaves it after a click: the plan applied, the split landing as a new pane.
function click(state, path) {
  const plan = transcriptPlan(state.panes, "t1", state.shown, path);
  if (plan.focus) return { ...state, focused: plan.focus };
  const kept = state.panes.filter((p) => !plan.close.includes(p.pane));
  const pane = `p${state.next + 1}`;
  return { panes: [...kept, { pane, tab: "t1", mod: TRANSCRIPT }], shown: path, next: state.next + 1, focused: state.focused };
}
const parent = { pane: "p0", tab: "t1", terminal: "a1" };
const start = { panes: [parent], shown: null, next: 0, focused: "p0" };
const transcripts = (s) => s.panes.filter((p) => p.mod === TRANSCRIPT);

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

test("a pile of transcript panes from before collapses to one", () => {
  const pile = [parent, ...["x", "y", "z"].map((pane) => ({ pane, tab: "t1", mod: TRANSCRIPT }))];
  assert.deepEqual(transcriptPlan(pile, "t1", "a", "a"), { close: ["x", "y", "z"] });
});

test("another tab's transcript pane and other mod panes are left alone", () => {
  const panes = [parent, { pane: "o", tab: "t2", mod: TRANSCRIPT }, { pane: "m", tab: "t1", mod: "files" }];
  assert.deepEqual(transcriptPlan(panes, "t1", null, "a"), { close: [] });
});
