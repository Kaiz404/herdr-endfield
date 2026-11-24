// squads: where a squad lands when it is dragged or moved, and what each right-click menu in Squads
// offers, with no Herdr in it (tests/squads.test.mjs runs it in node). agents.js and squadmenu.js
// draw these and run the Herdr command an item names, on the person's click only.
// A squad is a Herdr space with agents in it, so its order is Herdr's space order (space.move).
// order: every space in Herdr's order, [{id, machine}]. Empty spaces are in it but have no squad.

import { ACTIONS, gate } from "./orders.js";
import { PINNED } from "./fleet.js";

const at = (order, id) => order.findIndex((s) => s.id === id);

/**
 * The space.move that drops squad `from` on squad `to`: it takes `to`'s place, so it lands after
 * `to` when dragged down and before it when dragged up (as Spaces' own drag does). Null when it
 * would not move, or the two are on different machines (Spaces keeps machines apart).
 */
export function squadMove(order, from, to) {
  const i = at(order, from), j = at(order, to);
  if (i < 0 || j < 0 || i === j || (order[i].machine ?? null) !== (order[j].machine ?? null)) return null;
  return { id: from, index: j + 1 };
}

/** Which edge of `to` the drop line is drawn on: where `from` will be. */
export const dropEdge = (order, from, to) => (at(order, from) < at(order, to) ? "bottom" : "top");

/**
 * Move up or down: the space.move that swaps squad `id` with the next squad shown above (dir -1) or
 * below (dir 1) on its machine, skipping spaces with no agents. squads: the shown squads, in order.
 */
export function stepSquad(order, squads, id, dir) {
  const mine = squads.find((q) => q.id === id);
  if (!mine || mine.pinned) return null;
  const peers = squads.filter((q) => !q.pinned && (q.machine ?? null) === (mine.machine ?? null));
  const next = peers[peers.findIndex((q) => q.id === id) + dir];
  return next ? squadMove(order, id, next.id) : null;
}

/**
 * A chat row's menu. member: the roster member. Only an agent with a pane has a tab of its own to
 * rename or a pin; a child without one and a Claude Code sub-agent get no menu. Rename and Archive
 * open the session card's confirm dialog (actions.js); Archive types /exit, so it waits for idle.
 * Moving a chat to another squad is not offered: Herdr has no command that moves a tab across spaces.
 * Item: {key, label, why}: why is null when it can be clicked, else what it waits for.
 */
export function chatMenu(member) {
  if (!member?.agent) return [];
  const actions = ACTIONS[member.program?.key] ?? {};
  return [
    ...(actions.rename ? [{ key: "rename", label: "Rename", why: null }] : []),
    { key: "pin", label: member.agent.pinned ? "Unpin" : "Pin to the top", why: null },
    ...(actions.archive ? [{ key: "archive", label: "Archive", why: gate(member.status) }] : []),
  ];
}

/** A squad header's menu: rename, and the click alternative to dragging it. None for Pinned. */
export function squadMenu(order, squads, id) {
  if (id === PINNED || !squads.some((q) => q.id === id)) return [];
  const up = stepSquad(order, squads, id, -1), down = stepSquad(order, squads, id, 1);
  return [
    { key: "rename", label: "Rename squad", why: null },
    { key: "up", label: "Move up", why: up ? null : "Already first", move: up },
    { key: "down", label: "Move down", why: down ? null : "Already last", move: down },
  ];
}
