// tabplate: what a tab offers in the tab strip, with no Herdr in it (tests/tabplate.test.mjs runs it
// in node). A tab works on its focused pane with that pane's plate actions (plate.js), and adds
// Rename, Move to squad and Close. Close never ends an agent: closePlan hides each agent pane, as
// the plate's Hide does, and closes only the rest. Herdr's tab.close runs only on a tab with no agent.
//
// Panes are panes() entries with `listed` (pane.js), so kindOf sees an agent Herdr lists as one.
// ClosePlan: {tab, hide (terminals to park), close (panes to close), closeTab (run tab.close), toast}.

import { kindOf, plateActions } from "./plate.js";
import { movePlan } from "./dock.js";

const inTab = (tab, panes) => panes.filter((p) => p.tab === tab);

/** The pane tab `tab`'s actions work on: its focused pane, else its first, else null. */
export const paneOfTab = (tab, panes) => {
  const here = inTab(tab, panes);
  return here.find((p) => p.focused) ?? here[0] ?? null;
};

const count = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** What a close on tab `tab` does. A tab with any agent pane keeps every agent running. */
export function closePlan(tab, panes) {
  const here = inTab(tab, panes);
  const agents = here.filter((p) => kindOf(p) === "agent");
  if (!agents.length) return { tab, hide: [], close: [], closeTab: true, toast: null };
  const rest = here.filter((p) => kindOf(p) !== "agent");
  const one = agents.length === 1;
  const title = one ? `${agents[0].program?.name ?? "Agent"} hidden` : `${agents.length} agents hidden`;
  const closed = rest.length ? ` Closed ${count(rest.length, "other pane", "other panes")}.` : "";
  return {
    tab, hide: agents.map((p) => p.terminal), close: rest.map((p) => p.pane), closeTab: false,
    toast: { title, level: "info", body: `${one ? "It keeps running. Click its Hidden row in Squads to show it again." : "They keep running. Click a Hidden row in Squads to show that one again."}${closed}` },
  };
}

/** The tab's Close: what it ends is in its tip, and Herdr's tab.close key is named only where it is what runs. */
export function closeAction(plan) {
  const hides = plan.hide.length > 0;
  const tip = !hides ? "Close tab" : plan.close.length ? "Close (agents keep running, the rest end)" : "Close (agents keep running)";
  return { id: "close", icon: "close", tip, keys: hides ? [] : ["tab.close"], plan, danger: plan.closeTab || plan.close.length > 0 };
}

/**
 * The tab's right-click menu. tab: {id, space}; spaces: spaces(); chat: its pane's chat as
 * docking.js builds it (null for a mod pane, which has no terminal to move).
 * -> {pane, actions: Rename then the plate's (Pop out only out of a split), moves (one per other squad,
 *    greyed with movePlan's problem), close}
 */
export function tabActions(tab, panes, { spaces = [], chat = null } = {}) {
  const pane = paneOfTab(tab.id, panes);
  const rename = { id: "rename", icon: null, tip: "Rename", keys: ["tab.rename"], run: { cmd: "tab.rename", args: { id: tab.id } } };
  // select: the tab is shown first, so the split or zoom happens where the person looks.
  const plate = pane ? plateActions(pane, inTab(tab.id, panes).length, "menu").slice(0, -1).filter((a) => !(a.id === "pop" && a.why)).map((a) => ({ ...a, select: true })) : [];
  const moves = !chat ? [] : spaces.flatMap((s, i) => (s.id === tab.space ? [] : [{
    id: `move-${s.id}`, icon: null, tip: `${String(i + 1).padStart(2, "0")}  ${s.name}`, ask: "move", more: { space: s.id },
    why: movePlan(chat, spaces, panes, s.id).problem ?? null,
  }]));
  return { pane, actions: [rename, ...plate], moves, close: closeAction(closePlan(tab.id, panes)) };
}
