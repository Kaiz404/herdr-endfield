// pane: a pane's header in the layout's pane frame, drawn as a name plate. Ported from the shipped
// `pane` mod: live facts from panes(), click to focus, divider on the terminal-facing edge read from
// layout(). An agent's pane carries its operator's chip; when that agent needs input while its pane
// has focus, the plate pulses yellow instead of a cut-in.
// Its actions follow an editor group's in VS Code (plate.js says which, per kind of pane): Split
// right, Zoom, Pop out and Hide or Close sit at the right end, muted until the plate is hovered or
// focused. Double-click toggles Zoom, middle-click is the last action, right-click opens them all
// as a menu (the `panemenu` popup). Hide and Pop out run in the agents list (docking.js askPane).

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { panes, props, run, layout, shared, focused, openOverlay, closeOverlay, agents } from "herdr";

// A pane as the plate rules read it, with whether Herdr lists its terminal as an agent (plate.js kindOf).
const listed = (x) => (x ? { ...x, listed: agents().some((a) => a.address === x.terminal) } : x);
import { palette, root, stop, midTrunc, statusMark, badge, chip, hazard, micro, spaced, wide, icon, basename, telling, growDisc, binding, Entrance, StatusFx, MOTION } from "./kit.js";
import { roster } from "./roster.js";
import { PANE_ROLES, paneRole } from "./fleet.js";
import { plateActions, endAction, tipOf } from "./plate.js";
import { askPane } from "./docking.js";

// The first visible tab frame, including the active child of a stack.
function paneFrame(node) {
  if (!node || node.hidden) return null;
  if (node.content?.tab && node.content.pane) return node.content.pane;
  let children = node.children ?? [];
  if (node.type === "stack") {
    const visible = children.filter((child) => !child.hidden);
    children = [visible.find((child) => child.id === node.active) ?? visible[0]];
  }
  for (const child of children) {
    const frame = paneFrame(child);
    if (frame) return frame;
  }
  return null;
}

const BUTTON = 22, GAP = 2, RULE = 9;
const MENU = { w: 250, row: 30, pad: 6, title: 26 };

const tabCount = (p) => panes().filter((x) => x.tab === p.tab).length;

/** Runs a plate.js action on pane p. */
export function perform(a, p) {
  if (a.ask) askPane(a.ask, p.terminal);
  else run(a.run.cmd, a.run.args);
}

/** A key command (status.js): plate action `id` on the focused pane, or its last action for "end". */
export function actOnFocused(id) {
  const p = listed(panes().find((x) => x.pane === focused()?.pane));
  if (!p) return;
  const a = id === "end" ? endAction(p) : plateActions(p, tabCount(p), "menu").find((x) => x.id === id && !x.why);
  if (a) perform(a, p);
}

const openPaneMenu = (pane, n) => openOverlay({ mod: "endfield", kind: "popup", width: MENU.w, height: MENU.title + n * MENU.row + 2 * MENU.pad, props: { role: "panemenu", pane } });

export default class PaneHeader {
  init(_props, cx) {
    this.hovered = false;
    this.hot = null;
    this.fx = new StatusFx();
    this.entrance = new Entrance(2);
    this.entrance.start(cx);
  }

