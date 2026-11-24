// The session card's rules: which rows have a card and what each offers, what its header and its
// Tools and Recent sections say, whose card is up, when a press takes it away, and where its window
// goes and how tall it is. No Herdr import: tests/ runs it under node.

import { taskView, tasksOf, statusOf, inFlight, longDuration, elapsed, effortWord, DASH } from "./fleet.js";

export const CARD = { width: 368, pad: 14, slide: 14 };

// What the panel draws at, in px at zoom 1: the header strip and the ink footer never scroll, and
// `mid` is the least the scrolling middle keeps (the context gauge and the top of Tools).
export const PANEL = { head: 110, foot: 58, mid: 120 };

// Each middle section's height. A list (Tools, Recent, Tasks) is a frame, then one row per item,
// or one line saying there are none.
const SECTION_H = { context: 59, chat: 66, comms: 73, question: 52, list: { frame: 35, row: 20 }, tasks: { frame: 34, row: 22 } };

// How many tools Tools ranks, and how many calls Recent lists (probe.mjs keeps 5).
export const TOP_TOOLS = 4;
export const RECENT = 5;

/**
 * One row per kind of card, by what its Squads row is. Both share the header strip, Context, Tools,
 * Recent and Tasks. `chat` and `comms`: the sections only a terminal has. `acts`: the footer's
 * buttons, in order. A Claude Code sub-agent is not a terminal: nothing to rename, pin, archive,
 * peek or dispatch to.
 */
export const CARD_KINDS = {
  agent: { chat: true, comms: true, acts: ["peek", "pin", "dispatch", "go"] },
  sub: { chat: false, comms: false, acts: ["followup", "transcript"] },
};

/** The kind of card a Squads row gets, from its key: "ag-<terminal>" or "sa-<sub-agent id>". Null: no card. */
export const cardKind = (key) => (`${key ?? ""}`.startsWith("ag-") ? "agent" : `${key ?? ""}`.startsWith("sa-") ? "sub" : null);

/** The question a blocked agent asks, shown under the panel. */
export const questionOf = (s, status) => (status === "blocked" ? s?.question ?? null : null);

// An MCP tool is named mcp__<server>__<tool>: the tool's own name is the part that says what it did.
const toolLabel = (name) => (String(name).startsWith("mcp__") ? String(name).split("__").at(-1) : String(name));

/**
 * The Tools section: the `n` most called tools, most first (a tie by name), each with its share of
 * the most called one's count, which is its bar's length. counts: Session/Sub toolCounts.
 */
export function toolsView(counts, n = TOP_TOOLS) {
  const ranked = Object.entries(counts ?? {}).sort(([a, x], [b, y]) => y - x || a.localeCompare(b)).slice(0, n);
  const most = ranked[0]?.[1] ?? 0;
  return ranked.map(([tool, count]) => ({ tool: toolLabel(tool), count, share: count / most }));
}

/** The Recent section: the last tool calls newest first, each with how long ago it was. recent: Session/Sub recent. */
export const recentView = (recent, now) => [...(recent ?? [])].slice(-RECENT).reverse()
  .map((r) => ({ age: r.at ? elapsed(Math.max(0, now - r.at)) : DASH, tool: toolLabel(r.tool), arg: r.arg ?? "" }));

/**
 * The header strip's three lines. who: callsign, kind (the program, or "Sub-agent") and where it
 * runs (a sub-agent's `via <parent>` first), with `≈` when its transcript was matched by folder
 * only. title: the task. status and facts: the status word, then model, effort and elapsed. A run
 * in flight counts to now; one that is over stopped its clock at its last write.
 */
export function headerOf({ sub = false, callsign, program, where = [], title, approx = false, status, s, now }) {
  const end = inFlight(status) ? now : s?.lastAt ?? now;
  return {
    who: [callsign, sub ? "Sub-agent" : program, ...where, approx ? "≈" : null].filter(Boolean),
    title: title || DASH,
    status: statusOf(status)?.word ?? status,
    facts: [s?.model?.short, effortWord(s?.effort), s?.startedAt ? longDuration(end - s.startedAt) : null].filter(Boolean),
  };
}

const listH = (rows) => SECTION_H.list.frame + SECTION_H.list.row * Math.max(1, rows);

/** How tall the panel draws, so the list can keep it inside the window before it exists. Finished tasks start folded. */
export function cardHeight(s, status, kind = "agent", now = Date.now()) {
  const K = CARD_KINDS[kind];
  const { running, finished } = taskView(tasksOf(s), now);
  const tasks = running.length + finished.length ? SECTION_H.tasks.frame + SECTION_H.tasks.row * Math.max(1, running.length) : 0;
  return PANEL.head + PANEL.foot + SECTION_H.context + listH(toolsView(s?.toolCounts).length) + listH(recentView(s?.recent, now).length)
    + tasks + (K.chat ? SECTION_H.chat : 0) + (K.comms ? SECTION_H.comms : 0) + (questionOf(s, status) ? SECTION_H.question : 0);
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
