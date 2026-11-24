// Endfield: the whole chrome of the Endfield layout is this one mod, in roles.
// The layout and overlays give each copy props { role }:
//   boot      the start-up screen, an overlay the brand opens when the layout starts
//   brand     mark, name, machine and version, the one tri-colour bar
//   footer    settings and add machine
//   spaces    spaces by machine, worktrees nested, drag to reorder
//   agents    agents by priority or space, sub-agents as a production chain
//   sortmenu  the agents list's sort popup
//   squadmenu the right-click menu on a Squads chat row or squad header
//   card      a session card beside the agents list, an overlay window the list opens
//   tabs      the tab strip, + menu, Files/Changes, window buttons
//   pane      a pane's header (the layout's pane frame)
//   status    the ink status bar
//   toast     every notification: the layout's `toast` is this mod, and Herdr gives it no role
//   cutin     the needs-input skill caption, an overlay window the toast opens
//   report    the oversight screen, the work area's other stack child
//   dispatch  the Dispatch dialog (hc send / hc run, on the person's click)
//   comms     the Comms pane: who sent what to whom
//   action    a session card action's confirm dialog (the exact hc command, on the person's click)
//   archived  the archived chats, each with Resume
//   account   moves a Claude Code chat to another saved login (a new tab resumes it there, on the click)
//   transcript  a Claude Code sub-agent's transcript, a pane Squads opens right of its parent

import { View, div } from "gpui-kit";
import { props } from "herdr";
import { Brand, Footer, Boot } from "./brand.js";
import Spaces from "./spaces.js";
import { Agents, SortMenu } from "./agents.js";
import { Card } from "./card.js";
import Tabs from "./tabs.js";
import PaneHeader from "./pane.js";
import Status from "./status.js";
import { Toast } from "./toast.js";
import { CutIn } from "./cutin.js";
import { Report } from "./report.js";
import { Dispatch } from "./dispatch.js";
import { Comms } from "./comms.js";
import { Transcript } from "./transcript.js";
import { ActionDialog, Archived, AccountDialog } from "./actions.js";
import { SquadMenu } from "./squadmenu.js";

const ROLES = { boot: Boot, brand: Brand, footer: Footer, spaces: Spaces, agents: Agents, sortmenu: SortMenu, squadmenu: SquadMenu, card: Card, tabs: Tabs, pane: PaneHeader, status: Status, toast: Toast, cutin: CutIn, report: Report, dispatch: Dispatch, comms: Comms, transcript: Transcript, action: ActionDialog, archived: Archived, account: AccountDialog };
// Herdr opens the layout's toast mod with notification props and no role.
const roleOf = (p) => p.role ?? (p.overlay && "title" in p ? "toast" : null);

export default class Endfield extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const R = ROLES[roleOf(pr)];
    this.role = R ? new R() : null;
    this.role?.init?.(pr, cx);
  }

  close(cx) {
    return this.role?.close?.(cx);
  }

  render(cx) {
    if (!this.role) return div().child(`endfield: no role "${roleOf(props() ?? {})}"`);
    return this.role.render(cx);
  }
}
