// Endfield: the whole chrome of the Endfield layout is this one mod, in roles.
// The layout and overlays give each copy props { role }:
//   boot      the start-up screen, an overlay the brand opens when the layout starts
//   brand     mark, name, machine · version, the one tri-colour bar
//   footer    settings and add machine
//   spaces    spaces by machine, worktrees nested, drag to reorder
//   agents    agents by priority or space, sub-agents as a production chain
//   sortmenu  the agents list's sort popup
//   card      a session card beside the agents list, an overlay window the list opens
//   tabs      the tab strip, + menu, Files/Changes, window buttons
//   pane      a pane's header (the layout's pane frame)
//   status    the ink status bar

import { View, div } from "gpui-kit";
import { props } from "herdr";
import { Brand, Footer, Boot } from "./brand.js";
import Spaces from "./spaces.js";
import { Agents, SortMenu } from "./agents.js";
import { Card } from "./card.js";
import Tabs from "./tabs.js";
import PaneHeader from "./pane.js";
import Status from "./status.js";

const ROLES = { boot: Boot, brand: Brand, footer: Footer, spaces: Spaces, agents: Agents, sortmenu: SortMenu, card: Card, tabs: Tabs, pane: PaneHeader, status: Status };

export default class Endfield extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const R = ROLES[pr.role];
    this.role = R ? new R() : null;
    this.role?.init?.(pr, cx);
  }

  close(cx) {
    return this.role?.close?.(cx);
  }

  render(cx) {
    if (!this.role) return div().child(`endfield: no role "${props()?.role}"`);
    return this.role.render(cx);
  }
}
