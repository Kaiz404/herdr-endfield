// comms: who sent what to whom, newest first, and the Comms pane that shows it.
// A message is one delivery: { at (ms), from, to (a terminal address, "you" or "hc"),
//   kind: task | msg | reply | screen | needs | error | action, via (the transport: a text, or [what, how] drawn apart), text, unverified? }.
// Two sources, and the pane says so:
//   1. the skin's own log, one JSON line per Dispatch, in data/endfield/comms.jsonl, kept under
//      512 KB (messages.js) and removed by uninstall;
//   2. reports agents receive: hc delivers a child's `hc send` to an agent as a line tagged
//      <hc from="t7 name">...</hc>, which `hc read` finds in the recipient's screen text. Anything can
//      print such a line, so only a live sender counts and each is drawn "unverified" (messages.js).
// Not visible: sends to plain programs (hc tags only what an agent receives), Claude Code's own
// SendMessage, and anything that has scrolled out of a terminal's history.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { readTextFile, writeTextFile, appHome, panes, spaces, run, exec, checking, shared, setShared } from "herdr";
import { palette, root, micro, spaced, wide, chip, barcode, dots, MOTION, FONT } from "./kit.js";
import { roster } from "./roster.js";
import { appendCapped, readTags, remember } from "./messages.js";
import { PANE_ROLES, paneRole, opening } from "./fleet.js";

const LOG = () => `${appHome()}/data/endfield/comms.jsonl`;
const SCAN_MS = 15000;
// Screens read at once, and how long one may take: an unreachable machine must not hold a scan.
const READS_AT_ONCE = 6;
const READ_MS = 5000;

export async function readLog() {
  let text = "";
  try { text = (await readTextFile(LOG())) ?? ""; } catch {}
  return text.split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).reverse();
}

/** Appends one message, the oldest dropped past the cap; passes the text it read as `expected`, so a concurrent writer is refused rather than overwritten. */
export async function append(msg) {
  let text = null;
  try { text = await readTextFile(LOG()); } catch {}
  await writeTextFile(LOG(), appendCapped(text, JSON.stringify(msg)), text);
}

export const KIND = {
  task: { tag: "Task", edge: "flow" },
  msg: { tag: "Message", edge: "flow" },
  reply: { tag: "Reply", edge: "lime" },
  screen: { tag: "Screen line", edge: "hairStrong" },
  needs: { tag: "Needs input", edge: "signal" },
  error: { tag: "Exited", edge: "red" },
  action: { tag: "Action", edge: "hairStrong" },
};

const shownTab = () => spaces().find((s) => s.active)?.tabs.find((t) => t.active)?.id;

/** The Comms pane in the shown tab, if one is open. */
export const commsPane = () => {
  const tab = shownTab(), reg = shared(PANE_ROLES);
  return panes().find((p) => p.tab === tab && paneRole(reg, p) === "comms") ?? null;
};
export const openComms = () => {
  const open = commsPane();
  if (open) return run("pane.close", { pane: open.pane });
  setShared(PANE_ROLES, opening(shared(PANE_ROLES), panes(), shownTab(), "comms"));
  run("pane.split", { direction: "right", mod: "endfield", props: { role: "comms" } });
};

const ago = (ms) => (ms < 60000 ? "now" : ms < 3600000 ? `${Math.floor(ms / 60000)}m ago` : `${Math.floor(ms / 3600000)}h ago`);

export class Comms {
  init(_p, cx) {
    this.log = [];
    this.tagged = new Map();
    this.filter = "all";
    this.fresh = null;
    if (checking()) return;
    // One scan at a time: a slow one is skipped over, never stacked.
    const load = (cx) => {
      if (this.loading) return;
      this.loading = true;
      cx.spawn(async (cx) => { try { await this.load(); } finally { this.loading = false; } cx.notify(); });
    };
    load(cx);
    // Data, not animation: the log and the screens are read again every 15s while the pane exists.
    cx.timer.every(SCAN_MS, (cx) => load(cx));
  }

  async load() {
    const before = this.log[0]?.at;
    this.log = await readLog();
    if (before && this.log[0]?.at !== before) this.fresh = this.log[0]?.at;
    const R = roster();
    const live = new Set(R.all.keys());
    const queue = R.flat.filter((x) => x.agent);
    const reader = async () => {
      for (let m = queue.shift(); m; m = queue.shift()) {
        try {
          const r = await exec("hc", ["read", m.address, "--lines", "400"], { timeout: READ_MS });
          remember(this.tagged, readTags(r.stdout, { to: m.address, live, kids: m.kids }), Date.now());
        } catch {}
      }
    };
    await Promise.all(Array.from({ length: READS_AT_ONCE }, reader));
  }

