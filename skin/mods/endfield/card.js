// card: the session panel beside the sidebar while a squad row is hovered, laid out like an AIC
// machine panel. An overlay window (it never takes the keyboard) the squad list opens and closes;
// the panel only reports whether the pointer is on it (shared "endfield.card.hot").
// props: {role: "card", terminal, title, where, callsign, snap: Session, overlay}

import { div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, props, run, shared, setShared, closeOverlay, checking } from "herdr";
import { palette, root, statusOf, micro, wide, dots, barcode, ticks, rings, pill, glyph, MOTION, FONT } from "./kit.js";
import { roster } from "./roster.js";
import { Sessions, DASH, fmtTokens, longDuration, ago } from "./sessions.js";
import { readLog, KIND, openComms } from "./comms.js";
import { openDispatch } from "./dispatch.js";

export const CARD = { width: 368, pad: 14, slide: 14 };
const SEGS = 20;
const HOT_FROM = 0.75;

/** How tall the panel draws, so the list can keep it inside the window before it exists. */
export const cardHeight = (question) => 452 + (question ? 52 : 0);

export class Card {
  init(p, cx) {
    this.p = p;
    this.entered = false;
    this.comms = [];
    this.sessions = new Sessions(`card-${p.overlay}`);
    this.sessions.seed(p.snap);
    if (checking()) return;
    const target = () => {
      const a = agents().find((x) => x.address === p.terminal);
      return a ? [{ terminal: a.address, cwd: p.snap?.cwd ?? null, status: a.status }] : [];
    };
    this.sessions.start(cx, target, () => true);
    cx.spawn(async (cx) => {
      this.comms = (await readLog()).filter((m) => m.from === p.terminal || m.to === p.terminal);
      cx.notify();
    });
  }

  close() {
    this.sessions.stop();
    setShared("endfield.card.hot", null);
  }

  act(name, args) {
    run(name, args);
    closeOverlay(props().overlay);
  }

  hover(id) {
    return (over, cx) => { if (over) this.hot = id; else if (this.hot === id) this.hot = null; cx.notify(); };
  }

