// dock: moving a chat (its terminal) beside the focused pane, or into another squad, with no Herdr
// in it (tests/dock.test.mjs runs it in node). docking.js draws the drop zones and runs the steps.
// Herdr has no "move pane to tab": terminal.park takes the pane away and leaves the program running
// (no pane, no labels, keep off), pane.focus shows the tab it lands in, and terminal.keep gives it a
// pane right of or below the focused one (labels and keep back). Nothing is typed into the chat, so
// an agent that is working or waits on a question moves too; its question is still on its screen.
//
// Place: where a chat is shown, or the pane it would land beside.
//   {pane: string | null, tab: string | null, space: string | null, machine: string | null}
// A chat also carries {terminal, linked (the agent it is linked with in its squad, or null)}.
// Step: {cmd, args, wait, own?, beside?}: wait names what panes() and focused() show once Herdr has
// applied it ("gone", "focused", "shown", or null); own: args.pane is the chat's pane once it has
// one; beside: the pane that must hold the focus when a keep runs, since keep splits whatever does.

/**
 * Where each zone lands, as a terminal.keep place and whether a pane.swap with the focused pane
 * follows (left and top: keep can only place right or down). The centre splits right too, so a
 * drop never replaces or closes a pane.
 */
export const ZONES = {
  left: { place: "right", swap: true, label: "Left of the focused pane" },
  right: { place: "right", swap: false, label: "Right of the focused pane" },
  top: { place: "down", swap: true, label: "Above the focused pane" },
  bottom: { place: "down", swap: false, label: "Below the focused pane" },
  centre: { place: "right", swap: false, label: "Split beside the focused pane" },
};

// The middle half of the work area each way is the centre; the rest goes to the nearest edge.
const CENTRE = 0.25;

/** The zone under point p ({x, y}) in rect r ({x, y, w, h}), or null outside it. */
export function zoneAt(p, r) {
  if (!p || !r || r.w <= 0 || r.h <= 0) return null;
  const u = (p.x - r.x) / r.w, v = (p.y - r.y) / r.h;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  if (u >= CENTRE && u <= 1 - CENTRE && v >= CENTRE && v <= 1 - CENTRE) return "centre";
  const edges = [["left", u], ["right", 1 - u], ["top", v], ["bottom", 1 - v]];
  return edges.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
}

/**
 * The part of rect r a zone's chat would take, as the dock board previews it. panes() gives no
 * rectangles, so this is a half of the work area, not of the focused pane.
 */
export function landing(zone, r) {
  const half = { w: r.w / 2, h: r.h / 2 };
  switch (zone) {
    case "left": return { x: r.x, y: r.y, w: half.w, h: r.h };
    case "top": return { x: r.x, y: r.y, w: r.w, h: half.h };
    case "bottom": return { x: r.x, y: r.y + half.h, w: r.w, h: half.h };
    case "right": case "centre": return { x: r.x + half.w, y: r.y, w: half.w, h: r.h };
    default: return null;
  }
}

/**
 * Which side of the list's bounds ({x, y, width, height}) the pointer left by, from its last
 * position inside: the nearest edge. The sidebar is the layout's left column, so "right" is the
 * work area.
 */
export function exitSide(p, b) {
  if (!p || !b) return null;
  const sides = [["left", p.x - b.x], ["right", b.x + b.width - p.x], ["top", p.y - b.y], ["bottom", b.y + b.height - p.y]];
  return sides.reduce((a, s) => (s[1] < a[1] ? s : a))[0];
}

/** The layout node with this id, or null. */
export function nodeOf(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) { const n = nodeOf(c, id); if (n) return n; }
  return null;
}

// Herdr sets a floating block this far in from its node's edges, and draws a frame this far above and below it.
const FLOAT = { inset: 12, frame: 5 };

