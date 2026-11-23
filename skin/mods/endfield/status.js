// status: the HUD footer, an ink bar along the bottom. Numbers are the headline: agents active on
// an odometer, then where you are, Generating and Claimed counts, the focused agent's context, its
// model, branch and machine, and a yellow "Needs input" block that opens when anyone needs you
// (click: go to the first one).

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, shared } from "herdr";
import { palette, root, midTrunc, hatch, micro, pad2, odometer, glyph, Entrance, MOTION } from "./kit.js";
import { roster } from "./roster.js";
import { goTo } from "./report.js";
import { fmtTokens } from "./sessions.js";

const NEEDS_W = 176;

export default class Status {
  init(_props, cx) {
    this.entrance = new Entrance(3);
    this.entrance.start(cx);
  }

  render() {
    const C = palette();
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((t) => t.active);
    const R = roster();
    const count = (s) => R.flat.filter((m) => m.status === s).length;
    const active = R.flat.filter((m) => m.status !== "idle").length;
    const blocked = R.flat.filter((m) => m.status === "blocked");
    // The focused agent's session, as the squad list last read it (it owns the one poller).
    const focus = shared("endfield.focus") ?? null;
    const pct = focus?.ctx ? Math.min(100, focus.ctx.pct) : 0;
    const crumb = (text) => div().min_w(0).truncate().text_color(C.barText).child(text);
    const rule = () => div().w(1).h(20).flex_none().bg(C.barRule);
    // A count of 0 draws its glyph still: idle is still, so the HUD never repaints for nothing.
    const tally = (s, word) => h_flex().flex_none().gap(6).items_center()
      .child(glyph({ ...C, flow: C.flowInv }, s, { size: 11, still: count(s) === 0 }))
      .child(odometer(`odo-${s}`, count(s), count(s) ? C.barText : C.barSlash, 13))
      .child(micro(word, C.barMuted));
    return root(C, this.entrance.apply(h_flex().relative().size_full().bg(C.bar)
      .child(hatch(C.barHatch))
      .child(h_flex().relative().size_full().pl(16).gap(16).items_center()
        .child(h_flex().flex_none().gap(6).items_end()
          .child(odometer("odo-active", active, C.barText, 22))
          .child(micro("Active", C.barMuted).pb(4)))
        .child(rule())
        .child(h_flex().flex_shrink(1).min_w(0).max_w(260).gap(4).items_center().text_size(12).font_medium()
          .child(div().flex_none().text_color(C.barSlash).child("//"))
          .child(crumb(space?.name ?? "No space"))
          .when(Boolean(tab), (el) => el.child(div().flex_none().text_color(C.barSlash).child("/")).child(crumb(tab.named ? tab.name : `Tab ${pad2(tab.index)}`))))
        .child(rule())
        .child(tally("working", "Generating"))
        .child(tally("done", "Claimed"))
        .child(div().flex_1())
        .child(v_flex().w(170).flex_none().gap(5)
          .child(h_flex().justify_between().items_end()
            .child(micro("Ctx · focused", C.barMuted))
            .child(h_flex().gap(3).items_end().text_size(11).text_color(C.barText)
              .child(div().font_semibold().child(focus?.ctx ? fmtTokens(focus.ctx.used) : "—"))
              .child(micro(focus?.ctx ? `/${fmtTokens(focus.ctx.total)}` : "", C.barMuted))))
          .child(div().relative().h(3).bg("#383838")
            .child(div().id("hud-ctx").absolute().left(0).top(0).h(3).w(1.7 * pct).bg(pct >= 75 ? C.red : C.barText).transition("width", MOTION.count.roll))))
        .child(micro([focus?.model ?? "No agent", midTrunc(space?.branch), space?.machine ?? "Local"].filter(Boolean).join(" · "), C.barMuted).flex_shrink(1).min_w(0).truncate())
        // Opens to 176px while anyone needs input; the block inside is fixed, the opening clips it.
        .child(div().id("hud-needs").relative().h_full().flex_none().overflow_hidden().w(blocked.length ? NEEDS_W : 0).transition("width", MOTION.count.needs)
          .cursor_pointer().on_click(() => blocked[0] && goTo(blocked[0]))
          .child(h_flex().absolute().left(0).top(0).w(NEEDS_W).h_full().px(14).gap(8).items_center().bg(C.signal)
            .child(odometer("odo-needs", blocked.length, C.ink, 16))
            .child(micro("Needs input", C.ink).flex_1())
            .child(div().size(20).rounded_full().bg(C.ink).text_color(C.signal).flex().items_center().justify_center().text_size(8).child("▶")))))));
  }
}