  person(C, R, who) {
    if (who === "you") return h_flex().gap(6).items_center().child(div().size(22).rounded_full().bg(C.ink).border_2().border_color(C.signal).flex().items_center().justify_center().text_size(5.5).font_semibold().text_color(C.signal).child("YOU")).child(wide("You", C.text, 9));
    const m = R.all.get(who);
    if (!m) return h_flex().gap(6).items_center().child(div().size(22).rounded(3).bg(C.sunken).border_1().border_color(C.hairStrong).flex().items_center().justify_center().font_family(FONT.mono).text_size(7).child(who === "hc" ? "hc" : who)).child(wide(who === "hc" ? "hc note" : who, C.text, 9));
    return h_flex().gap(6).items_center().child(chip(C, m.ident, m.status, { size: 22, ground: C.raised })).child(wide(`${m.ident.callsign} ${m.address}`, C.text, 9));
  }

  render(cx) {
    const C = palette();
    const R = roster();
    const now = Date.now();
    const all = [...this.log.map((x) => ({ ...x, src: "log" })), ...[...this.tagged.values()].map((x) => ({ ...x, src: "tag", via: ["hc send", "tag read from its screen (hc read)", "unverified"] }))].sort((a, b) => b.at - a.at);
    const list = all.filter((x) => this.filter === "all" || (this.filter === "you" ? x.from === "you" || x.to === "you" : x.src === "tag"));
    const space = spaces().find((s) => s.active);
    const filterBtn = (k, label) => {
      const on = this.filter === k;
      return h_flex().id(`cm-f-${k}`).h(22).px(9).items_center().rounded_full().border_1().cursor_pointer().border_color(on ? C.selBg : C.hairStrong).when(on, (el) => el.bg(C.selBg))
        .on_click((_e, cx) => { this.filter = k; cx.notify(); }).child(micro(label, on ? C.selText : C.text));
    };
    const card = (x) => {
      const k = KIND[x.kind] ?? KIND.msg;
      const id = `cm-${x.at}-${x.from}-${x.to}`;
      const fresh = this.fresh === x.at;
      return h_flex().id(id).relative().gap(12).px(14).py(12).border_b(1).border_color(C.hair)
        .opacity(fresh ? 0 : 1).top(fresh ? 8 : 0).transition("opacity", MOTION.comms.enter).transition("top", MOTION.comms.enter)
        .child(div().absolute().left(0).top(0).bottom(0).w(3).bg(C[k.edge]))
        .child(v_flex().w(62).flex_none().gap(5).child(micro(new Date(x.at).toTimeString().slice(0, 8), C.text)).child(micro(ago(now - x.at), C.muted)))
        .child(v_flex().flex_1().min_w(0).gap(8)
          .child(h_flex().gap(8).items_center().min_w(0)
            .child(this.person(C, R, x.from)).child(div().text_size(9).text_color(C.flow).child("▶▶")).child(this.person(C, R, x.to))
            .child(div().flex_1())
            .when(Boolean(x.unverified), (el) => el.child(div().id(`${id}-unv`).h(16).px(6).flex().items_center().border_1().border_color(C.hairStrong)
              .tooltip("Read from the recipient's screen: any program there could have printed it").child(micro("Unverified", C.muted, 9))))
            .child(div().h(16).px(6).flex().items_center().bg(k.edge === "flow" || k.edge === "hairStrong" ? C.sunken : C[k.edge]).child(micro(k.tag, k.edge === "flow" || k.edge === "hairStrong" ? C.text : C.ink, 9))))
          .child(h_flex().gap(8).items_stretch()
            .child(div().w(4).flex_none().border_t(1.5).border_b(1.5).border_l(1.5).border_color(C.text))
            .child(div().flex_1().min_w(0).py(5).font_family("JetBrains Mono").text_size(12).line_height(1.45).child(x.text))
            .child(div().w(4).flex_none().border_t(1.5).border_b(1.5).border_r(1.5).border_color(C.text)))
          .child(spaced([x.via ?? ""].flat(), C.muted, { rest: C.dim })));
    };
    if (this.fresh) cx.timer.after(MOTION.settle.delay, (cx) => { this.fresh = null; cx.notify(); });
    return root(C, v_flex().size_full().bg(C.raised)
      .child(v_flex().flex_none().px(14).pt(12).pb(10).gap(8).border_b(1).border_color(C.hair)
        .child(h_flex().gap(8).items_center().child(div().text_size(13).font_semibold().child("// Comms")).child(barcode(C.cross)).child(div().flex_1())
          .child(spaced([space?.name, [String(all.length).padStart(2, "0"), C.text], ["Newest first", C.dim]], C.muted)))
        .child(h_flex().gap(6).child(filterBtn("all", "All")).child(filterBtn("you", "You")).child(filterBtn("tags", "Reports")))
        .child(div().text_size(11).line_height(1.4).text_color(C.muted)
          .child("Sources: the Dispatch log this skin writes, and <hc from> reports found in agents' screens (hc read, every 15s). Not shown: sends to plain programs, Claude Code SendMessage, and anything scrolled out of history.")))
      .child(v_flex().id("cm-list").relative().flex_1().min_h(0).overflow_y_scrollbar()
        .when(list.length === 0, (el) => el.child(v_flex().relative().h(160).items_center().justify_center().gap(6).overflow_hidden()
          .child(dots(C.dot))
          .child(div().relative().text_size(13).font_medium().child("No messages yet"))
          .child(div().relative().text_size(12).text_color(C.muted).child("Dispatch sends the first one."))))
        .children(list.map(card))));
  }
}
