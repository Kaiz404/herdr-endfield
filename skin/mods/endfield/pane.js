// pane: a pane's header in the layout's pane frame, drawn as a name plate. Ported from the shipped
// `pane` mod: live facts from panes(), click to focus, split/zoom/close on hover, divider on the
// terminal-facing edge read from layout(). An agent's pane carries its operator's chip; when that
// agent needs input while its pane has focus, the plate pulses yellow instead of a cut-in.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, layout, shared } from "herdr";
import { palette, root, stop, midTrunc, statusMark, badge, chip, hazard, micro, spaced, wide, icon, basename, telling, growDisc, Entrance, StatusFx, MOTION } from "./kit.js";
import { roster } from "./roster.js";
import { PANE_ROLES, paneRole } from "./fleet.js";

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

const ACTIONS = [
  { id: "r", icon: "split-right", tip: "Split right", command: "pane.split", args: (pane) => ({ direction: "right", pane }) },
  { id: "d", icon: "split-down", tip: "Split down", command: "pane.split", args: (pane) => ({ direction: "down", pane }) },
  { id: "z", icon: "zoom", zoomed: "unzoom", tip: "Zoom", command: "pane.zoom", args: (pane) => ({ pane }) },
  { id: "x", icon: "close", tip: "Close pane", command: "pane.close", args: (pane) => ({ pane }), danger: true },
];
const BUTTON = 22, GAP = 2, RULE = 9;
// The tray's open width: the divider and its margins, then the buttons.
const TRAY = RULE + ACTIONS.length * BUTTON + (ACTIONS.length - 1) * GAP;

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
    const p = panes().find((x) => x.pane === props()?.pane);
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
    const open = this.hovered;
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
      .on_click(() => run("pane.focus", { pane }))
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
      .child(div().relative().flex_none().child(pulse
        ? div().h(18).px(9).flex().items_center().rounded_full().bg(C.ink).text_color(C.signal).text_size(10).font_semibold().child("Needs input")
        : statusMark(C, status, { size: 11, id: `ph-disc-${pane}`, pop: fx.pop }) ?? div()))
      // The tray opens on hover; each button fades and slides in pane.actions after the one before.
      .child(h_flex().id(`ph-tray-${pane}`).relative().flex_none().h(BUTTON).overflow_hidden().w(open ? TRAY : 0)
        .transition("width", MOTION.pane.brackets)
        .child(div().w(1).h(14).mx(4).flex_none().bg(C.hair))
        .children(ACTIONS.map((a, i) => {
          const key = `${a.id}-${pane}`;
          const hot = this.hot === key;
          return div().id(`ph-${key}`).relative().size(BUTTON).flex_none().ml(i ? GAP : 0).flex().items_center().justify_center().rounded_full()
            .opacity(open ? 1 : 0).left(open ? 0 : 6)
            .transition("opacity", { ...MOTION.pane.fade, delay: i * MOTION.pane.actions.delay }).transition("left", { ...MOTION.pane.brackets, delay: i * MOTION.pane.actions.delay })
            .text_color(hot ? (a.danger ? C.ink : C.text) : C.muted)
            .when(!a.danger, (el) => el.hover((s) => s.bg(C.sunken)))
            .tooltip(p.zoomed && a.zoomed ? "Unzoom" : a.tip)
            .on_hover((over, cx) => { if (over) this.hot = key; else if (this.hot === key) this.hot = null; cx.notify(); })
            .on_mouse_down("left", stop)
            .on_click((_e, cx) => { cx.stop_propagation(); if (open) run(a.command, a.args(pane)); })
            .when(Boolean(a.danger), (el) => el.child(growDisc(`ph-disc-x-${pane}`, BUTTON, BUTTON, BUTTON, hot, C.red)))
            .child(icon(p.zoomed && a.zoomed ? a.zoomed : a.icon, 12).relative());
        })))));
  }
}
