// status: the HUD footer, an ink bar along the bottom. Numbers are the headline: agents active on
// an odometer, then where you are, Generating and Finished counts, the focused agent's context, its
// model, branch and machine, the account's Claude usage limits (5-hour and 7-day: percent used and
// time to reset), and a yellow "Needs input" block that opens when anyone needs you
// (click: go to the first one).

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, shared, nextCommand, checking } from "herdr";
import { palette, root, midTrunc, hatch, micro, pad2, odometer, glyph, gauge, GAUGE, QUOTA, Entrance, MOTION, newSpace } from "./kit.js";
import { roster } from "./roster.js";
import { goTo } from "./report.js";
import { fmtTokens } from "./fleet.js";
import { usage, block, fit, usageWidth, TIERS, USAGE_TICK_MS } from "./usage.js";

const NEEDS_W = 176;
const GAUGE_W = GAUGE.segments * GAUGE.w + (GAUGE.segments - 1) * GAUGE.gap;
// usage.js's width estimate; between counts the hairline and the gap either side.
const QUOTA_M = { gaugeW: GAUGE_W, colGap: QUOTA.colGap, between: 2 * QUOTA.between + 1 };

export default class Status {
  init(_props, cx) {
    this.entrance = new Entrance(3);
    this.entrance.start(cx);
    // The limits slot's width, as it last laid out: it picks how much of each window fits.
    this.slotW = Infinity;
    // keys.json "<key>": "endfield.newSpace" lands here: the one copy every endfield window shows.
    if (checking()) return;
    // A data timer: the time to reset counts down in minutes while limits show.
    cx.timer.every(USAGE_TICK_MS, (cx) => { if (shared("endfield.limits")) cx.notify(); });
    cx.spawn(async () => { for (;;) if ((await nextCommand()) === "newSpace") await newSpace(); });
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
    // The account's limits, the newest any statusline sidecar carries (the squad list publishes them).
    const limits = usage(shared("endfield.limits"), Date.now(), GAUGE.segments);
    const tier = limits ? fit(limits, this.slotW, QUOTA_M) : null;
    const crumb = (text) => div().min_w(0).truncate().text_color(C.barText).child(text);
    const rule = () => div().w(1).h(20).flex_none().bg(C.barRule);
    // A count of 0 draws its glyph still: idle is still, so the HUD never repaints for nothing.
    const tally = (s, word) => h_flex().flex_none().gap(6).items_center()
      .child(glyph({ ...C, flow: C.flowInv }, s, { size: 11, still: count(s) === 0 }))
      .child(odometer(`odo-${s}`, count(s), count(s) ? C.barText : C.barSlash, 13))
      .child(micro(word, C.barMuted));
    // Urgent is a glyph plus red, as the context gauge turns red; a reset window says so over an empty
    // bar, never old numbers. Fixed row heights keep every tier the same height.
    const quota = (w, i) => {
      const b = block(w, i, tier);
      const row = (h) => h_flex().h(h).gap(QUOTA.colGap);
      return v_flex().flex_none().gap(QUOTA.rowGap)
        .child(row(QUOTA.top).items_end()
          .child(h_flex().gap(5).items_center().when(Boolean(b.bar), (el) => el.min_w(GAUGE_W))
            .when(b.hot, (el) => el.child(div().text_size(9).line_height(1).text_color(C.red).child("▲")))
            .child(micro(b.label, C.barMuted)))
          .child(h_flex().gap(5).items_end()
            .when(Boolean(b.pct), (el) => el.child(div().text_size(QUOTA.pct).font_weight(700).line_height(1).text_color(b.hot ? C.red : C.barText).child(b.pct)))
            .when(Boolean(b.word), (el) => el.child(micro(b.word, w.reset ? C.barText : C.barMuted)))))
        .child(row(QUOTA.bottom).items_center()
          .when(Boolean(b.bar), (el) => el.child(gauge({ ...C, text: C.barText, error: C.red, hairStrong: C.barRule }, b.bar, { id: `hud-quota-${i}` })))
          .when(Boolean(b.resets), (el) => el.child(micro(b.resets, C.barMuted))));
    };
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
        .child(tally("done", "Finished"))
        .when(Boolean(limits), (el) => el.child(rule()))
        // Takes the free width, so its size is what the limits may use; narrower drops the bars, then "used".
        .child(h_flex().id("hud-limits").flex_1().min_w(limits ? usageWidth(limits, TIERS[TIERS.length - 1], QUOTA_M) : 0).overflow_hidden().gap(QUOTA.between).items_center()
          .on_size_change((size, cx) => { if (Math.abs(size.width - this.slotW) > 1) { this.slotW = size.width; cx.notify(); } })
          .children(limits ? limits.flatMap((w, i) => (i ? [rule(), quota(w, i)] : [quota(w, i)])) : []))
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
