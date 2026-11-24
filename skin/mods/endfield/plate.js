// plate: what a pane's name plate offers, by the kind of pane, with no Herdr in it
// (tests/plate.test.mjs runs it in node). pane.js draws the tray and the right-click menu from it,
// and status.js runs the same actions from keys.
//
// Kind: "agent" (its terminal runs an agent), "shell", "program" (any other terminal), "mod".
// The last action ends nothing on an agent: Hide parks its terminal (terminal.park), so the pane
// goes and the agent keeps running and stays in Squads. Ending an agent is the session card's
// Archive. On any other pane it is Herdr's pane.close, which ends what runs there.
//
// Action: {id, icon, tip, keys (keys.json actions that do the same, for the tooltip), run
//   ({cmd, args}) | ask ("hide" | "popout": the agents list runs it, as it runs dock moves), danger,
//   why (the menu greys it out and says why), on (the zoomed pane's icon and tip)}
// Hidden: {terminal, created (its created_ms, so a reused address is not it), space, tab, at}.

export const kindOf = (p) => (!p?.terminal ? "mod" : p.program?.agent ? "agent" : p.program?.shell ? "shell" : "program");

const END = {
  agent: { id: "hide", icon: "close", tip: "Hide (keeps running)", keys: ["endfield.hidePane"], ask: "hide" },
  shell: { id: "close", icon: "close", tip: "Close (ends this shell)", keys: ["endfield.hidePane", "pane.close"], cmd: "pane.close", danger: true },
  program: { id: "close", icon: "close", tip: "Close (ends this program)", keys: ["endfield.hidePane", "pane.close"], cmd: "pane.close", danger: true },
  mod: { id: "close", icon: "close", tip: "Close", keys: ["endfield.hidePane", "pane.close"], cmd: "pane.close" },
};

// In tray and menu order. alone: what a one-pane tab says instead (Herdr doesn't zoom it, and
// there is nothing to pop out of). terminal: only a terminal's pane has one to move.
const ACTIONS = [
  { id: "split", icon: "split-right", tip: "Split right", keys: ["pane.split:right"], cmd: "pane.split", args: { direction: "right" }, tray: true },
  { id: "down", icon: "split-down", tip: "Split down", keys: ["pane.split:down"], cmd: "pane.split", args: { direction: "down" } },
  { id: "zoom", icon: "zoom", tip: "Fill the tab", keys: ["endfield.zoomPane", "pane.zoom"], cmd: "pane.zoom", tray: true, alone: "It is the only pane in this tab",
    on: { icon: "unzoom", tip: "Back to the split" } },
  { id: "pop", icon: "pop-out", tip: "Pop out to its own tab", keys: ["endfield.popOut"], ask: "popout", tray: true, terminal: true, alone: "It already has the tab to itself" },
];

const resolve = (a, p) => {
  const { cmd, args, tray: _t, terminal: _x, alone: _a, on, ...rest } = a;
  const now = p.zoomed && on ? { ...rest, ...on } : rest;
  return cmd ? { ...now, run: { cmd, args: { ...args, pane: p.pane } } } : now;
};

/** The action that takes the pane away: Hide on an agent, Close on anything else. */
export const endAction = (p) => resolve(END[kindOf(p)], p);

/**
 * What the plate offers pane p (a panes() entry) in a tab of `count` panes. "tray": the buttons,
 * only what can run now. "menu": the right-click menu, every action, the ones that can't run greyed with why.
 */
export function plateActions(p, count, where = "tray") {
  const out = [];
  for (const a of ACTIONS) {
    if (a.terminal && !p.terminal) continue;
    const why = a.alone && count < 2 ? a.alone : null;
    if (where === "tray" && (!a.tray || why)) continue;
    out.push(why ? { ...resolve(a, p), why } : resolve(a, p));
  }
  return [...out, endAction(p)];
}

/** The tooltip: the action, then the first key bound to one of its keys actions ("Split right (Ctrl+Shift+O)"). */
export const tipOf = (a, bindingOf) => {
  const key = (a.keys ?? []).map(bindingOf).find(Boolean);
  return key ? `${a.tip} (${key})` : a.tip;
};

// A Hide just written may still have its pane for the park's round trip (about 1.5s locally).
const HIDE_GRACE_MS = 10000;
export const HIDDEN_CAP = 50;

/** The record a Hide writes, from the terminal (terminals()) and where its pane was. */
export const hiddenOf = (t, where, now) => ({ terminal: t.address, created: t.created_ms ?? 0, space: where?.space ?? null, tab: where?.tab ?? null, at: now });

/**
 * The records still worth keeping: their terminal is live and the same one, and it has no pane
 * again (past the grace a Hide's park takes). shown: addresses that have a pane. Newest CAP.
 */
export function keptHidden(records, terms, shown, now) {
  const live = new Map(terms.filter((t) => t.state === "live").map((t) => [t.address, t]));
  const has = new Set(shown);
  return records.filter((r) => r && live.has(r.terminal) && (live.get(r.terminal).created_ms ?? 0) === r.created &&!(has.has(r.terminal) && now - r.at > HIDE_GRACE_MS)).slice(-HIDDEN_CAP);
}
