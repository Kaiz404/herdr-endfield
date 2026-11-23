// toast: every notification (Herdr's own and notify()), the layout's `toast` mod. Herdr gives it
// props {title, body, level, icon, action, timeout, overlay} and no role; main.js routes it here.
// Ported from the shipped `toast`: click runs the action and closes, the host owns the timeout,
// and a machine-login body gets a Copy button.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, agents, spaces } from "herdr";
import { palette, root, micro, MOTION, FONT } from "./kit.js";

// A level's edge and glyph; an agent's news reads in its status's colours, whatever level the host gave it.
const LEVEL = {
  info: { edge: "flow", glyph: "i" },
  success: { edge: "lime", glyph: "✓" },
  warning: { edge: "signal", glyph: "!" },
  error: { edge: "red", glyph: "×" },
  done: { edge: "lime", glyph: "✓" },
  blocked: { edge: "signal", glyph: "!" },
};

// Where the news comes from: the agent or space its action goes to, else Herdr itself.
function origin(p) {
  const a = p.action?.args ?? {};
  const agent = agents().find((x) => x.address === a.terminal || x.pane === a.pane);
  if (agent) return { name: agent.space_name, status: agent.status };
  const space = spaces().find((s) => s.id === a.id || s.id === a.space);
  return { name: space?.name ?? "herdr", status: null };
}

export class Toast {
  init() {
    this.phase = "new";
    this.width = 0;
  }

  // Slide out, then run the action and close (the host's own timeout closes without it).
  leave(p, cx) {
    if (this.phase === "leaving") return;
    this.phase = "leaving";
    cx.notify();
    cx.timer.after(MOTION.toast.enter.duration, () => {
      if (p.action?.name) run(p.action.name, p.action.args ?? {});
      closeOverlay(p.overlay);
    });
  }

  render() {
    const C = palette();
    const p = props() ?? {};
    const from = (this.from ??= origin(p));
    const level = LEVEL[from.status] ?? LEVEL[p.level] ?? LEVEL.info;
    const edge = C[level.edge];
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    const shown = this.phase === "shown";
    return root(C, h_flex()
      .id("toast")
      .relative()
      .size_full()
      .bg(C.raised)
      .cursor_pointer()
      .hover((s) => s.bg(C.sunken))
      // Enters from the right on its first layout; leaves the same way.
      .opacity(shown ? 1 : 0).left(shown ? 0 : 40)
      .transition("opacity", MOTION.toast.fade).transition("left", MOTION.toast.enter)
      .on_size_change((size, cx) => {
        this.width = size.width;
        if (this.phase === "new") cx.timer.after(MOTION.settle.delay, (cx) => { if (this.phase === "new") this.phase = "shown"; cx.notify(); });
        cx.notify();
      })
      .on_click((_e, cx) => this.leave(p, cx))
      .child(div().w(3).h_full().flex_none().bg(edge))
      // The time left, as a hairline running out along the bottom.
      .when(Boolean(p.timeout) && this.width > 0, (el) => el.child(div().id("toast-count").absolute().left(0).bottom(0).h(2).bg(edge)
        .w(shown ? 0 : this.width).transition("width", { ...MOTION.toast.countdown, duration: Math.max(0, Number(p.timeout)) })))
      .child(v_flex().flex_1().min_w(0).h_full().justify_center().pl(12).pr(14).gap(6)
        .child(h_flex().min_w(0).gap(8).items_center()
          .child(div().size(18).flex_none().rounded_full().bg(edge).flex().items_center().justify_center()
            .text_size(11).font_weight(700).text_color(C.ink).child(level.glyph))
          .child(div().flex_1().min_w(0).truncate().text_size(13).font_semibold().child(login ? `${login[1]} needs a login` : p.title ?? ""))
          .child(micro(`// ${from.name}`, C.muted).flex_none()))
        .when(!login && Boolean(p.body), (el) => el.child(div().pl(26).truncate().text_size(12).text_color(C.muted).child(p.body ?? "")))
        .when(!login && Boolean(p.action?.name), (el) => el.child(h_flex().pl(26).pt(2)
          .child(h_flex().id("toast-open").h(22).px(11).gap(5).items_center().rounded_full().bg(C.signal).hover((s) => s.bg(C.signalHover))
            .on_hover((over, cx) => { this.hot = over; cx.notify(); })
            .child(div().text_size(11.5).font_semibold().text_color(C.ink).child("Open"))
            .child(div().id("toast-chev").relative().left(this.hot ? 4 : 0).transition("left", MOTION.row.nudge)
              .text_size(8).text_color(C.ink).child("▶▶")))))
        .when(Boolean(login), (el) => el.child(h_flex().pl(26).gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().tooltip(command).font_family(FONT.mono).text_size(11.5).text_color(C.muted).child(command))
          .child(div().id("toast-login-copy").flex_none().px(10).h(22).flex().items_center().rounded_full().border_1().border_color(C.hairStrong)
            .text_size(12).font_medium().hover((s) => s.bg(C.hair))
            .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
            .child(this.copied ? "Copied" : "Copy"))))));
  }
}
