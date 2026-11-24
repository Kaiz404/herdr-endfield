// squadmenu: the right-click menu on a squad header in Squads, a popup at the pointer. The items
// are squads.js squadMenu, read again at every render. props {role: "squadmenu", id}.
// Rename squad asks the list to edit the header in place (shared "endfield.squad.rename"); Move up
// and Move down run the space.move the item carries. An agent row has no menu: a right-click
// holds its session card open (agents.js).

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, run, spaces, setShared } from "herdr";
import { palette, root, micro } from "./kit.js";
import { roster } from "./roster.js";
import { squadMenu } from "./squads.js";

const ROW = 30;
const PAD = 6;
const TITLE = 26;

const order = () => spaces().map((s) => ({ id: s.id, machine: s.machine ?? null }));

const itemsOf = (id) => squadMenu(order(), roster().squads, id);

/** Opens squad `id`'s menu at the pointer, or nothing when the header has no items (Pinned). */
export function openSquadMenu(id) {
  const n = itemsOf(id).length;
  if (!n) return;
  openOverlay({ mod: "endfield", kind: "popup", width: 210, height: TITLE + n * ROW + 2 * PAD, props: { role: "squadmenu", id } });
}

export class SquadMenu {
  pick(p, item) {
    closeOverlay(p.overlay);
    if (item.key === "rename") setShared("endfield.squad.rename", { id: p.id, at: Date.now() });
    else run("space.move", item.move);
  }

  render() {
    const C = palette();
    const p = props();
    const q = roster().squads.find((s) => s.id === p.id);
    const title = q ? `Squad ${q.num}  ${q.name}` : "Gone";
    return root(C, v_flex().w_full().p(PAD).bg(C.raised)
      .child(div().h(TITLE).px(8).flex().items_center().child(micro(title, C.muted).truncate()))
      .children(itemsOf(p.id).map((item) => h_flex().id(`sm-${item.key}`).h(ROW).px(8).gap(10).rounded(3).items_center()
        .text_size(12.5).font_medium()
        .when(Boolean(item.why), (el) => el.opacity(0.45).tooltip(item.why))
        .when(!item.why, (el) => el.cursor_pointer().hover((h) => h.bg(C.sunken)).on_click(() => this.pick(p, item)))
        .child(div().flex_1().child(item.label)))));
  }
}
