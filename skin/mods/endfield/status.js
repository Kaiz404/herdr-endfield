// status: the HUD footer, an ink bar along the bottom, in three zones.
//   Fleet: agents working now on an odometer, and a Finished button only while any finished a turn
//     you have not seen (click: go to the first one).
//   Focused agent: its Claude account (click: the Account dialog), model, effort, branch, the
//     machine when it is remote, and its context.
//   Limits: the account's Claude usage (5-hour and 7-day: percent used and time to reset; click:
//     the focused chat's Account dialog, else Manage accounts).
// Then a yellow "Needs input" block opens when anyone needs you (click: go to the first one).
// Where you are (space and tab) is left to the sidebar and the tab bar.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, shared, nextCommand, checking } from "herdr";
import { palette, root, midTrunc, hatch, micro, spaced, odometer, glyph, gauge, GAUGE, QUOTA, Entrance, MOTION, newSpace } from "./kit.js";
import { roster } from "./roster.js";
import { goTo } from "./report.js";
import { fmtTokens } from "./fleet.js";
import { usage, block, fit, usageWidth, TIERS, USAGE_TICK_MS } from "./usage.js";
import { isClaude } from "./sessions.js";
import { openAccount, manageAccounts } from "./actions.js";

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
    const R = roster();
    const working = R.flat.filter((m) => m.status === "working").length;
    const done = R.flat.filter((m) => m.status === "done");
    const blocked = R.flat.filter((m) => m.status === "blocked");
    // The focused agent's session, as the squad list last read it (it owns the one poller).
    const focus = shared("endfield.focus") ?? null;
    const pct = focus?.ctx ? Math.min(100, focus.ctx.pct) : 0;
    // The focused agent's account's limits, else the newest any statusline sidecar carries (the squad list publishes them).
    const limits = usage(shared("endfield.limits"), Date.now(), GAUGE.segments);
    // The focused agent's login (tools/account.mjs): its saved name, else the normal login's email, or
    // nothing before its statusline sidecar says. Clicking it or the limits opens the Account dialog.
    const claude = R.flat.find((m) => m.focused && isClaude(m));
    const account = claude && focus?.account != null ? focus.account || focus.email || "normal login" : null;
    const accountClick = () => (claude && focus?.terminal === claude.address
      ? openAccount({ terminal: claude.address, snap: focus.session })
      : manageAccounts());
    const tier = limits ? fit(limits, this.slotW, QUOTA_M) : null;
    const rule = () => div().w(1).h(20).flex_none().bg(C.barRule);
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
      .child(h_flex().relative().size_full().pl(16).items_center()
        // Fleet: how many work now, then, only while any wait unseen, the finished ones (click: the first).
        // Working at 0 draws its glyph still: idle is still, so the HUD never repaints for nothing.
        .child(h_flex().flex_none().gap(14).pr(24).items_center()
          .child(h_flex().gap(6).items_end()
            .child(div().pb(5).child(glyph({ ...C, flow: C.flowInv }, "working", { size: 11, still: working === 0 })))
            .child(odometer("odo-working", working, working ? C.barText : C.barSlash, 22))
            .child(micro("Working", C.barMuted).pb(4)))
          .when(done.length > 0, (el) => el.child(h_flex().id("hud-done").h(24).pl(6).pr(9).gap(6).items_center().rounded_full().border_1().border_color(C.barRule)
            .cursor_pointer().hover((h) => h.bg(C.barRule)).on_click(() => goTo(done[0])).tooltip("Go to the first agent that finished a turn")
            .child(glyph(C, "done", { size: 11 }))
            .child(odometer("odo-done", done.length, C.barText, 13))
            .child(micro("Finished ▶", C.barText)))))
        .child(rule())
        // The focused agent: who it runs as (click: Account), its model, effort and branch, its context.
        // Grows into the free width and, on a narrow window, shrinks along with the limits.
        .child(h_flex().flex_auto().min_w(0).px(24).gap(24).items_center().justify_center().overflow_hidden()
          .when(Boolean(account), (el) => el.child(v_flex().id("hud-account").flex_shrink(1).max_w(240).min_w(80).gap(QUOTA.rowGap).cursor_pointer().on_click(accountClick)
            .tooltip("Move this chat to another Claude account, or manage accounts")
            .child(h_flex().h(QUOTA.top).gap(QUOTA.colGap).items_end().min_w(0)
              .child(micro("Focused", C.barMuted).flex_none())
              .child(div().min_w(0).truncate().text_size(13).font_semibold().line_height(1).text_color(C.barText).child(account)))
            .child(h_flex().h(QUOTA.bottom).items_center().child(micro("Switch account ▾", C.barMuted)))))
          .child(spaced([focus?.model ?? "No agent", focus?.effort, midTrunc(space?.branch), space?.machine], C.barText, { rest: C.barMuted }).flex_shrink(1))
          .child(v_flex().w(170).flex_none().gap(5)
            .child(h_flex().justify_between().items_end()
              .child(micro("Context", C.barMuted))
              .child(h_flex().gap(3).items_end().text_size(11).text_color(C.barText)
                .child(div().font_semibold().child(focus?.ctx ? fmtTokens(focus.ctx.used) : "—"))
                .child(micro(focus?.ctx ? `/${fmtTokens(focus.ctx.total)}` : "", C.barMuted))))
            .child(div().relative().h(3).bg("#383838")
              .child(div().id("hud-ctx").absolute().left(0).top(0).h(3).w(1.7 * pct).bg(pct >= 75 ? C.red : C.barText).transition("width", MOTION.count.roll)))))
        .when(Boolean(limits), (el) => el.child(rule()))
        // The account's limits. The slot's size is what they may use; narrower drops the bars, then "used".
        .child(h_flex().id("hud-limits").flex_none().flex_shrink(1).w(limits ? usageWidth(limits, TIERS[0], QUOTA_M) + 48 : 0)
          .min_w(limits ? usageWidth(limits, TIERS[TIERS.length - 1], QUOTA_M) + 40 : 0).overflow_hidden().px(20).gap(QUOTA.between).items_center().justify_end()
          .on_size_change((size, cx) => { if (Math.abs(size.width - 40 - this.slotW) > 1) { this.slotW = size.width - 40; cx.notify(); } })
          .when(Boolean(limits), (el) => el.cursor_pointer().on_click(accountClick)
            .tooltip(claude ? "Move this chat to another Claude account, or manage accounts" : "Manage Claude accounts"))
          .children(limits ? limits.flatMap((w, i) => (i ? [rule(), quota(w, i)] : [quota(w, i)])) : []))
        // Opens to 176px while anyone needs input; the block inside is fixed, the opening clips it.
        .child(div().id("hud-needs").relative().h_full().flex_none().overflow_hidden().w(blocked.length ? NEEDS_W : 0).transition("width", MOTION.count.needs)
          .cursor_pointer().on_click(() => blocked[0] && goTo(blocked[0]))
          .child(h_flex().absolute().left(0).top(0).w(NEEDS_W).h_full().px(14).gap(8).items_center().bg(C.signal)
            .child(odometer("odo-needs", blocked.length, C.ink, 16))
            .child(micro("Needs input", C.ink).flex_1())
            .child(div().size(20).rounded_full().bg(C.ink).text_color(C.signal).flex().items_center().justify_center().text_size(8).child("▶")))))));
  }
}
