// cutin: the needs-input skill caption, an overlay window the toast role opens (Herdr's toast
// slot is too small for it). props: {role: "cutin", terminal, news: {title, body} | null, overlay}:
// news is the toast it replaced, shown when the screen gives no question.
// Placeholder-first: the ink slab, plate, band and hazard rule mount flat; the portrait fades in;
// a yellow block grows across the caption plate, holds, and retracts to its edge, revealing the
// caption. All of it is one state change plus MOTION delays. It stays until answered or Later,
// and closes itself once the agent stops needing input or its pane gets focus.

import { div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, hc, checking } from "herdr";
import { palette, root, micro, spaced, wide, hazard, dots, band, barcode, MOTION, ASSETS } from "./kit.js";
import { roster } from "./roster.js";
import { goTo } from "./report.js";

const PLATE = 328; // the caption plate's width: the slab, less its padding and the portrait column

export class CutIn {
  init(p, cx) {
    this.p = p;
    this.go = false;
    this.question = null;
    if (checking()) return;
    // The question: the last line on its screen that says something.
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["read", p.terminal, "--lines", "12"]);
        const lines = (r.stdout ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => /[\p{L}\p{N}]/u.test(l));
        this.question = lines.at(-1)?.replace(/^[?>›❯\u2022●\s]+/, "") ?? null;
      } catch {}
      cx.notify();
    });
  }

  close() { this.closed = true; }

  shut() {
    if (this.closed) return;
    this.closed = true;
    closeOverlay(props()?.overlay ?? this.p.overlay);
  }

  render() {
    const C = palette();
    const p = props() ?? this.p;
    const m = roster().all.get(p.terminal);
    if (!m || m.status !== "blocked" || m.focused) { this.shut(); return div(); }
    const go = this.go;
    // One cut-in at a time (one key): any other agent waiting is counted here, and the HUD lists them.
    const others = roster().flat.filter((x) => x.status === "blocked" && x.address !== m.address).length;
    const art = m.ident.avatar;
    const where = [`// ${m.spaceName}`, m.address.toUpperCase()];
    const news = [p.news?.title, p.news?.body].filter(Boolean);
    const knob = (id, glyph, bg, fg) => div().id(id).relative().left(this.hot === id ? 3 : 0).transition("left", MOTION.row.nudge)
      .size(20).rounded_full().bg(bg).flex().items_center().justify_center().text_size(8).text_color(fg).child(glyph);
    const hover = (id) => (over, cx) => { if (over) this.hot = id; else if (this.hot === id) this.hot = null; cx.notify(); };
    return root(C, v_flex()
      .id("cutin")
      .relative()
      .size_full()
      .overflow_hidden()
      .rounded(4)
      .border_1()
      .border_color("#2C2C2C")
      .bg(C.ink)
      .text_color("#F2F2F2")
      .pt(20).pb(16).px(18)
      .opacity(go ? 1 : 0).left(go ? 0 : 24)
      .transition("opacity", MOTION.toast.fade).transition("left", MOTION.toast.enter)
      .on_size_change((_size, cx) => {
        if (this.armed) return;
        this.armed = true;
        cx.timer.after(MOTION.settle.delay, (cx) => { this.go = true; cx.notify(); });
      })
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(dots("#FFFFFF1F"))
      // The band runs behind the portrait only: it ends above the question row and left of the source line.
      .child(band(C.signal, 112).left(-22))
      .child(h_flex().relative().gap(16).items_center()
        // The portrait: the operator's signal duotone in a white frame, a yellow diamond above, a "!" badge.
        .child(div().relative().w(60).h(78).flex_none()
          .child(svg(`${ASSETS}/diamond.svg`).absolute().left(25).top(-15).size(10).text_color(C.signal))
          .child(div().absolute().left(0).top(0).w(60).h(78).bg("#2C2C2C").border_2().border_color("#FFFFFF").overflow_hidden()
            .child(div().id("cut-face").absolute().left(-3).top(0).opacity(go ? 1 : 0).transition("opacity", MOTION.cut.portrait)
              .child(art ? image(art.signal).w(62).h(74)
                : div().w(62).h(74).bg(m.ident.fallbackIcon?.tile ?? "#3D3D3D").flex().items_center().justify_center()
                  .child(wide(m.ident.badge, "#F2F2F2", 16)))))
          .child(div().absolute().right(-7).bottom(-7).size(22).rounded_full().bg(C.ink).border_2().border_color("#FFFFFF")
            .flex().items_center().justify_center().text_size(11).font_weight(700).text_color(C.signal).child("!")))
        .child(v_flex().flex_1().min_w(0).gap(8)
          .child(h_flex().gap(8).items_center()
            .child(div().id("cut-src").opacity(go ? 1 : 0).transition("opacity", MOTION.cut.late).child(spaced(where, "#A9A9A3")))
            .child(barcode("#8F8F8FB3")))
          // The caption plate: the block grows across it (cut.grow), holds, and its clip retracts to 4px (cut.retract).
          .child(h_flex().relative().w(PLATE).h(30).px(12).items_center().bg("#FFFFFF").overflow_hidden()
            .child(div().id("cut-text").relative().opacity(go ? 1 : 0).transition("opacity", MOTION.cut.text)
              .child(wide(`${m.label} needs input`, C.ink, 13)))
            .child(div().id("cut-clip").absolute().left(0).top(0).bottom(0).overflow_hidden().w(go ? 4 : PLATE).transition("width", MOTION.cut.retract)
              .child(div().id("cut-block").absolute().left(0).top(0).bottom(0).bg(C.signal).w(go ? PLATE : 0).transition("width", MOTION.cut.grow))))
          .child(h_flex().items_center().child(hazard(C, 170, 5)).child(div().w(1).h(9).ml(2).bg("#FFFFFF")))))
      // The question, in brackets.
      .child(h_flex().id("cut-q").relative().mt(16).gap(8).items_stretch().opacity(go ? 1 : 0).transition("opacity", MOTION.cut.late)
        .child(div().w(4).flex_none().border_t(1.5).border_b(1.5).border_l(1.5).border_color("#F2F2F2"))
        .child(div().flex_1().min_w(0).py(7).font_family("JetBrains Mono").text_size(12).text_color("#E6E6E1").truncate()
          .child(this.question ?? (news.length ? h_flex().min_w(0).gap(12).children(news.map((t, i) => div().min_w(0).truncate().when(i > 0, (el) => el.text_color("#A9A9A3")).child(t)))
            : `Waiting for you in ${m.title}`)))
        .child(div().w(4).flex_none().border_t(1.5).border_b(1.5).border_r(1.5).border_color("#F2F2F2")))
      .child(h_flex().relative().mt(14).gap(8).items_center()
        .child(h_flex().id("cut-answer").h(28).pl(14).pr(4).gap(10).items_center().rounded_full().bg(C.signal).cursor_pointer()
          .on_hover(hover("cut-answer"))
          .on_click(() => { this.shut(); goTo(m); })
          .child(div().text_size(12).font_semibold().text_color(C.ink).child("Answer"))
          .child(knob("cut-answer-knob", "▶", C.ink, C.signal)))
        .child(h_flex().id("cut-later").h(28).px(14).flex_none().items_center().rounded_full().border_1().border_color("#555555")
          .text_size(12).font_medium().text_color("#F2F2F2").cursor_pointer()
          .hover((s) => s.bg("#2C2C2C")).on_click(() => this.shut())
          .child("Later"))
        .child(div().flex_1())
        .child(micro(others ? `+${others} more need input` : "Stays until answered", "#A9A9A3"))));
  }
}
