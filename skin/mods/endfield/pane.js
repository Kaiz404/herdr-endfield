// pane: a pane's header in the layout's pane frame. Ported from the shipped `pane`
// mod: live facts from panes(), click to focus, split/zoom/close on hover, divider
// on the terminal-facing edge read from layout().

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, layout } from "herdr";
import { palette, root, stop, statusMark, badge, micro, icon, path, basename, telling, growDisc, Entrance, StatusFx, flicker, MOTION } from "./kit.js";

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
const HEIGHT = 30;

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
    const name = (p.program?.agent && telling(p)) || ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const where = [p.terminal, basename(p.cwd), p.branch].filter(Boolean).join(" · ");
    const bottom = paneFrame(layout())?.header?.position === "bottom";
    const pane = p.pane;
    const on = p.focused;
    const open = this.hovered;
    this.fx.track(pane, p.status, cx);
    const fx = this.fx.of(pane);
    return root(C, this.entrance.apply(h_flex()
      .id(`pane-head-${pane}`)
      .relative()
      .size_full()
      .pl(14)
      .pr(8)
      .gap(9)
      .items_center()
      .bg(C.raised)
      .when(bottom, (el) => el.border_t(1))
      .when(!bottom, (el) => el.border_b(1))
      .border_color(C.hair)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      // Focus: the yellow tab grows down the hairline tab, the corner bracket drops into place.
      .child(div().absolute().left(0).top(0).bottom(0).w(4).bg(C.hair))
      .child(div().id(`ph-tab-${pane}`).absolute().left(0).top(0).w(4).h(on ? HEIGHT : 0).bg(C.signal)
        .transition("height", MOTION.move))
      .child(div().id(`ph-brk-${pane}`).absolute().right(3).top(on ? 3 : -10).w(7).h(7).border_t(1.5).border_r(1.5).border_color(C.text)
        .opacity(on ? 1 : 0).transition("top", MOTION.move).transition("opacity", MOTION.fade))
      .child(badge(C, p.program, 16))
      .child(div().flex_shrink(1).min_w(0).child(path(name, C.text, C.muted, { size: 12.5, weight: 600 })))
      .child(micro(where, C.muted).flex_shrink(2).min_w(0).truncate())
      .child(div().flex_1())
      .child(flicker(div().flex_none(), fx.flicker).child(statusMark(C, p.status, { size: 11, id: `ph-disc-${pane}`, pop: fx.pop }) ?? div()))
      // The tray opens on hover; each button fades and slides in 40ms after the one before.
      .child(h_flex().id(`ph-tray-${pane}`).flex_none().h(BUTTON).overflow_hidden().w(open ? TRAY : 0)
        .transition("width", MOTION.move)
        .child(div().w(1).h(14).mx(4).flex_none().bg(C.hair))
        .children(ACTIONS.map((a, i) => {
          const key = `${a.id}-${pane}`;
          const hot = this.hot === key;
          return div().id(`ph-${key}`).relative().size(BUTTON).flex_none().ml(i ? GAP : 0).flex().items_center().justify_center().rounded(3)
            .opacity(open ? 1 : 0).left(open ? 0 : 6)
            .transition("opacity", { ...MOTION.fade, delay: i * MOTION.stagger.delay }).transition("left", { ...MOTION.move, delay: i * MOTION.stagger.delay })
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