  render(cx) {
    const C = palette();
    const p = props() ?? this.p;
    if (this.entered && shared("endfield.card.open") !== p.overlay) closeOverlay(p.overlay);
    const m = roster().all.get(p.terminal);
    const s = this.sessions.get(p.terminal) ?? p.snap ?? null;
    const status = m?.status ?? "idle";
    const st = statusOf(status);
    const ctx = s?.ctx;
    const filled = ctx ? Math.round((Math.min(100, ctx.pct) / 100) * SEGS) : 0;
    const hot = (ctx?.pct ?? 0) >= HOT_FROM * 100;
    const question = status === "blocked" ? s?.question : null;
    const ident = m?.ident;
    const turns = s?.turns ?? m?.turn;
    const line = (el) => el.border_b(1).border_color(C.hair);
    const cell = (el, last) => el.flex_1().min_w(0).px(14).py(12).gap(8).when(!last, (e) => e.border_r(1).border_color(C.hair));
    const tile = (label, n, bar) => div().relative().size(38).flex_none().rounded(3).border_1().border_color(C.hair).bg(C.raised)
      .flex().items_center().justify_center().font_family(FONT.mono).text_size(9).child(label)
      .child(div().absolute().left(0).right(0).bottom(0).h(3).bg(bar))
      .when(n != null, (el) => el.child(div().absolute().right(3).bottom(5).text_size(8).text_color(C.muted).child(String(n))));
    const cwd = s?.cwd ?? null;
    const folder = cwd ? cwd.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || cwd : null;
    return root(C, h_flex().id("card-root").p(CARD.pad)
      .on_size_change((_size, cx) => {
        if (this.entered) return;
        // Drawn once at rest (placeholder-first), then the reveal and the gauge run.
        cx.timer.after(MOTION.settle.delay, (cx) => { this.entered = true; cx.notify(); });
      })
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_hover((over) => setShared("endfield.card.hot", over ? p.overlay : null))
      .child(v_flex().id("card").relative().w(CARD.width).flex_none().self_start().overflow_hidden().rounded(4).border_1().border_color(C.hairStrong)
        .bg(C.raised).shadow_lg()
        .left(this.entered ? CARD.slide : 0).opacity(this.entered ? 1 : 0)
        .transition("left", MOTION.card.slide).transition("opacity", MOTION.card.reveal)
        // Head: the operator's bust in a dotted frame, the session's ink chip, the task, who and where.
        .child(line(h_flex().gap(14).items_center().pt(16).pb(14).pl(18).pr(16))
          .child(div().relative().w(66).h(78).flex_none()
            .child(div().absolute().left(0).top(0).w(66).h(78).rounded(3).overflow_hidden().bg(C.ground).border_1().border_color(C.hair)
              .border_b(3).border_color(ident?.accent ?? C.hairStrong)
              .child(dots(C.dot))
              .child(rings(C.hairStrong, 94).absolute().left(-14).top(-6))
              .child(ident?.avatar ? image(ident.avatar.bust).absolute().left(0).top(-6).w(66).h(79)
                : div().absolute().left(11).top(14).size(44).rounded_full().bg(ident?.fallbackIcon?.tile ?? C.selBg).flex().items_center().justify_center()
                  .child(wide(ident?.badge ?? "?", "#F2F2F2", 12))))
            .child(div().absolute().right(-6).bottom(-6).size(20).rounded_full().bg(C.ink).border_2().border_color("#FFFFFF")
              .flex().items_center().justify_center().font_family(FONT.mono).text_size(8).text_color("#F2F2F2").child(ident?.badge ?? "")))
          .child(v_flex().flex_1().min_w(0).gap(7)
            .child(h_flex().gap(6).items_center()
              .child(div().px(6).py(3).bg(C.ink).child(micro(`// Session ${p.terminal}${s?.approx ? " ≈" : ""}`, "#F2F2F2", 9)))
              .child(div().size(4).bg(C.text))
              .child(barcode(C.cross)))
            .child(div().text_size(15).font_semibold().truncate().child(p.title ?? m?.title ?? DASH))
            .child(micro([ident?.callsign ?? p.callsign, m?.program?.name, p.where].filter(Boolean).join(" · "), C.muted).truncate())))
        // The machine panel: what goes in, the state with its march, what comes out.
        .child(line(h_flex())
          .child(cell(v_flex().relative().overflow_hidden(), false)
            .child(dots(C.dot))
            .child(micro("Input", C.muted).relative())
            .child(h_flex().relative().gap(5)
              .child(tile(folder ? folder.slice(0, 5) : "—", null, C.flow))
              .child(tile(s?.model?.short?.split(" ")[0]?.slice(0, 5) ?? m?.program?.name?.slice(0, 5) ?? "—", null, C.lime)))
            .child(div().relative().truncate().text_size(11).text_color(C.muted).child(folder ? `${folder} · prompt` : "prompt")))
          .child(cell(v_flex().items_center().justify_center(), false)
            .child(h_flex().w_full().gap(10).items_center()
              .child(div().flex_1().h(1).bg(C.hairStrong))
              .child(glyph(C, status, { size: 12 }) ?? div())
              .child(div().flex_1().h(1).bg(C.hairStrong)))
            .child(div().text_size(12).font_semibold().child(st?.word ?? status))
            .child(ticks(C.tick, 81))
            .child(micro(`${s?.startedAt ? longDuration(Date.now() - s.startedAt) : DASH} · turn ${turns != null ? String(turns).padStart(2, "0") : DASH}`, C.muted)))
          .child(cell(v_flex(), true)
            .child(micro("Output", C.muted))
            .child(h_flex().gap(6).items_end()
              .child(wide(fmtTokens(s?.tokens?.total), C.text, 24))
              .when(Boolean(s?.tokens?.delta), (el) => el.child(micro(`▲${fmtTokens(s.tokens.delta)}`, C.muted))))
            .child(div().truncate().text_size(11).text_color(C.muted).child(s?.tools != null ? `tokens · ${String(s.tools).padStart(2, "0")} tool calls` : "tokens"))))
        // Context reserves: the number, then 20 blocks lighting 18ms apart; past 75% they run red.
        .child(line(v_flex().px(18).py(12).gap(8))
          .child(h_flex().justify_between().items_end()
            .child(micro("Context reserves", C.muted))
            .child(h_flex().gap(4).items_end()
              .child(wide(ctx ? fmtTokens(ctx.used) : DASH, C.text, 20))
              .child(micro(ctx ? `/${fmtTokens(ctx.total)} · ${ctx.pct}%` : "", C.muted))))
          .child(h_flex().gap(2).children(Array.from({ length: SEGS }, (_, k) => {
            const on = k < filled;
            return div().id(`seg-${k}`).w(9).h(8).flex_none().bg(on ? (hot && k >= SEGS * HOT_FROM ? C.red : C.text) : C.hair)
              .opacity(on && !this.entered ? 0.25 : 1).transition("opacity", { ...MOTION.row.wipe, delay: k * MOTION.card.segment.delay });
          }))))
        // Comms: this agent's latest in (◀ from) and out (▶ to).
        .child(line(v_flex().px(18).pt(10).pb(12).gap(8))
          .child(h_flex().gap(8).items_center()
            .child(micro(`Comms · ${String(this.comms.length).padStart(2, "0")}`, C.muted))
            .child(div().flex_1().h(1).bg(C.hair))
            .child(div().id("card-log").cursor_pointer().on_click(() => { openComms(); closeOverlay(p.overlay); }).child(micro("Log ▶", C.text))))
          .when(this.comms.length === 0, (el) => el.child(div().text_size(11).text_color(C.muted).child("No messages yet. Dispatch sends the first one.")))
          .children(this.comms.slice(0, 2).map((c) => h_flex().gap(8).items_center().min_w(0)
            .child(micro(new Date(c.at).toTimeString().slice(0, 5), C.muted).w(34).flex_none())
            .child(div().w(3).h(12).flex_none().bg(C[KIND[c.kind]?.edge ?? "flow"]))
            .child(wide(c.to === p.terminal ? `◀ ${c.from}` : `▶ ${c.to}`, C.text, 8.5).flex_none())
            .child(div().min_w(0).truncate().text_size(11).text_color(C.muted).child(c.text)))))
        .when(Boolean(question), (el) => el.child(h_flex().mx(18).mt(12).gap(8).items_stretch()
          .child(div().w(4).flex_none().border_t(1.5).border_b(1.5).border_l(1.5).border_color(C.text))
          .child(div().flex_1().py(6).font_family("JetBrains Mono").text_size(11).line_height(1.45).child(question))
          .child(div().w(4).flex_none().border_t(1.5).border_b(1.5).border_r(1.5).border_color(C.text))))
        // The ink footer: the current formula (what goes in ▶▶ what it is doing), then the actions.
        .child(v_flex().mt(12).pl(18).pr(12).py(10).gap(10).bg(C.ink).text_color("#F2F2F2")
          .child(v_flex().gap(5).min_w(0)
            .child(micro("Current formula", "#A9A9A3"))
            .child(h_flex().gap(6).min_w(0).font_family("JetBrains Mono").text_size(11)
              .child(div().flex_none().child(folder ?? "prompt"))
              .child(div().flex_none().text_color("#31ACF0").child("▶▶"))
              .child(div().min_w(0).truncate().child(s?.lastAction ? `${s.lastAction.tool}${s.lastAction.arg ? ` ${s.lastAction.arg}` : ""}` : st?.word ?? DASH))
              .when(Boolean(s?.lastAt), (el) => el.child(div().flex_none().text_color("#A9A9A3").child(`· ${ago(s.lastAt)}`)))))
          .child(h_flex().gap(6).items_center()
            .child(h_flex().id("card-peek").h(26).px(12).items_center().rounded_full().border_1().border_color("#555555").text_size(12).font_medium().cursor_pointer()
              .hover((h) => h.bg("#2C2C2C")).on_click(() => this.act("terminal.peek", { terminal: p.terminal })).child("Peek"))
            .child(h_flex().id("card-pin").h(26).px(12).items_center().rounded_full().border_1().border_color("#555555").text_size(12).font_medium().cursor_pointer()
              .hover((h) => h.bg("#2C2C2C")).on_click(() => this.act("terminal.pin", { terminal: p.terminal, pinned: !m?.agent?.pinned })).child(m?.agent?.pinned ? "Unpin" : "Pin"))
            .child(pill(C, "card-dispatch", "Dispatch", { kind: "dark", knob: "+", hot: this.hot === "card-dispatch", on_hover: this.hover("card-dispatch"),
              action: () => { closeOverlay(p.overlay); openDispatch({ mode: "send", target: p.terminal }); } }))
            .child(div().flex_1())
            .child(pill(C, "card-go", status === "blocked" ? "Answer" : "Focus", { kind: "primary", hot: this.hot === "card-go", on_hover: this.hover("card-go"),
              action: () => this.act("agent.focus", { terminal: p.terminal }) }))))));
  }
}