/**
 * The dock board's box, in the px a mod lays out in. The board is the `dock` floating block over
 * work-body: the window (`view` {width, height}, in window px at `zoom`) right of the sidebar,
 * under the tab strip and over the status bar, as the layout tree (layout()) sizes them, less
 * Herdr's float inset and frame. A hidden or missing node counts as 0. Its origin is the board's
 * own corner, since the board reads the pointer against its own box. Null with no room.
 */
export function boardRect(view, zoom, tree) {
  if (!view || !(zoom > 0)) return null;
  const px = (id) => { const n = nodeOf(tree, id); return !n || n.hidden ? 0 : Number(n.size?.px) || 0; };
  const w = view.width / zoom - px("sidebar") - 2 * FLOAT.inset;
  const h = view.height / zoom - px("tabs") - px("status") - 2 * (FLOAT.inset + FLOAT.frame);
  return w > 0 && h > 0 ? { x: 0, y: 0, w, h } : null;
}

// How far under the tab strip a held tab is carried before it docks: a reorder that dips stays a reorder.
const STRIP_SLACK = 12;

/** Whether a pointer at `local` ({x, y} against the tab strip's box, `bounds`) has been carried out under the strip. */
export function underStrip(local, bounds) {
  return Boolean(local && bounds) && local.y > bounds.height + STRIP_SLACK;
}

/** A zone's slab before it opens: no thickness, on the edge it grows from (the centre grows from the right, where it lands). */
export function collapsed(zone, r) {
  switch (zone) {
    case "left": return { x: r.x, y: r.y, w: 0, h: r.h };
    case "top": return { x: r.x, y: r.y, w: r.w, h: 0 };
    case "bottom": return { x: r.x, y: r.y + r.h, w: r.w, h: 0 };
    default: return { x: r.x + r.w, y: r.y, w: 0, h: r.h };
  }
}

/** The machine in an address or id ("box/t6" -> "box"), null for this computer. */
export const machineOf = (id) => (typeof id === "string" && id.includes("/") ? id.split("/")[0] : null);

/**
 * How chat lands at `zone` beside the pane `anchor` (a Place). -> {steps, label, whole?} or
 * {problem}: a problem is shown in the zone and a drop there does nothing; label is what the slab
 * says. A chat with no pane (an hc child) skips the park.
 * A chat already in the anchor's tab trades places with it (Herdr's own swap, no park) from every
 * zone: panes() gives no rectangles, so which side of the focused pane it is on now can't be read,
 * and a zone can't promise a side. whole: the slab covers the work area, not one half of it.
 */
export function dockPlan(chat, anchor, zone) {
  const z = ZONES[zone];
  if (!z) return { problem: "Drop on the work area" };
  if (!anchor?.pane) return { problem: "Focus a pane in the work area first" };
  if ((chat.machine ?? null) !== (anchor.machine ?? null)) return { problem: "It runs on another machine" };
  if (chat.pane === anchor.pane) return { problem: "It is the focused pane" };
  if (chat.linked && chat.space !== anchor.space) return { problem: `Linked to ${chat.linked} in its squad. Unlink it first` };
  if (chat.pane && chat.tab === anchor.tab) {
    return { steps: [{ cmd: "pane.swap", args: { pane: chat.pane, target: anchor.pane }, wait: null }], label: "Trade places with the focused pane", whole: true };
  }
  const steps = [];
  if (chat.pane) steps.push({ cmd: "terminal.park", args: { terminal: chat.terminal }, wait: "gone" });
  steps.push({ cmd: "pane.focus", args: { pane: anchor.pane }, wait: "focused" });
  steps.push({ cmd: "terminal.keep", args: { terminal: chat.terminal, place: z.place }, wait: "shown", beside: anchor.pane });
  if (z.swap) steps.push({ cmd: "pane.swap", args: { target: anchor.pane }, wait: null, own: true });
  return { steps, label: z.label };
}

// A squad header becomes a move target only after this much travel from the press and this long
// under the pointer, so a wobble at a row's edge never moves an agent.
export const ARM = { px: 16, ms: 250 };

