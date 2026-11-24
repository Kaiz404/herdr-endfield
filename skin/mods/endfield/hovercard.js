// The session card's rules: which rows have a card and what each offers, whose card is up, when a
// press takes it away, and where its window goes and how tall it is. No Herdr import: tests/ runs
// it under node.

import { taskView, tasksOf } from "./fleet.js";

export const CARD = { width: 368, pad: 14, slide: 14 };

// What the panel draws at, in px at zoom 1: the head and the ink footer never scroll, and `mid` is
// the least the scrolling middle keeps (the machine panel).
export const PANEL = { head: 110, foot: 104, mid: 120 };

// The Tasks section: its frame, then one row per running task (or the "None running" line).
const TASKS_H = { frame: 34, row: 22 };

/**
 * One row per kind of card, by what its Squads row is. `chat` and `comms`: the sections only a
 * terminal has. `acts`: the footer's buttons, in order. `base`: the panel's height with no tasks.
 * A Claude Code sub-agent is not a terminal: nothing to rename, pin, archive, peek or dispatch to.
 */
export const CARD_KINDS = {
  agent: { chat: true, comms: true, acts: ["peek", "pin", "dispatch", "go"], base: 516 },
  sub: { chat: false, comms: false, acts: ["followup", "transcript"], base: 390 },
};

/** The kind of card a Squads row gets, from its key: "ag-<terminal>" or "sa-<sub-agent id>". Null: no card. */
export const cardKind = (key) => (`${key ?? ""}`.startsWith("ag-") ? "agent" : `${key ?? ""}`.startsWith("sa-") ? "sub" : null);

/** The question a blocked agent asks, shown under the panel. */
export const questionOf = (s, status) => (status === "blocked" ? s?.question ?? null : null);

/** How tall the panel draws, so the list can keep it inside the window before it exists. Finished tasks start folded. */
export function cardHeight(s, status, kind = "agent", now = Date.now()) {
  const { running, finished } = taskView(tasksOf(s), now);
  const tasks = running.length + finished.length ? TASKS_H.frame + TASKS_H.row * Math.max(1, running.length) : 0;
  return CARD_KINDS[kind].base + (questionOf(s, status) ? 52 : 0) + tasks;
}

// The card's window keeps EDGE from the app window's top and foot, and LIFT past its row.
const EDGE = 8;
const LIFT = 12;

/**
 * The app window's height in the px a mod lays out in. Herdr draws a mod's px times the zoom, so
 * the window's own px are divided by it. Null when the window can't be read.
 */
export const windowHeight = (px, zoom) => (px > 0 && zoom > 0 && Number.isFinite(px / zoom) ? Math.round(px / zoom) : null);

/**
 * The card's window beside `row` ({y, height}, the hovered row) in a window `winH` tall (null:
 * unknown, nothing is capped), for a panel that wants `want`: its top `y`, its height `tall`, and
 * `fit`, the panel's height cap. Its top sits 12px above the row's, or as far up as keeps it in the
 * window. The panel draws at its own height up to the cap; past it (a short window, or a task
 * list that grew or unfolded while open) the middle scrolls, down to PANEL.mid, and the head and
 * the button row stay.
 */
export function cardPlace({ want, row, winH }) {
  const least = PANEL.head + PANEL.mid + PANEL.foot + 2 * CARD.pad;
  const tall = winH == null ? want + 2 * CARD.pad : Math.min(want + 2 * CARD.pad, Math.max(winH - 2 * EDGE, least));
  const top = row.y - LIFT - CARD.pad;
  const y = winH == null ? top : Math.min(top, winH - EDGE - tall);
  return { y: Math.round(Math.max(0, y)), tall, fit: tall - 2 * CARD.pad };
}

/** Whether the open card ({winH: the window height it was placed for}) has to be placed again. */
export const resized = (open, winH) => Boolean(open) && open.winH !== winH;

/**
 * facts, read when the decision is made: `row` is the hovered row's key (null when the list draws
 * no rows, the row has no card or its agent is gone), `hot` the overlay id of the card the pointer
 * is on, `open` the card that is up ({ id, key, held }), `live` whether the open card's row is
 * still listed. A held card (opened by a right-click) stays whatever the pointer does.
 * Returns the key of the row whose card should be up, or null for none.
 */
export function wantedCard({ row = null, hot = null, open = null, live = true }) {
  if (open?.held) return live ? open.key : null;
  return row ?? (open && hot === open.id ? open.key : null);
}

/**
 * Whether the open card goes now: `closed` is the overlay id last reported pressed beside or
 * closed by itself, `kept` the overlay id whose own row took the press. A held card is a popup:
 * Herdr has closed it by the time it reports, wherever the press was.
 */
export function dismissed({ closed = null, open = null, kept = null }) {
  return Boolean(open) && closed === open.id && (Boolean(open.held) || kept !== open.id);
}
