// tabplate: what a tab offers in the tab strip, with no Herdr in it (tests/tabplate.test.mjs runs it
// in node). A tab works on its focused pane with that pane's plate actions (plate.js), and adds
// Rename, Move to squad and Close. Close never ends an agent. Herdr ends every terminal in a closed
// pane or tab and each one's dependent children (AGENTS.md: "Closing panes, tabs or spaces ends the
// terminals in them. Core ends dependent children"), so closePlan hides each agent pane, as the
// plate's Hide does, closes only a pane no agent runs under, and allows tab.close only when no
// agent terminal belongs to the tab at all, with a pane or without (archive.js tabTerminals).
//
// World: Herdr's lists read at one moment, {panes (panes() entries with `listed`, pane.js), listed
//   (agents()), terms (terminals())}.
// ClosePlan: {tab, hide ([{terminal, name}]: agent panes to park), close (panes to close), left
//   (panes that stay, since closing them could end an agent), why (why they stay: "hosts" | "unlisted"
//   | null), closeTab (tab.close may run)}.
// CloseResult: {hidden (names of the agents seen parked), closed (panes seen gone), tabClosed, left, why,
//   stopped ({name, why: "park" | "error"} when a park was not seen, so nothing was closed, else null)}.

import { kindOf, plateActions } from "./plate.js";
import { movePlan } from "./dock.js";
import { tabTerminals, tabLabel } from "./archive.js";

