// squadmenu: the right-click menu in Squads, a popup at the pointer. The items are squads.js
// (chatMenu, squadMenu), read again at every render so a chat that stops being idle dims Archive.
//   props {role: "squadmenu", kind: "chat", terminal, snap: Session | null}
//     Rename and Archive open the session card's confirm dialog (actions.js); Pin runs terminal.pin.
//   props {role: "squadmenu", kind: "squad", id}
//     Rename squad asks the list to edit the header in place (shared "endfield.squad.rename");
//     Move up and Move down run the space.move the item carries.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, run, spaces, setShared } from "herdr";
import { palette, root, micro } from "./kit.js";
import { roster } from "./roster.js";
import { chatMenu, squadMenu } from "./squads.js";
import { openAction } from "./actions.js";

const ROW = 30;
const PAD = 6;
const TITLE = 26;

const order = () => spaces().map((s) => ({ id: s.id, machine: s.machine ?? null }));

function itemsOf(p) {
  const R = roster();
  if (p.kind === "chat") return chatMenu(R.all.get(p.terminal));
  return squadMenu(order(), R.squads, p.id);
}

/** Opens the menu at the pointer, or nothing when the row or header has no items. */
export function openSquadMenu(p) {
  const n = itemsOf(p).length;
  if (!n) return;
  openOverlay({ mod: "endfield", kind: "popup", width: 210, height: TITLE + n * ROW + 2 * PAD, props: { role: "squadmenu", ...p } });
}

export class SquadMenu {
  pick(p, item) {
    closeOverlay(p.overlay);
    if (p.kind === "chat") {
      if (item.key === "pin") run("terminal.pin", { terminal: p.terminal, pinned: !roster().all.get(p.terminal)?.agent?.pinned });
      else openAction({ terminal: p.terminal, action: item.key, snap: p.snap ?? null });
      return;
    }
    if (item.key === "rename") setShared("endfield.squad.rename", { id: p.id, at: Date.now() });
    else run("space.move", item.move);
  }

  render() {
    const C = palette();
    const p = props();
    const R = roster();
    const m = p.kind === "chat" ? R.all.get(p.terminal) : null;
    const q = p.kind === "squad" ? R.squads.find((s) => s.id === p.id) : null;
    const title = m ? `${m.ident.callsign}  ${m.title ?? ""}` : q ? `Squad ${q.num}  ${q.name}` : "Gone";
    return root(C, v_flex().w_full().p(PAD).bg(C.raised)
      .child(div().h(TITLE).px(8).flex().items_center().child(micro(title, C.muted).truncate()))
      .children(itemsOf(p).map((item) => h_flex().id(`sm-${item.key}`).h(ROW).px(8).gap(10).rounded(3).items_center()
        .text_size(12.5).font_medium()
        .when(Boolean(item.why), (el) => el.opacity(0.45).tooltip(item.why))
        .when(!item.why, (el) => el.cursor_pointer().hover((h) => h.bg(C.sunken)).on_click(() => this.pick(p, item)))
        .child(div().flex_1().child(item.label)))));
  }
}
