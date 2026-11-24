import { test } from "node:test";
import assert from "node:assert/strict";
import { moveOnto, slotTops, holding, chatBlocks, stepSquad, squadMenu } from "../skin/mods/endfield/squads.js";

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
  assert.deepEqual(applyMove(ORDER, moveOnto(ORDER, "a", "c")), ["b", "c", "a", "d", "r1", "r2"]);
  assert.deepEqual(applyMove(ORDER, moveOnto(ORDER, "d", "a")), ["d", "a", "b", "c", "r1", "r2"]);
});

test("a drop that would not move anything, or would cross machines, runs nothing", () => {
  assert.equal(moveOnto(ORDER, "c", "c"), null);
  assert.equal(moveOnto(ORDER, "c", "r1"), null);
  assert.equal(moveOnto(ORDER, "gone", "c"), null);
});

// The shown squads: Pinned (30px), a (100), c (50), d (80) here, r1 (60) and r2 (40) on "box".
const IDS = ["pinned", "a", "c", "d", "r1", "r2"];
const HEIGHTS = [30, 100, 50, 80, 60, 40];
const hold = (from, y) => holding({ ids: IDS, heights: HEIGHTS, order: ORDER, from: IDS.indexOf(from), y });
const shown = (tops) => IDS.map((id, i) => [id, tops[i]]).sort((x, y) => x[1] - y[1]).map(([id]) => id);

test("while a squad is held, the others close up around a gap at every slot it can drop in", () => {
  // a (index 1) held over each slot of its machine: the list it would become, as tops.
  assert.deepEqual(slotTops(HEIGHTS, 1, 1), [0, 30, 130, 180, 260, 320], "over its own slot, nothing moves");
  assert.deepEqual(slotTops(HEIGHTS, 1, 2), [0, 80, 30, 180, 260, 320], "c slides up by a's height");
  assert.deepEqual(slotTops(HEIGHTS, 1, 3), [0, 160, 30, 80, 260, 320], "c and d slide up, a's gap is under d");
  for (let t = 0; t < IDS.length; t++) {
    const tops = slotTops(HEIGHTS, 1, t);
    const seq = shown(tops);
    assert.equal(seq.indexOf("a"), t, `the gap is at slot ${t}`);
    let y = 0;
    for (const id of seq) { assert.equal(tops[IDS.indexOf(id)], y, `no overlap or hole at slot ${t}`); y += HEIGHTS[IDS.indexOf(id)]; }
  }
});

test("the gap follows the held squad's top to the nearest slot, and the release runs that move", () => {
  for (const [y, to, order] of [
    [30, 1, null],
    [54, 1, null],
    [56, 2, ["b", "c", "a", "d", "r1", "r2"]],
    [90, 2, ["b", "c", "a", "d", "r1", "r2"]],
    [150, 3, ["b", "c", "d", "a", "r1", "r2"]],
  ]) {
    const h = hold("a", y);
    assert.equal(h.to, to, `top at ${y}px opens the gap at slot ${to}`);
    assert.deepEqual(h.move && applyMove(ORDER, h.move), order);
    if (order) assert.deepEqual(shown(h.tops).filter((id) => id !== "pinned" && !id.startsWith("r")), order.filter((id) => id !== "b" && !id.startsWith("r")), "the drawn order is the order Herdr ends with");
  }
});

test("a held squad never opens a gap on Pinned or on another machine, and dropped in place runs nothing", () => {
  assert.equal(hold("a", 0).to, 1, "above every squad it stays under Pinned");
  assert.equal(hold("d", 400).to, 3, "past the remote squads it stays last on this computer");
  assert.equal(hold("r1", 0).to, 4, "a remote squad stays with its machine");
  assert.equal(hold("r1", 400).to, 5);
  assert.equal(hold("c", 130).move, null, "released where it started");
  assert.deepEqual(hold("c", 130).tops, slotTops(HEIGHTS, 2, 2));
});

test("a squad's chats drag as tabs: a chat carries its children, sub-agents and +N earlier", () => {
  const rows = [
    { depth: 0, tab: "t1", h: 56 }, { depth: 1, h: 50 }, { depth: 1, h: 26 },
    { depth: 0, tab: "t2", h: 34 }, { depth: 0, tab: "t2", h: 34 },
    { depth: 0, tab: "t3", h: 56 }, { depth: 1, tab: "t9", h: 50 },
  ];
  assert.deepEqual(chatBlocks(rows), [
    { id: "t1", top: 0, h: 132, rows: [0, 1, 2] },
    { id: "t2", top: 132, h: 68, rows: [3, 4] },
    { id: "t3", top: 200, h: 106, rows: [5, 6] },
  ]);
  const tabs = [{ id: "t1" }, { id: "t0" }, { id: "t2" }, { id: "t3" }];
  const h = holding({ ids: ["t1", "t2", "t3"], heights: [132, 68, 106], order: tabs, from: 0, y: 150 });
  assert.equal(h.to, 2);
  assert.deepEqual(applyMove(tabs, h.move), ["t0", "t2", "t3", "t1"], "dropped last, past a tab with no agent");
  assert.deepEqual(h.tops, [174, 0, 68]);
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