/** Whether a held row over a squad header may drop there. p0, pt: the press and the pointer now; since, now: when it came over the header, and now (ms). */
export function headerArmed(p0, pt, since, now) {
  if (!p0 || !pt || since == null) return false;
  return Math.hypot(pt.x - p0.x, pt.y - p0.y) >= ARM.px && now - since >= ARM.ms;
}

/**
 * The pane a chat goes back beside when its move fails after the park: another pane of the tab it
 * came from (the focused one, else a terminal's, else the first). Null when it was alone there.
 */
export function homeOf(panes, chat) {
  const here = panes.filter((p) => p.tab === chat.tab && p.pane !== chat.pane);
  return (here.find((p) => p.focused) ?? here.find((p) => p.terminal) ?? here[0])?.pane ?? null;
}

/** Where a terminal is shown: {pane, tab, name (its space's), index (its tab's)}, or null with no pane. */
export function whereIs(terminal, panes, spaces) {
  const p = panes.find((x) => x.terminal === terminal);
  if (!p) return null;
  const s = spaces.find((x) => x.tabs.some((t) => t.id === p.tab));
  return { pane: p.pane, tab: p.tab, name: s?.name ?? null, index: s?.tabs.find((t) => t.id === p.tab)?.index ?? null };
}

/**
 * What to tell the person once a move has stopped: null when the chat is in the tab it was sent
 * to (`tab`), else where it is now (`at`, from whereIs) and how to show it again.
 */
export function moveToast(chat, tab, at) {
  if (at && at.tab === tab) return null;
  const who = `${chat.label ?? "chat"} ${chat.terminal}`;
  const show = `herdr-app do terminal.keep --terminal ${chat.terminal}, or hc attach ${chat.terminal} in a terminal`;
  if (!at) return { title: `${who} has no pane`, level: "error", body: `The move didn't finish. It keeps running. Show it again with ${show}.` };
  const place = `${at.name ?? "its squad"}${at.index == null ? "" : `, tab ${at.index}`}`;
  return { title: `Couldn't move ${who}`, level: "warning",
    body: `It keeps running in ${place}${at.tab === chat.tab ? ", where it came from" : ""}. If it loses its pane, show it with ${show}.` };
}

/**
 * The pane a chat moved into squad `space` lands beside: the one focused in the tab that space
 * shows (its most recent), else that tab's first terminal pane, else its first pane. panes():
 * [{pane, terminal, tab, focused}]; spaces(): [{id, machine, tabs: [{id, active, index}]}].
 */
export function anchorIn(spaces, panes, space) {
  const s = spaces.find((x) => x.id === space);
  if (!s) return null;
  const tabs = [...s.tabs].sort((a, b) => Number(b.active) - Number(a.active) || a.index - b.index);
  for (const t of tabs) {
    const here = panes.filter((p) => p.tab === t.id);
    const p = here.find((x) => x.focused) ?? here.find((x) => x.terminal) ?? here[0];
    if (p) return { pane: p.pane, tab: t.id, space: s.id, machine: s.machine ?? null };
  }
  return null;
}

/** A drop on squad `space`'s header: the chat joins it, right of the pane its shown tab has focused. */
export function movePlan(chat, spaces, panes, space) {
  if (chat.space === space) return { problem: "Already in this squad" };
  const name = spaces.find((s) => s.id === space)?.name ?? "that squad";
  const anchor = anchorIn(spaces, panes, space);
  if (!anchor) return { problem: `${name} has no pane to split` };
  return dockPlan(chat, anchor, "right");
}

/** Whether Herdr shows what step s waits for. panes: panes(); focus: focused()?.pane. */
export function applied(s, chat, panes, focus) {
  const pane = panes.find((p) => p.terminal === chat)?.pane ?? null;
  if (s.wait === "gone") return !pane;
  if (s.wait === "shown") return Boolean(pane);
  if (s.wait === "focused") return focus === s.args.pane;
  return true;
}
