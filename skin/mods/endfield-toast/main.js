// Endfield's notifications: a slab whose level lives on a 3px edge and a round glyph.
// Ported from the shipped `toast`: click runs the action and closes, the host owns
// the timeout, and a machine-login body gets a Copy button.
// The toast gets no role prop, so it is its own mod; it repeats the few palette
// entries it needs because mods can't import each other.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, settings, agents, spaces } from "herdr";

const PALETTE = {
  paper: { raised: "#FFFFFF", hover: "#F6F6F5", hair: "#D9D9D9", hairStrong: "#BDBDBD", text: "#191919", muted: "#666666" },
  night: { raised: "#1F1F1F", hover: "#262626", hair: "#2C2C2C", hairStrong: "#3D3D3D", text: "#EDEDED", muted: "#A0A0A0" },
};
const LEVEL = {
  info: { edge: "#31ACF0", glyph: "i" },
  success: { edge: "#BBCC2B", glyph: "✓" },
  warning: { edge: "#FFFA00", glyph: "!" },
  error: { edge: "#FF3F43", glyph: "×" },
};
// An agent's news reads in its status's colours, whatever level the host gave it.
const AGENT = {
  done: { edge: "#BBCC2B", glyph: "✓" },
  blocked: { edge: "#FFFA00", glyph: "!" },
};
const INK = "#191919";

// Where the news comes from: the agent or space its action goes to, else Herdr itself.
function origin(p) {
  const a = p.action?.args ?? {};
  const agent = agents().find((x) => x.address === a.terminal || x.pane === a.pane);
  if (agent) return { name: agent.space_name, status: agent.status };
  const space = spaces().find((s) => s.id === a.id || s.id === a.space);
  return { name: space?.name ?? "herdr", status: null };
}

const PULSE = 200, PULSES = 3, LEAVE = 300;

export default class Toast extends View {
  init() {
    this.phase = "new";
    this.width = 0;
  }

  // Slide out, then run the action and close (the host's own timeout closes without it).
  leave(p, cx) {
    if (this.phase === "leaving") return;
    this.phase = "leaving";
    cx.notify();
    cx.timer.after(LEAVE, () => {
      if (p.action?.name) run(p.action.name, p.action.args ?? {});
      closeOverlay(p.overlay);
    });
  }

  render() {
    const C = PALETTE[settings()?.dark ? "night" : "paper"];
    const p = props() ?? {};
    const from = (this.from ??= origin(p));
    const level = AGENT[from.status] ?? LEVEL[p.level] ?? LEVEL.info;
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    const micro = (text) => div().flex_none().font_family("Geist Mono").text_size(10).line_height(1).text_color(C.muted).child(text.toUpperCase());
    return h_flex()
      .id("toast")
      .relative()
      .size_full()
      .font_family("Geist")
      .bg(C.raised)
      .cursor_pointer()
      .hover((s) => s.bg(C.hover))
      // Entrance: three opacity pulses (a native loop), ended by one one-shot timer; exit: slide right and fade.
      .when(this.phase === "flicker", (el) => el.loop("opacity", { from: 0, to: 1, period: PULSE, easing: "linear" }))
      .opacity(this.phase === "leaving" ? 0 : 1)
      .left(this.phase === "leaving" ? 40 : 0)
      .transition("opacity", { duration: 200, easing: "ease-in" })
      .transition("left", { duration: LEAVE, easing: "ease-in" })
      .on_size_change((size, cx) => {
        this.width = size.width;
        if (this.phase === "new") {
          this.phase = "flicker";
          // The flicker's end also starts the countdown: its first frame drew it full.
          cx.timer.after(PULSE * PULSES, (cx) => { if (this.phase === "flicker") this.phase = "shown"; cx.notify(); });
        }
        cx.notify();
      })
      .on_click((_e, cx) => this.leave(p, cx))
      .child(div().w(3).h_full().flex_none().bg(level.edge))
      // The time left, as a hairline running out along the bottom.
      .when(Boolean(p.timeout) && this.width > 0, (el) => el.child(div().id("toast-count").absolute().left(0).bottom(0).h(2).bg(level.edge)
        .w(this.phase === "flicker" ? this.width : 0).transition("width", { duration: Math.max(0, Number(p.timeout) - PULSE * PULSES), easing: "linear" })))
      .child(v_flex().flex_1().min_w(0).h_full().justify_center().pl(12).pr(14).gap(6)
        .child(h_flex().min_w(0).gap(8).items_center()
          .child(div().size(18).flex_none().rounded_full().bg(level.edge).flex().items_center().justify_center()
            .text_size(11).font_weight(700).text_color(INK).child(level.glyph))
          .child(div().flex_1().min_w(0).truncate().text_size(13).font_semibold().text_color(C.text).child(login ? `${login[1]} needs a login` : p.title ?? ""))
          .child(micro(`// ${from.name}`)))
        .when(!login && Boolean(p.body), (el) => el.child(div().pl(26).truncate().text_size(12).text_color(C.muted).child(p.body ?? "")))
        .when(!login && Boolean(p.action?.name), (el) => el.child(h_flex().pl(26).pt(2)
          .child(h_flex().id("toast-open").h(22).px(11).gap(5).items_center().rounded_full().bg("#FFFA00").hover((s) => s.bg("#EFE701"))
            .on_hover((over, cx) => { this.hot = over; cx.notify(); })
            .child(div().text_size(11.5).font_semibold().text_color(INK).child("Open"))
            .child(div().id("toast-chev").relative().left(this.hot ? 4 : 0).transition("left", { duration: 200, easing: "ease-out" })
              .text_size(8).text_color(INK).child("▶▶")))))
        .when(Boolean(login), (el) => el.child(h_flex().pl(26).gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().tooltip(command).font_family("Geist Mono").text_size(11.5).text_color(C.muted).child(command))
          .child(div().id("toast-login-copy").flex_none().px(10).h(22).flex().items_center().rounded_full().border_1().border_color(C.hairStrong)
            .text_size(12).font_medium().text_color(C.text).hover((s) => s.bg(C.hair))
            .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
            .child(this.copied ? "Copied" : "Copy")))));
  }
}
