// squads: where a squad or a chat lands when it is dragged or moved, where every block of the list
// is drawn while one is held, and what a squad header's right-click menu offers, with no Herdr in it
// (tests/squads.test.mjs runs it in node). agents.js and squadmenu.js draw these and run the Herdr
// command an item names, on the person's click or release only.
// A squad is a Herdr space with agents in it, so its order is Herdr's space order (space.move). A
// chat is a tab, so in Tab order its place in its squad is the tab's in its space (tab.move).
// order: every space (or every tab of one space) in Herdr's order, [{id, machine?}]. Empty spaces
// and tabs with no agent are in it but have no block in the list.

import { PINNED } from "./fleet.js";

const at = (order, id) => order.findIndex((s) => s.id === id);

/**
 * The space.move or tab.move ({id, index}, 1 = first) that drops `from` on `to`: it takes `to`'s
 * place, so it lands after `to` when dragged down and before it when dragged up (as Spaces' own
 * drag does). Null when it would not move, or the two are on different machines (Spaces keeps
 * machines apart).
 */
export function moveOnto(order, from, to) {
  const i = at(order, from), j = at(order, to);
  if (i < 0 || j < 0 || i === j || (order[i].machine ?? null) !== (order[j].machine ?? null)) return null;
  return { id: from, index: j + 1 };
}

/** Each block's top when block `from` sits at slot `to` and the rest close up around it. */
export function slotTops(heights, from, to) {
  const seq = heights.map((_, i) => i).filter((i) => i !== from);
  seq.splice(to, 0, from);
  const tops = [];
  let y = 0;
  for (const i of seq) { tops[i] = y; y += heights[i]; }
  return tops;
}

/**
 * A held block, as the list draws it. ids and heights: the blocks in shown order; from: the held
 * one's index; y: where the pointer has carried its top. The gap opens at the slot nearest y that
 * Herdr can move it to (moveOnto against `order`; its own slot always). -> {to, tops, move}: tops
 * are every block's top with the gap at `to` (the held one's is where it settles), move the
 * command a release runs (null when it would not move).
 */
export function holding({ ids, heights, order, from, y }) {
  let to = from, tops = slotTops(heights, from, from);
  for (let t = 0; t < ids.length; t++) {
    if (t === from || !moveOnto(order, ids[from], ids[t])) continue;
    const there = slotTops(heights, from, t);
    if (Math.abs(there[from] - y) < Math.abs(tops[from] - y)) { to = t; tops = there; }
  }
  return { to, tops, move: to === from ? null : moveOnto(order, ids[from], ids[to]) };
}

/**
 * A squad's rows as the chats that drag: a chat is a tab, so a block starts at every top-level row
 * of a tab other than the last block's, and takes the rows under it (its children, sub-agents and
 * "+N earlier"). rows: [{depth, h, tab?}] in shown order. -> [{id: tab, top, h, rows: [index]}]
 */
export function chatBlocks(rows) {
  const blocks = [];
  let y = 0;
  rows.forEach((r, i) => {
    const last = blocks.at(-1);
    if (!last || (r.depth === 0 && r.tab != null && r.tab !== last.id)) blocks.push({ id: r.tab ?? null, top: y, h: 0, rows: [] });
    const b = blocks.at(-1);
    b.h += r.h;
    b.rows.push(i);
    y += r.h;
  });
  return blocks;
}

/**
 * Move up or down: the space.move that swaps squad `id` with the next squad shown above (dir -1) or
 * below (dir 1) on its machine, skipping spaces with no agents. squads: the shown squads, in order.
 */
export function stepSquad(order, squads, id, dir) {
  const mine = squads.find((q) => q.id === id);
  if (!mine || mine.pinned) return null;
  const peers = squads.filter((q) => !q.pinned && (q.machine ?? null) === (mine.machine ?? null));
  const next = peers[peers.findIndex((q) => q.id === id) + dir];
  return next ? moveOnto(order, id, next.id) : null;
}

/**
 * A squad header's menu: rename, and the click alternative to dragging it. None for Pinned.
 * Item: {key, label, why, move}: why is null when it can be clicked, else what it waits for.
 */
export function squadMenu(order, squads, id) {
  if (id === PINNED || !squads.some((q) => q.id === id)) return [];
  const up = stepSquad(order, squads, id, -1), down = stepSquad(order, squads, id, 1);
  return [
    { key: "rename", label: "Rename squad", why: null },
    { key: "up", label: "Move up", why: up ? null : "Already first", move: up },
    { key: "down", label: "Move down", why: down ? null : "Already last", move: down },
  ];
}
