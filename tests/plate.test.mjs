import { test } from "node:test";
import assert from "node:assert/strict";
import { kindOf, plateActions, endAction, tipOf, hiddenOf, keptHidden, HIDDEN_CAP } from "../skin/mods/endfield/plate.js";

const agentPane = { pane: "p1", terminal: "t1", tab: "a", program: { agent: true, name: "Claude Code" } };
const shellPane = { pane: "p2", terminal: "t2", tab: "a", program: { shell: true, name: "pwsh" } };
const serverPane = { pane: "p3", terminal: "t3", tab: "a", program: { name: "node" } };
const modPane = { pane: "p4", terminal: null, tab: "a", program: null };
const ids = (list) => list.map((a) => a.id);

test("an agent's ✕ hides it and never runs pane.close, which would end the agent", () => {
  const a = endAction(agentPane);
  assert.equal(kindOf(agentPane), "agent");
  assert.equal(a.id, "hide");
  assert.equal(a.ask, "hide");
  assert.equal(a.run, undefined);
  assert.equal(a.tip, "Hide (keeps running)");
  assert.ok(!a.danger, "hiding ends nothing, so it is not drawn as a kill");
  assert.ok(!a.keys.includes("pane.close"), "the tooltip never advertises Herdr's close key on an agent");
  for (const where of ["tray", "menu"]) {
    const all = plateActions(agentPane, 3, where);
    assert.ok(!all.some((x) => x.run?.cmd === "pane.close"), `no ${where} action closes an agent's pane`);
  }
});

test("a shell, another program and a mod pane keep Herdr's close, and say what it ends", () => {
  assert.deepEqual(endAction(shellPane).run, { cmd: "pane.close", args: { pane: "p2" } });
  assert.equal(endAction(shellPane).tip, "Close (ends this shell)");
  assert.equal(endAction(shellPane).danger, true);
  assert.equal(endAction(serverPane).tip, "Close (ends this program)");
  assert.equal(endAction(modPane).tip, "Close");
  assert.ok(!endAction(modPane).danger, "closing a mod pane ends no program");
});

test("the tray reads Split right, Zoom, Pop out, then the ✕, as an editor group's does", () => {
  assert.deepEqual(ids(plateActions(agentPane, 2)), ["split", "zoom", "pop", "hide"]);
  assert.deepEqual(ids(plateActions(shellPane, 2)), ["split", "zoom", "pop", "close"]);
  assert.deepEqual(ids(plateActions(modPane, 2)), ["split", "zoom", "close"], "a mod pane has no terminal to pop out");
});

test("a pane alone in its tab offers no Zoom or Pop out in the tray, and the menu greys them with why", () => {
  assert.deepEqual(ids(plateActions(agentPane, 1)), ["split", "hide"]);
  const menu = plateActions(agentPane, 1, "menu");
  assert.deepEqual(ids(menu), ["split", "down", "zoom", "pop", "hide"]);
  assert.equal(menu.find((a) => a.id === "zoom").why, "It is the only pane in this tab");
  assert.ok(menu.find((a) => a.id === "pop").why);
  assert.equal(menu.find((a) => a.id === "split").why, undefined);
});

test("Zoom runs pane.zoom on that pane, and on the zoomed pane reads Back to the split", () => {
  const zoom = plateActions(agentPane, 2).find((a) => a.id === "zoom");
  assert.deepEqual(zoom.run, { cmd: "pane.zoom", args: { pane: "p1" } });
  assert.equal(zoom.icon, "zoom");
  assert.equal(zoom.tip, "Fill the tab");
  const back = plateActions({ ...agentPane, zoomed: true }, 2).find((a) => a.id === "zoom");
  assert.equal(back.icon, "unzoom");
  assert.equal(back.tip, "Back to the split");
  assert.deepEqual(plateActions(agentPane, 2).find((a) => a.id === "split").run, { cmd: "pane.split", args: { direction: "right", pane: "p1" } });
});

test("a tooltip names the first key bound to the action, and only the action with none", () => {
  const bound = { "pane.split:right": "Ctrl+Shift+O", "pane.close": "Ctrl+Shift+X" };
  const bindingOf = (action) => bound[action] ?? null;
  const [split] = plateActions(shellPane, 2);
  assert.equal(tipOf(split, bindingOf), "Split right (Ctrl+Shift+O)");
  assert.equal(tipOf(endAction(shellPane), bindingOf), "Close (ends this shell) (Ctrl+Shift+X)");
  assert.equal(tipOf(endAction(agentPane), bindingOf), "Hide (keeps running)", "Ctrl+Shift+X closes, so a Hide never shows it");
  assert.equal(tipOf(endAction(agentPane), (a) => (a === "endfield.hidePane" ? "Ctrl+Shift+X" : null)), "Hide (keeps running) (Ctrl+Shift+X)");
});

const live = (address, created) => ({ address, created_ms: created, state: "live" });

test("a Hidden record stands while its terminal lives, the same one, with no pane", () => {
  const rec = hiddenOf(live("t1", 100), { space: "s1", tab: "a" }, 1000);
  assert.deepEqual(rec, { terminal: "t1", created: 100, space: "s1", tab: "a", at: 1000 });
  assert.deepEqual(keptHidden([rec], [live("t1", 100)], [], 2000), [rec]);
  assert.deepEqual(keptHidden([rec], [], [], 2000), [], "it ended");
  assert.deepEqual(keptHidden([rec], [{ ...live("t1", 100), state: "finished" }], [], 2000), []);
  assert.deepEqual(keptHidden([rec], [live("t1", 999)], [], 2000), [], "the address went to another terminal");
});

test("a Hide just written keeps its record while the park takes the pane, and drops it once it is shown again", () => {
  const rec = hiddenOf(live("t1", 100), { space: "s1", tab: "a" }, 1000);
  assert.deepEqual(keptHidden([rec], [live("t1", 100)], ["t1"], 2000), [rec], "the park is still on its way");
  assert.deepEqual(keptHidden([rec], [live("t1", 100)], ["t1"], 60000), [], "shown again since");
});

test("the records are capped at the newest", () => {
  const terms = Array.from({ length: HIDDEN_CAP + 5 }, (_, i) => live(`t${i}`, i));
  const recs = terms.map((t, i) => hiddenOf(t, null, i));
  const kept = keptHidden(recs, terms, [], 0);
  assert.equal(kept.length, HIDDEN_CAP);
  assert.equal(kept.at(-1).terminal, `t${HIDDEN_CAP + 4}`);
});
