import { test } from "node:test";
import assert from "node:assert/strict";
import { squadMove, dropEdge, stepSquad, squadMenu } from "../skin/mods/endfield/squads.js";

// Herdr's space.move {id, index}: the space ends at `index` (1 = first), as the real command does.
const applyMove = (order, { id, index }) => {
  const rest = order.filter((s) => s.id !== id);
  rest.splice(index - 1, 0, order.find((s) => s.id === id));
  return rest.map((s) => s.id);
};

// a, b (no agents, so no squad), c, d on this computer; r1, r2 on a remote machine.
const ORDER = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "r1", machine: "box" }, { id: "r2", machine: "box" }];
const SQUADS = [{ id: "pinned", pinned: true }, { id: "a", machine: null }, { id: "c", machine: null }, { id: "d", machine: null }, { id: "r1", machine: "box" }, { id: "r2", machine: "box" }];

test("a squad dropped on one below lands just after it, and on one above just before it", () => {
  assert.deepEqual(applyMove(ORDER, squadMove(ORDER, "a", "c")), ["b", "c", "a", "d", "r1", "r2"]);
  assert.equal(dropEdge(ORDER, "a", "c"), "bottom");
  assert.deepEqual(applyMove(ORDER, squadMove(ORDER, "d", "a")), ["d", "a", "b", "c", "r1", "r2"]);
  assert.equal(dropEdge(ORDER, "d", "a"), "top");
});

test("a drop that would not move anything, or would cross machines, runs nothing", () => {
  assert.equal(squadMove(ORDER, "c", "c"), null);
  assert.equal(squadMove(ORDER, "c", "r1"), null);
  assert.equal(squadMove(ORDER, "gone", "c"), null);
});

test("Move up and Move down swap with the next shown squad on the same machine, over empty spaces", () => {
  assert.deepEqual(applyMove(ORDER, stepSquad(ORDER, SQUADS, "c", -1)), ["c", "a", "b", "d", "r1", "r2"]);
  assert.deepEqual(applyMove(ORDER, stepSquad(ORDER, SQUADS, "c", 1)), ["a", "b", "d", "c", "r1", "r2"]);
  assert.equal(stepSquad(ORDER, SQUADS, "a", -1), null, "the Pinned squad is not a place to move to");
  assert.equal(stepSquad(ORDER, SQUADS, "d", 1), null, "the next squad is on another machine");
  assert.equal(stepSquad(ORDER, SQUADS, "r1", -1), null);
  assert.equal(stepSquad(ORDER, SQUADS, "pinned", 1), null);
});

test("a squad header's menu: rename always, a move only where there is somewhere to go", () => {
  const menu = squadMenu(ORDER, SQUADS, "a");
  assert.deepEqual(menu.map((i) => i.key), ["rename", "up", "down"]);
  assert.equal(menu[1].move, null);
  assert.ok(menu[1].why);
  assert.deepEqual(applyMove(ORDER, menu[2].move), ["b", "c", "a", "d", "r1", "r2"]);
  assert.deepEqual(squadMenu(ORDER, SQUADS, "pinned"), []);
  assert.deepEqual(squadMenu(ORDER, SQUADS, "b"), [], "a space with no agents has no header to click");
});
