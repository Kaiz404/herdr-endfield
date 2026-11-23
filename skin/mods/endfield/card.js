// card: the session card that opens beside the sidebar while an agent row is hovered.
// An overlay window (it never takes the keyboard) the agents list opens and closes; the
// card only reports whether the pointer is on it (shared "endfield.card.hot").
// props: {role: "card", terminal, title, where, snap: Session, overlay}

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, props, run, shared, setShared, closeOverlay, checking } from "herdr";
import { palette, root, statusOf, micro, wide, MOTION, FONT } from "./kit.js";
import { Sessions, DASH, fmtTokens, longDuration, ago } from "./sessions.js";

export const CARD = { width: 330, pad: 14, slide: 16 };
const SEGS = 20;
const HOT_FROM = 0.75;
const CHIP = {
  working: (C) => [C.flowInv, C.ink],
  blocked: (C) => [C.signal, C.ink],
  done: (C) => [C.lime, C.ink],
  error: (C) => [C.red, C.ink],
  idle: (C) => [C.sunken, C.muted],
};

/** How tall the card draws, so the list can keep it inside the window before it exists. */
export const cardHeight = (question) => 418 + (question ? 52 : 0);

export class Card {
  init(p, cx) {
    this.p = p;
    this.entered = false;
    this.sessions = new Sessions(`card-${p.overlay}`);
    this.sessions.seed(p.snap);
    if (checking()) return;
    const target = () => {
      const a = agents().find((x) => x.address === p.terminal);
      return a ? [{ terminal: a.address, cwd: p.snap?.cwd ?? null, status: a.status }] : [];
    };
    this.sessions.start(cx, target, () => true);
  }

  close() {
    this.sessions.stop();
    setShared("endfield.card.hot", null);
  }

  act(name, args) {
    run(name, args);
    closeOverlay(props().overlay);
  }