const inTab = (tab, panes) => panes.filter((p) => p.tab === tab);
const bare = (id) => String(id ?? "").replace(/^.*\//, "");

/** The pane tab `tab`'s actions work on: its focused pane, else its first, else null. */
export const paneOfTab = (tab, panes) => {
  const here = inTab(tab, panes);
  return here.find((p) => p.focused) ?? here[0] ?? null;
};

const count = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** What a close on tab `tab` may do on Herdr's lists as they are now. No step of it ends an agent. */
export function closePlan(tab, { panes, listed = [], terms = [] }) {
  const here = inTab(tab, panes);
  const agents = here.filter((p) => kindOf(p) === "agent");
  const rest = here.filter((p) => kindOf(p) !== "agent");
  const hide = agents.map((p) => ({ terminal: p.terminal, name: p.program?.name ?? "Agent" }));
  const stay = (why) => ({ tab, hide, close: [], left: rest.map((p) => p.pane), why, closeTab: false });
  // A pane whose terminal terminals() doesn't list live: the list can't say what runs under it.
  const live = new Set(terms.filter((t) => (t.state ?? "live") === "live").map((t) => t.address));
  if (here.some((p) => p.terminal && !live.has(p.terminal))) return stay("unlisted");
  const ends = tabTerminals(tab, { panes, listed, terms });
  const byAddr = new Map(ends.map((e) => [e.terminal, e]));
  const isListed = new Set(listed.map((a) => a.address));
  const shown = new Set(agents.map((p) => p.terminal));
  // Agents that end with the tab and have no agent pane in it to hide: sub-agents, labelled children.
  const owned = ends.filter((e) => (e.kind !== "shell" || isListed.has(e.terminal)) && !shown.has(e.terminal));
  if (!owned.length) return { tab, hide, close: rest.map((p) => p.pane), left: [], why: null, closeTab: here.length > 0 && !agents.length };
  const hosts = new Set();
  for (const e of owned) for (let up = e, d = 0; up && d < 64; up = byAddr.get(up.parent), d++) hosts.add(up.terminal);
  const left = rest.filter((p) => p.terminal && hosts.has(p.terminal));
  const close = rest.filter((p) => !left.includes(p));
  // Closing the tab's last pane closes the tab, and an agent still belongs to it.
  if (close.length === here.length) return stay("hosts");
  return { tab, hide, close: close.map((p) => p.pane), left: left.map((p) => p.pane), why: left.length ? "hosts" : null, closeTab: false };
}

/** Whether a park of `terminal` out of tab `tab` shows: it has no pane, and no herdr.tab label for the tab. */
export const parked = (tab, terminal, { panes, terms = [] }) =>
  !panes.some((p) => p.terminal === terminal) && tabLabel(terms.find((t) => t.address === terminal) ?? {}) !== bare(tab);

/**
 * Closes tab `tab` as one job, each step once Herdr shows the last: every agent pane is parked and
 * seen parked, one at a time, planning again on Herdr's lists before each; only then are the other
 * panes closed, from a plan made after the last park, and tab.close runs only if that plan allows
 * it. A park not seen in time stops the job before any close. Only a pane there at the start is
 * closed. io: {world() -> World, park(terminal) (writes the Hidden record, then terminal.park),
 * run(cmd, args), until(ok) -> whether ok() came true in time}. -> CloseResult.
 */
export async function runClose(tab, io) {
  const out = { hidden: [], closed: 0, tabClosed: false, left: 0, why: null, stopped: null };
  let at = null;
  try {
    const asked = new Set(inTab(tab, io.world().panes).map((p) => p.pane));
    let plan = closePlan(tab, io.world());
    for (; plan.hide.length; plan = closePlan(tab, io.world())) {
      at = plan.hide[0];
      const { terminal } = at;
      io.park(terminal);
      if (!(await io.until(() => parked(tab, terminal, io.world())))) { out.stopped = { name: at.name, why: "park" }; return out; }
      out.hidden.push(at.name);
    }
    at = null;
    const mine = plan.close.filter((p) => asked.has(p));
    out.left = plan.left.length;
    out.why = plan.why;
    if (plan.closeTab && mine.length === plan.close.length) {
      io.run("tab.close", { id: tab });
      out.tabClosed = await io.until(() => !inTab(tab, io.world().panes).length);
      if (out.tabClosed) out.closed = mine.length;
      return out;
    }
    for (const pane of mine) io.run("pane.close", { pane });
    const still = () => io.world().panes.filter((p) => mine.includes(p.pane)).length;
    if (mine.length) await io.until(() => !still());
    out.closed = mine.length - still();
  } catch {
    out.stopped = { name: at?.name ?? null, why: "error" };
  }
  return out;
}

const WHY = {
  hosts: "closing there could end an agent that has no pane of its own",
  unlisted: "Herdr's terminal list was not ready, so nothing could be checked",
};

/** The notice for a finished close, from what happened. Null when a tab with no agent just closed. */
export function closeToast(r) {
  const n = r.hidden.length;
  if (!n && !r.stopped && !r.left) return null;
  const kept = !n ? "" : n === 1 ? `${r.stopped ? `${r.hidden[0]} was hidden and` : "It"} keeps running. Click its Hidden row in Squads to show it again.`
    : `${r.stopped ? `${n} agents were hidden and` : "They"} keep running. Click a Hidden row in Squads to show that one again.`;
  if (r.stopped) {
    const what = r.stopped.why === "park" ? `${r.stopped.name}'s pane did not hide in time` : "A step failed";
    return { title: "Tab left open", level: "warning", body: [`${what}, so nothing was closed.`, kept].filter(Boolean).join(" ") };
  }
  const closed = r.closed ? `Closed ${count(r.closed, n ? "other pane" : "pane", n ? "other panes" : "panes")}.` : "";
  const left = r.left ? `Left ${count(r.left, "pane", "panes")} open: ${WHY[r.why]}.` : "";
  return { title: !n ? "Tab left open" : n === 1 ? `${r.hidden[0]} hidden` : `${n} agents hidden`, level: "info", body: [kept, closed, left].filter(Boolean).join(" ") };
}

/** The tab's Close: what it ends is in its tip, and Herdr's tab.close key is named only where it is what runs. */
export function closeAction(plan) {
  const tip = plan.closeTab ? "Close tab" : plan.close.length ? "Close (agents keep running, the rest end)" : "Close (agents keep running)";
  return { id: "close", icon: "close", tip, keys: plan.closeTab ? ["tab.close"] : [], danger: plan.closeTab || plan.close.length > 0 };
}

/**
 * The tab's right-click menu. tab: {id, space}; world: a World; spaces: spaces(); chat: its pane's
 * chat as docking.js builds it (null for a mod pane, which has no terminal to move).
 * -> {pane, actions: Rename then the plate's (Pop out only out of a split), moves (one per other squad,
 *    greyed with movePlan's problem), close}
 */
export function tabActions(tab, world, { spaces = [], chat = null } = {}) {
  const { panes } = world;
  const pane = paneOfTab(tab.id, panes);
  const rename = { id: "rename", icon: null, tip: "Rename", keys: ["tab.rename"], run: { cmd: "tab.rename", args: { id: tab.id } } };
  // select: the tab is shown first, so the split or zoom happens where the person looks.
  const plate = pane ? plateActions(pane, inTab(tab.id, panes).length, "menu").slice(0, -1).filter((a) => !(a.id === "pop" && a.why)).map((a) => ({ ...a, select: true })) : [];
  const moves = !chat ? [] : spaces.flatMap((s, i) => (s.id === tab.space ? [] : [{
    id: `move-${s.id}`, icon: null, tip: `${String(i + 1).padStart(2, "0")}  ${s.name}`, ask: "move", more: { space: s.id },
    why: movePlan(chat, spaces, panes, s.id).problem ?? null,
  }]));
  return { pane, actions: [rename, ...plate], moves, close: closeAction(closePlan(tab.id, world)) };
}