  render(cx) {
    const C = palette();
    const p = listed(panes().find((x) => x.pane === props()?.pane));
    if (!p) return div();
    const frame = paneFrame(layout())?.header;
    const height = frame?.height ?? 34;
    const bottom = frame?.position === "bottom";
    const m = p.terminal && p.program?.agent ? roster().all.get(p.terminal) : null;
    const role = paneRole(shared(PANE_ROLES), p);
    const name = (role === "comms" && "Comms") || (role === "transcript" && "Transcript") || (p.program?.agent && telling(p)) || ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    // The skin's own pane (Comms) is named for what it is, with the "//" tile, not an unknown program.
    const comms = role === "comms";
    const where = comms ? ["Who sent what to whom"] : [m?.label, p.terminal?.toUpperCase(), basename(p.cwd), midTrunc(p.branch)];
    const pane = p.pane;
    const on = p.focused;
    const count = tabCount(p);
    const actions = plateActions(p, count);
    const open = this.hovered || on;
    const tray = RULE + actions.length * BUTTON + (actions.length - 1) * GAP;
    // Needs input while you are looking at it: the plate washes yellow and a hazard rule runs under it.
    // The roster's status, so an agent waiting on background work reads Waiting here as in Squads.
    const status = m?.status ?? p.status;
    const pulse = on && status === "blocked";
    this.fx.track(pane, status, cx);
    const fx = this.fx.of(pane);
    return root(C, this.entrance.apply(h_flex()
      .id(`pane-head-${pane}`)
      .relative()
      .size_full()
      .pr(8)
      .gap(10)
      .items_center()
      .bg(C.raised)
      .when(bottom, (el) => el.border_t(1))
      .when(!bottom, (el) => el.border_b(1))
      .border_color(C.hair)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click((e) => (e.click_count === 2 && count > 1 ? run("pane.zoom", { pane }) : run("pane.focus", { pane })))
      .on_mouse_down("middle", (_e, cx) => { cx.stop_propagation(); perform(endAction(p), p); })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openPaneMenu(pane, plateActions(p, count, "menu").length); })
      .when(pulse, (el) => el.child(div().absolute().left(0).top(0).right(0).bottom(0).bg(C.signal).loop("opacity", MOTION.pane.pulse)))
      .when(pulse, (el) => el.child(div().absolute().left(0).right(0).bottom(0).h(4).overflow_hidden().child(hazard(C, 4000, 4))))
      // Focus: the yellow bar grows down the hairline strip; a small square lights at the top right.
      .child(div().absolute().left(0).top(0).bottom(0).w(2).bg(C.hairStrong))
      .child(div().id(`ph-bar-${pane}`).absolute().left(0).top(0).w(6).h(on ? height : 0).bg(C.signal).transition("height", MOTION.pane.bar))
      .child(div().id(`ph-sq-${pane}`).absolute().right(4).top(4).size(4).bg(C.text).opacity(on ? 1 : 0).transition("opacity", MOTION.pane.fade))
      // The program's square tile: ink while focused.
      .child(div().relative().ml(6).size(height).flex_none().flex().items_center().justify_center().bg(on ? C.ink : C.sunken)
        .child(comms ? micro("//", on ? "#F2F2F2" : C.text, 12)
          : badge({ ...C, selBg: on ? C.ink : C.sunken, selText: on ? "#F2F2F2" : C.text }, on ? p.program : { ...p.program, tile: null, color: null }, 18)))
      .when(Boolean(m), (el) => el.child(div().relative().tooltip(m.ident.callsign).child(chip(C, m.ident, status, { size: 22, id: `ph-chip-${pane}`, flash: fx.flash ? fx : null, ground: C.raised }))))
      .child(wide(name, C.text, 12).relative().flex_shrink(1).min_w(0).truncate())
      .child(spaced(where, C.muted, { rest: C.dim }).relative().flex_shrink(2))
      .child(div().flex_1())
      // Zoomed: this pane fills its tab, the others wait behind it.
      .when(Boolean(p.zoomed), (el) => el.child(div().id(`ph-zoomed-${pane}`).relative().flex_none().h(18).px(7).flex().items_center().rounded(3)
        .border_1().border_color(C.hairStrong).tooltip("Fills the tab. Double-click the plate to go back to the split").child(micro("Zoomed", C.muted))))
      .child(div().relative().flex_none().child(pulse
        ? div().h(18).px(9).flex().items_center().rounded_full().bg(C.ink).text_color(C.signal).text_size(10).font_semibold().child("Needs input")
        : statusMark(C, status, { size: 11, id: `ph-disc-${pane}`, pop: fx.pop }) ?? div()))
      // The tray: open while the plate is hovered or focused; each button fades and slides in pane.actions after the one before.
      .child(h_flex().id(`ph-tray-${pane}`).relative().flex_none().h(BUTTON).overflow_hidden().w(open ? tray : 0)
        .transition("width", MOTION.pane.brackets)
        .child(div().w(1).h(14).mx(4).flex_none().bg(C.hair))
        .children(actions.map((a, i) => {
          const key = `${a.id}-${pane}`;
          const hot = this.hot === key;
          return div().id(`ph-${key}`).relative().size(BUTTON).flex_none().ml(i ? GAP : 0).flex().items_center().justify_center().rounded_full()
            .opacity(open ? 1 : 0).left(open ? 0 : 6)
            .transition("opacity", { ...MOTION.pane.fade, delay: i * MOTION.pane.actions.delay }).transition("left", { ...MOTION.pane.brackets, delay: i * MOTION.pane.actions.delay })
            .text_color(hot ? (a.danger ? C.ink : C.text) : this.hovered || on ? C.text : C.muted)
            .when(!a.danger, (el) => el.hover((s) => s.bg(C.sunken)))
            .tooltip(tipOf(a, binding))
            .on_hover((over, cx) => { if (over) this.hot = key; else if (this.hot === key) this.hot = null; cx.notify(); })
            .on_mouse_down("left", stop)
            // A middle press on a button must not reach the plate, whose middle-click runs the ✕.
            .on_mouse_down("middle", stop)
            .on_click((_e, cx) => { cx.stop_propagation(); if (open) perform(a, p); })
            .when(Boolean(a.danger), (el) => el.child(growDisc(`ph-disc-${key}`, BUTTON, BUTTON, BUTTON, hot, C.red)))
            .child(icon(a.icon, 12).relative());
        })))));
  }
}

/** The plate's right-click menu: every plate.js action for the pane, each with its key. props {role: "panemenu", pane}. */
export class PaneMenu {
  pick(p, pane, a) {
    closeOverlay(p.overlay);
    perform(a, pane);
  }

  render() {
    const C = palette();
    const p = props();
    const pane = listed(panes().find((x) => x.pane === p.pane));
    if (!pane) return root(C, v_flex().w_full().p(MENU.pad).bg(C.raised).child(micro("Gone", C.muted)));
    return root(C, v_flex().w_full().p(MENU.pad).bg(C.raised)
      .child(div().h(MENU.title).px(8).flex().items_center().child(micro(pane.title || pane.program?.name || "Pane", C.muted).truncate()))
      .children(plateActions(pane, tabCount(pane), "menu").map((a) => {
        const key = (a.keys ?? []).map(binding).find(Boolean);
        return h_flex().id(`pm-${a.id}`).h(MENU.row).px(8).gap(10).rounded(3).items_center().text_size(12.5).font_medium()
          .when(Boolean(a.why), (el) => el.opacity(0.45).tooltip(a.why))
          .when(!a.why, (el) => el.cursor_pointer().hover((h) => h.bg(C.sunken)).on_click(() => this.pick(p, pane, a)))
          .child(div().flex_none().text_color(C.muted).child(icon(a.icon, 12)))
          .child(div().flex_1().child(a.tip))
          .when(Boolean(key), (el) => el.child(micro(key, C.muted).flex_none()));
      })));
  }
}