  render(cx) {
    const C = palette();
    const p = props() ?? this.p;
    if (this.entered && shared("endfield.card.open") !== p.overlay) closeOverlay(p.overlay);
    const a = agents().find((x) => x.address === p.terminal);
    const s = this.sessions.get(p.terminal) ?? p.snap ?? null;
    const status = a?.status ?? "idle";
    const st = statusOf(status);
    const [chipBg, chipFg] = (CHIP[status] ?? CHIP.idle)(C);
    const ctx = s?.ctx;
    const filled = ctx ? Math.round((Math.min(100, ctx.pct) / 100) * SEGS) : 0;
    const hot = (ctx?.pct ?? 0) >= HOT_FROM * 100;
    const question = status === "blocked" ? s?.question : null;
    const line = (el) => el.border_b(1).border_color(C.hair);
    const cell = (label, value, last = false) => v_flex().flex_1().min_w(0).px(14).py(10).gap(6).when(!last, (el) => el.border_r(1).border_color(C.hair))
      .child(micro(label, C.muted)).child(value);
    const ghost = (id, label, action) => h_flex().id(id).h(26).px(12).items_center().rounded_full().border_1().border_color(C.hairStrong)
      .text_size(12).font_medium().hover((h) => h.bg(C.sunken)).on_click(action).child(label);
    return root(C, h_flex().id("card-root").p(CARD.pad)
      .on_size_change((_size, cx) => {
        if (this.entered) return;
        // Drawn once at rest, then the enter transition and the gauge run.
        cx.timer.after(MOTION.settle.delay, (cx) => { this.entered = true; cx.notify(); });
      })
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_hover((over) => setShared("endfield.card.hot", over ? p.overlay : null))
      .child(h_flex().id("card").relative().w(CARD.width).flex_none().self_start().overflow_hidden().rounded(4).border_1().border_color(C.hair)
        .bg(C.raised).shadow_lg()
        .left(this.entered ? CARD.slide : 0).opacity(this.entered ? 1 : 0)
        .transition("left", MOTION.move).transition("opacity", MOTION.colour)
        .child(div().w(3).flex_none().self_stretch().bg(C[st?.bar ?? "hairStrong"]))
        .child(v_flex().flex_1().min_w(0)
          .child(line(v_flex().pl(14).pr(16).pt(14).pb(12).gap(9))
            .child(h_flex().justify_between()
              .child(micro(`// Session · ${p.terminal.toUpperCase()}${s?.approx ? " ≈" : ""}`, C.muted))
              .child(micro(s?.startedAt ? longDuration(Date.now() - s.startedAt) : DASH, C.muted)))
            .child(div().text_size(15).font_semibold().truncate().child(p.title ?? DASH))
            .child(h_flex().gap(8).items_center()
              .child(h_flex().h(18).px(8).items_center().rounded_full().bg(chipBg).text_color(chipFg).text_size(10).font_semibold().child(st?.word ?? status))
              .child(micro(p.where ?? "", C.muted).truncate())))
          .child(line(h_flex())
            .child(cell("Model", v_flex().gap(6)
              .child(div().font_semibold().truncate().child(s?.model?.display ?? DASH))
              .child(div().font_family(FONT.mono).text_size(10).text_color(C.muted).truncate().child(s?.model?.id ?? DASH))))
            .child(cell("Effort · Mode", v_flex().gap(6)
              .child(div().font_semibold().child(s?.effort ? s.effort[0].toUpperCase() + s.effort.slice(1) : DASH))
              .child(micro(s?.mode ?? DASH, C.muted)), true)))
          .child(line(v_flex().px(14).py(12).gap(9))
            .child(h_flex().justify_between().items_end()
              .child(micro("Context", C.muted))
              .child(h_flex().items_end().gap(6)
                .child(wide(ctx ? String(ctx.pct) : DASH, C.text, 22))
                .child(micro(ctx ? `% · ${fmtTokens(ctx.used)} / ${fmtTokens(ctx.total)}` : "", C.muted))))
            // Filled blocks light up one after another (18ms apart) when the card opens; past 75% they run red.
            .child(h_flex().gap(3).children(Array.from({ length: SEGS }, (_, k) => {
              const on = k < filled;
              return div().id(`seg-${k}`).w(10).h(8).flex_none().bg(on ? (hot && k >= SEGS * HOT_FROM ? C.red : C.text) : C.hair)
                .opacity(on && !this.entered ? 0.25 : 1).transition("opacity", { ...MOTION.colour, delay: k * MOTION.segment.delay });
            }))))
          .child(line(h_flex())
            .child(cell("Tool calls", wide(s?.tools != null ? String(s.tools).padStart(2, "0") : DASH, C.text, 16)))
            .child(cell("Tokens", h_flex().items_end().gap(4)
              .child(wide(fmtTokens(s?.tokens?.total), C.text, 16))
              .when(Boolean(s?.tokens?.delta), (el) => el.child(micro(`▲${fmtTokens(s.tokens.delta)}`, C.muted)))))
            .child(cell("Turns", wide(s?.turns != null ? String(s.turns).padStart(2, "0") : DASH, C.text, 16), true)))
          .child(line(v_flex().px(14).py(10).gap(8))
            .child(micro("Flow", C.muted))
            .child(h_flex().gap(6).font_family("JetBrains Mono").text_size(11).min_w(0)
              .child(div().flex_none().child(s?.cwd ? s.cwd.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || s.cwd : DASH))
              .child(div().flex_none().text_color(C.flow).child("▶▶"))
              .child(div().min_w(0).truncate().child(s?.subagents?.length ? `${s.subagents.length} sub-agents` : s?.lastAction?.arg || s?.lastAction?.tool || DASH)))
            .child(h_flex().gap(6).text_size(12).text_color(C.muted).min_w(0)
              .child(div().flex_none().text_color(C[st?.bar ?? "hairStrong"]).child("●"))
              .child(div().min_w(0).truncate().child(s?.lastAction ? `${s.lastAction.tool}${s.lastAction.arg ? ` · ${s.lastAction.arg}` : ""} · ${ago(s.lastAt)}` : DASH))))
          .when(Boolean(question), (el) => el.child(div().mx(14).mt(10).px(11).py(9).border_l(3).border_color(C.signal).bg(C.sunken)
            .font_family("JetBrains Mono").text_size(11).line_height(1.4).child(question)))
          .child(h_flex().px(14).py(12).gap(6).items_center()
            .child(h_flex().id("card-go").h(26).px(12).gap(6).items_center().rounded_full().bg(C.signal).text_color(C.ink)
              .text_size(12).font_semibold().hover((h) => h.bg(C.signalHover))
              .on_click(() => this.act("agent.focus", { terminal: p.terminal }))
              .child(status === "blocked" ? "Answer" : "Focus").child(div().text_size(8).child("▶▶")))
            .child(ghost("card-peek", "Peek", () => this.act("terminal.peek", { terminal: p.terminal })))
            .child(ghost("card-pin", a?.pinned ? "Unpin" : "Pin", () => this.act("terminal.pin", { terminal: p.terminal, pinned: !a?.pinned })))
            .child(div().flex_1())
            .child(micro(s?.subagents?.length ? `${String(s.subagents.length).padStart(2, "0")} sub-agents` : "No sub-agents", C.muted))))));
  }
}
