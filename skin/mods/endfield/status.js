// status: the ink bar along the bottom. Where you are, how many agents are in each
// state (numbers are the headline), machine and branch, and the palette key.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, run } from "herdr";
import { palette, root, hatch, statusOf, micro, pad2, binding, odometer, Entrance, FONT } from "./kit.js";

// The counts the bar reports, in reading order.
const COUNTS = ["working", "blocked", "done"];

export default class Status {
  init(_props, cx) {
    this.entrance = new Entrance(3);
    this.entrance.start(cx);
  }

  render() {
    const C = palette();
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((t) => t.active);
    const list = agents();
    const count = (s) => list.filter((a) => a.status === s).length;
    const key = binding("app.palette");
    const crumb = (text) => div().min_w(0).truncate().text_color(C.barText).child(text);
    const tally = (s) => {
      const st = statusOf(s), n = count(s);
      if (st.kind === "pill" && n > 0) {
        return h_flex().flex_none().h(18).pl(7).pr(9).gap(6).items_center().rounded_full().bg(C.signal)
          .child(odometer(`odo-pill-${s}`, n, C.ink, 11.5)).child(micro(st.word, C.ink).font_weight(500));
      }
      return h_flex().flex_none().gap(6).items_center()
        .child(odometer(`odo-${s}`, n, n > 0 ? C.barText : C.barSlash, 12.5)).child(micro(st.word, C.barMuted));
    };
    return root(C, this.entrance.apply(h_flex().relative().size_full().bg(C.bar)
      .child(hatch(C.barHatch))
      .child(h_flex().relative().size_full().px(14).gap(18).items_center()
        .child(h_flex().flex_shrink(1).min_w(0).gap(4).items_center().text_size(12).font_medium()
          .child(div().flex_none().text_color(C.barSlash).child("//"))
          .child(crumb(space?.name ?? "No space"))
          .when(Boolean(tab), (el) => el.child(div().flex_none().text_color(C.barSlash).child("/")).child(crumb(tab.named ? tab.name : `Tab ${pad2(tab.index)}`))))
        .child(div().w(1).h(12).flex_none().bg(C.barRule))
        .children(COUNTS.map(tally))
        .child(div().flex_1())
        .when(Boolean(space?.branch), (el) => el.child(micro(space.branch, C.barMuted).flex_shrink(1).min_w(0).truncate()))
        .child(micro(space?.machine ?? "Local", C.barMuted).flex_none())
        .child(div().w(1).h(12).flex_none().bg(C.barRule))
        .child(div().id("palette").flex_none().cursor_pointer().on_click(() => run("app.palette"))
          .child(micro(key ? `${key} · Commands` : "Commands", C.barMuted).font_family(FONT.mono))))));
  }
}
