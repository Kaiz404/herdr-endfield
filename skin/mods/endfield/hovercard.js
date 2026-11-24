// The session card's rules: whose card is up, when a press takes it away, and where its window
// goes and how tall it is. No Herdr import: tests/ runs it under node.

import { taskView, tasksOf } from "./fleet.js";

export const CARD = { width: 368, pad: 14, slide: 14 };

// What the panel draws at, in px at zoom 1: the head and the ink footer never scroll, and `mid` is
// the least the scrolling middle keeps (the machine panel).
export const PANEL = { head: 110, foot: 104, mid: 120 };

// The Tasks section: its frame, then one row per running task (or the "None running" line).
const TASKS_H = { frame: 34, row: 22 };

/** The question a blocked agent asks, shown under the panel. */
export const questionOf = (s, status) => (status === "blocked" ? s?.question ?? null : null);

/** How tall the panel draws, so the list can keep it inside the window before it exists. Finished tasks start folded. */
export function cardHeight(s, status, now = Date.now()) {
  const { running, finished } = taskView(tasksOf(s), now);
  const tasks = running.length + finished.length ? TASKS_H.frame + TASKS_H.row * Math.max(1, running.length) : 0;
  return 516 + (questionOf(s, status) ? 52 : 0) + tasks;
}

/** The app window's height as the list reads it. */
export const windowHeight = (px) => px;

/**
 * The card's window beside `row` ({y, height}, the hovered row) in a window `winH` tall, for a
 * panel that wants `want`: its top `y`, its height `tall`, and `fit`, the panel's height cap. Its
 * top sits 12px above the row's (or its bottom 12px below, near the window's foot). The panel
 * draws at its own height up to the cap; past it (a short window, or a task list that grew or
 * unfolded while open) the middle scrolls, and the head and the button row stay.
 */
export function cardPlace({ want, row, winH }) {
  const tall = Math.min(want + 2 * CARD.pad, Math.max(winH - 16, 2 * CARD.pad + 240));
  let y = row.y - 12 - CARD.pad;
  if (y + tall > winH - 8) y = row.y + row.height + 12 + CARD.pad - tall;
  return { y: Math.round(Math.max(0, y)), tall, fit: tall - 2 * CARD.pad };
}

/**
 * facts, read when the decision is made: `row` is the hovered agent row's address (null when the
 * list draws no rows or the agent is gone), `hot` the overlay id of the card the pointer is on,
 * `open` the card that is up ({ id, address }).
 * Returns the address whose card should be up, or null for none.
 */
export function wantedCard({ row = null, hot = null, open = null }) {
  return row ?? (open && hot === open.id ? open.address : null);
}

/**
 * Whether the open card goes now: `closed` is the overlay id last reported pressed beside or
 * closed by itself, `kept` the overlay id whose own row took the press.
 */
export function dismissed({ closed = null, open = null, kept = null }) {
  return Boolean(open) && closed === open.id && kept !== open.id;
}
