// toast: every notification (Herdr's own and notify()), the layout's `toast` mod. Herdr gives it
// props {title, body, level, icon, action, timeout, overlay} and no role; main.js routes it here.
// An agent that needs input gets the skill caption instead (cutin.js, an overlay window: Herdr's
// toast slot is too small for it), unless its pane has focus: you are looking at it, so its pane
// header pulses and no toast is made. A Claimed agent gets the Claimed slip. Anything else is the
// plain slab, ported from the shipped `toast`: click runs the action and closes, the host owns the
// timeout, and a machine-login body gets a Copy button.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, run, agents, spaces } from "herdr";
import { palette, root, micro, wide, chip, cue, MOTION, FONT } from "./kit.js";
import { roster } from "./roster.js";

const LEVEL = {
  info: { edge: "flow", glyph: "i" },
  success: { edge: "lime", glyph: "✓" },
  warning: { edge: "signal", glyph: "!" },
  error: { edge: "red", glyph: "×" },
};
export const CUT = { width: 440, height: 214, margin: 16, foot: 28 };

// Where the news comes from: the agent its action goes to, else a space, else Herdr itself.
function origin(p) {
  const a = p.action?.args ?? {};
  const agent = agents().find((x) => x.address === a.terminal || x.pane === a.pane);
  if (agent) return { agent, name: agent.space_name, status: agent.status };
  const space = spaces().find((s) => s.id === a.id || s.id === a.space);
  return { agent: null, name: space?.name ?? "herdr", status: null };
}

/** The skill caption, bottom right of the window, for an agent that needs input. */
export function openCutIn(terminal) {
  let w = 1440, h = 900;
  try { const b = window.bounds(); w = b.width; h = b.height; } catch {}
  return openOverlay({ mod: "endfield", kind: "window", frame: "none", key: "endfield-cutin", width: CUT.width, height: CUT.height,
    at: { x: Math.round(w - CUT.width - CUT.margin), y: Math.round(h - CUT.foot - CUT.height - CUT.margin) }, props: { role: "cutin", terminal } });
}

export class Toast {
  init() {
    this.phase = "new";
    this.width = 0;
  }

  // The one decision, made once the agent's new status has reached agents() (Herdr can post the
  // toast a beat before): a cut-in is shown when an agent needs input and its pane is not focused.
  decide(p) {
    if (this.kind) return;
    this.from = origin(p);
    const a = this.from.agent;
    if (a?.status === "blocked") {
      this.kind = "handed";
      if (!a.focused) { cue("needs"); openCutIn(a.address); }
      closeOverlay(p.overlay);
    } else if (a?.status === "done") {
      this.kind = "claimed";
      cue("claimed");
    } else if (!a) {
      this.kind = "plain";
    }
  }

  // Slide out, then run the action and close (the host's own timeout closes without it).
  leave(p, cx, act = true) {
    if (this.phase === "leaving") return;
    this.phase = "leaving";
    cx.notify();
    cx.timer.after(MOTION.toast.enter.duration, () => {
      if (act && p.action?.name) run(p.action.name, p.action.args ?? {});
      closeOverlay(p.overlay);
    });
  }

  render(cx) {
    const p = props() ?? {};
    this.decide(p);
    if (!this.kind && !this.waiting) {
      // An agent's news whose status hasn't landed yet: wait one beat, then show it plain.
      this.waiting = true;
      cx.timer.after(MOTION.toast.enter.duration, (cx) => { this.decide(p); this.kind ??= "plain"; cx.notify(); });
    }
    if (this.kind !== "plain" && this.kind !== "claimed") return div();
    const C = palette();
    const shown = this.phase === "shown";
    const slab = (edge, body) => root(C, h_flex()
      .id("toast")
      .relative()
      .size_full()
      .bg(C.raised)
      .cursor_pointer()
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
      .child(body));
    if (this.kind === "claimed") return slab(C.lime, this.claimedBody(C, p));
    const level = LEVEL[p.level] ?? LEVEL.info;
    const edge = C[level.edge];
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    return slab(edge, v_flex().flex_1().min_w(0).h_full().justify_center().pl(12).pr(14).gap(6)
      .child(h_flex().min_w(0).gap(8).items_center()
        .child(div().size(18).flex_none().rounded_full().bg(edge).flex().items_center().justify_center()
          .text_size(11).font_weight(700).text_color(C.ink).child(level.glyph))
        .child(div().flex_1().min_w(0).truncate().text_size(13).font_semibold().child(login ? `${login[1]} needs a login` : p.title ?? ""))
        .child(micro(`// ${this.from.name}`, C.muted).flex_none()))
      .when(!login && Boolean(p.body), (el) => el.child(div().pl(26).truncate().text_size(12).text_color(C.muted).child(p.body ?? "")))
      .when(!login && Boolean(p.action?.name), (el) => el.child(h_flex().pl(26).pt(2).child(this.pill(C, "toast-open", "Open"))))
      .when(Boolean(login), (el) => el.child(h_flex().pl(26).gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().tooltip(command).font_family(FONT.mono).text_size(11.5).text_color(C.muted).child(command))
        .child(div().id("toast-login-copy").flex_none().px(10).h(22).flex().items_center().rounded_full().border_1().border_color(C.hairStrong)
          .text_size(12).font_medium().hover((s) => s.bg(C.hair))
          .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
          .child(this.copied ? "Copied" : "Copy")))));
  }

  // A game pill: label, then a round knob that nudges 3px right on hover. Yellow only for the primary.
  pill(C, id, label, primary = true) {
    return h_flex().id(id).h(22).pl(11).pr(3).gap(7).flex_none().items_center().rounded_full()
      .when(primary, (el) => el.bg(C.signal))
      .when(!primary, (el) => el.bg(C.raised).border_1().border_color(C.hair).border_l(2).border_color(C.hairStrong))
      .on_hover((over, cx) => { this.hot = over; cx.notify(); })
      .child(div().text_size(11.5).font_semibold().text_color(primary ? C.ink : C.text).child(label))
      .child(div().id(`${id}-knob`).relative().left(this.hot ? 3 : 0).transition("left", MOTION.row.nudge)
        .size(16).rounded_full().bg(primary ? C.ink : C.selBg).flex().items_center().justify_center().text_size(7).text_color(primary ? C.signal : C.selText).child("▶"));
  }

  /** Claimed: the operator's chip flashes once, a lime "Claimed ✓" pops, the task, and View. */
  claimedBody(C, p) {
    const a = this.from.agent;
    const m = roster().all.get(a.address);
    const shown = this.phase === "shown";
    return h_flex().flex_1().min_w(0).h_full().pl(12).pr(14).gap(12).items_center()
      .child(m ? chip(C, m.ident, "done", { size: 32, id: "toast-chip", flash: { lit: !shown }, ground: C.raised }) : div())
      .child(v_flex().flex_1().min_w(0).gap(7)
        .child(h_flex().gap(8).items_center()
          .child(wide(m?.ident.callsign ?? a.program?.name ?? "", C.text, 11))
          .child(div().id("toast-claimed").h(16).px(7).flex().items_center().rounded_full().bg(C.lime).text_size(10).font_semibold().text_color(C.ink)
            .opacity(shown ? 1 : 0).transition("opacity", MOTION.done.check).child("Claimed ✓"))
          .child(div().flex_1())
          .child(micro(`// ${this.from.name} · ${a.address.toUpperCase()}`, C.muted).flex_none()))
        .child(h_flex().gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().text_size(12).child(m?.title ?? p.body ?? ""))
          .child(this.pill(C, "toast-view", "View", false))));
  }
}
