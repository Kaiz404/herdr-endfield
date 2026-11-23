// agents: every agent, most urgent first (or by space), parents carrying their
// sub-agents as a production chain. Behaviour ported from the shipped `agents`
// mod: setAgentOrder, sort modes, pins, peek for sub-agents, title cleaning,
// time since the last state change. Claude Code agents also show their model and
// context (sessions.js), their own sub-agents read from the transcript, and a
// session card while hovered (card.js).

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, layout, run, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props } from "herdr";
import { palette, root, narrow, find, toggleSidebar, rank, statusOf, statusMark, glyph, hazardTick, tile, micro, icon, pad2, duration, telling, wipe, slide, nudge, flicker, contour, Entrance, StatusFx, MOTION, IDENTITY } from "./kit.js";
import { Sessions, isClaude } from "./sessions.js";
import { CARD, cardHeight } from "./card.js";

// Fixed heights, so the selection block knows where the selected row starts.
const H = { row: 50, sub: 40, head: 28 };
// Claude Code sub-agents shown under a parent: every working one, else the newest few.
const NATIVE_SHOWN = 4;

const cwdOf = (a) => panes().find((p) => p.terminal === a.address)?.cwd ?? terminals().find((t) => t.address === a.address)?.cwd ?? null;

// Right-angle hairlines from the parent: a production chain, one column per depth.
function chain(lines, line) {
  return lines.map((l, d) => div().absolute().left(28 + 16 * d).top(-6).w(10).flex_none()
    .when(l === "│", (el) => el.bottom(0).border_l(1).border_color(line))
    .when(l === "├", (el) => el.bottom(0).border_l(1).border_color(line).child(div().absolute().left(0).top(26).w(10).h(1).bg(line)))
    .when(l === "└", (el) => el.h(26).border_l(1).border_b(1).border_color(line)));
}

/** Five 5x6 blocks: how full the context is, at a glance. */
function miniGauge(C, ctx, inv) {
  const on = Math.round((Math.min(100, ctx.pct) / 100) * 5);
  const lit = inv ? C.selText : ctx.pct >= 75 ? C.error : C.text;
  return h_flex().gap(2).flex_none().children(Array.from({ length: 5 }, (_, k) => div().w(5).h(6).bg(k < on ? lit : inv ? C.selMuted : C.hairStrong)));
}

// A sub-agent without a pane isn't in agents(): error counts as blocked, and it's
// never done (it reports to its parent, whose done is the news).
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};

const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

// A tab nobody named (or named after its program) reads as its agent's live title.
function title(tab, lead) {
  const live = telling(lead);
  return (tab.name === lead?.program?.name || !tab.named) && live ? live : tab.name;
}

export class SortMenu {
  render() {
    const C = palette();
    const on = sortOf().id;
    return root(C, v_flex().w_full().p(6).bg(C.raised)
      .child(div().px(8).pt(4).pb(8).child(micro("Sort agents", C.muted)))
      .children(SORTS.map((s) => h_flex().id(`sort-${s.id}`).h(30).px(8).gap(10).rounded(3).items_center()
        .text_size(12.5).font_medium()
        .when(s.id === on, (el) => el.bg(C.selBg).text_color(C.selText))
        .when(s.id !== on, (el) => el.hover((h) => h.bg(C.sunken)))
        .on_click(() => { setShared("agents.sort", s.id); closeOverlay(props().overlay); })
        .child(icon(s.icon, 14).text_color(s.id === on ? C.selMuted : C.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(div().w(2).h(14).bg(C.signal))))));
  }
}

export class Agents {
  init(_props, cx) {
    this.folded = new Set();
    this.width = 0;
    this.fx = new StatusFx();
    this.entrance = new Entrance(2);
    this.entrance.start(cx);
    try { this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}"); } catch { this.changed = {}; }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
    // Data, not animation: the "3m" labels age, and the operator assignments are reread.
    IDENTITY.refresh();
    cx.timer.every(30000, (cx) => { IDENTITY.refresh(); cx.notify(); });
    this.bounds = {};
    this.info = {};
    this.card = { open: null, hot: null, seq: 0 };
    // The one card this list owns; a card that isn't it (left from a reload) closes itself.
    setShared("endfield.card.open", null);
    this.sessions = new Sessions("agents");
    this.sessions.start(cx,
      () => agents().filter(isClaude).map((a) => ({ terminal: a.address, cwd: cwdOf(a), status: a.status })),
      () => !narrow() && !find(layout(), "sidebar")?.hidden);
  }

  close() {
    this.sessions.stop();
    if (this.card.open) closeOverlay(this.card.open.id);
    setShared("endfield.card.open", null);
  }

  /**
   * The card follows the pointer with a grace period: the wanted card is the hovered agent row's,
   * else the open one while the pointer is on it. Every hover change re-arms one timer.
   */
  cardTick(cx) {
    const seq = ++this.card.seq;
    const rowOf = () => (agents().some((a) => a.address === this.hovered) ? this.hovered : null);
    const row = rowOf();
    cx.timer.after((row && row !== this.card.open?.address ? MOTION.cardOpen : MOTION.cardClose).delay, () => {
      if (seq !== this.card.seq) return;
      const open = this.card.open;
      const want = rowOf() ?? (open && this.card.hot === open.id ? open.address : null);
      if (want === open?.address) return;
      if (open) closeOverlay(open.id);
      this.card.open = want ? this.openCard(want) : null;
      setShared("endfield.card.open", this.card.open?.id ?? null);
    });
  }

  // Beside the row, its top 12px above the row's (or its bottom 12px below, near the window's foot).
  openCard(address) {
    const b = this.bounds[address];
    const a = agents().find((x) => x.address === address);
    if (!b || !a) return null;
    const s = this.sessions.get(address);
    const tall = cardHeight(a.status === "blocked" && s?.question) + 2 * CARD.pad;
    let winH = 900;
    try { winH = window.bounds().height; } catch {}
    let y = b.y - 12 - CARD.pad;
    if (y + tall > winH - 8) y = b.y + b.height + 12 + CARD.pad - tall;
    const id = openOverlay({
      mod: "endfield", kind: "window", frame: "none",
      at: { x: Math.round(b.x + b.width - 12 - CARD.pad), y: Math.round(Math.max(0, y)) },
      width: CARD.width + CARD.slide + 2 * CARD.pad,
      height: tall,
    });
    return { id, address };
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a finished agent isn't it doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  hover(address) {
    return (over, cx) => {
      if (over) this.hovered = address;
      else if (this.hovered === address) this.hovered = null;
      this.cardTick(cx);
      cx.notify();
    };
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [{ t: k, lines: [...lead, last ? "└" : "├"] }, ...this.tree(all, k.address, [...lead, last ? "" : "│"])];
    });
  }

  subRow(C, s, shown) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const on = k.address === shown;
    const fg = on ? C.selText : C.text;
    const line = on ? C.selMuted : C.hairStrong;
    const hot = this.hovered === k.address;
    return h_flex()
      .id(`sub-${k.address}`)
      .relative()
      .h(H.sub)
      .flex_none()
      .pl(28 + 16 * (s.lines.length - 1))
      .pr(14)
      .gap(10)
      .items_center()
      .on_hover(this.hover(k.address))
      .child(wipe(`sub-hover-${k.address}`, C.sunken, this.width, hot && !on))
      .on_click(() => (this.listed.has(k.address) ? run("pane.focus", { terminal: k.address }) : run("terminal.peek", { terminal: k.address })))
      .children(chain(s.lines, line))
      .child(div().w(12).flex_none())
      .child(tile(C, k.program, st, { size: 22, inv: on, id: `sub-tile-${k.address}`, hot }))
      .child(nudge(v_flex(), `sub-label-${k.address}`, hot).flex_1().min_w(0).gap(4)
        .child(div().truncate().text_size(12.5).font_medium().text_color(fg).child(k.name || k.template || k.program?.name || k.address))
        .child(h_flex().gap(8).items_center().child(statusMark(C, st, { inv: on, size: 10.5 }) ?? div())
          .child(micro(`Sub-agent · ${k.address}`, on ? C.selMuted : C.muted).truncate())));
  }

  /** A Claude Code sub-agent, read from its transcript: click opens that transcript beside its parent. */
  nativeRow(C, parent, k, lines) {
    const key = `sa-${k.id}`;
    const hot = this.hovered === key;
    return h_flex().id(key).relative().h(H.sub).flex_none().pl(28 + 16 * (lines.length - 1)).pr(14).gap(10).items_center().cursor_pointer()
      .on_hover(this.hover(key))
      .child(wipe(`${key}-hover`, C.sunken, this.width, hot))
      .on_click(() => this.openTranscript(parent, k))
      .tooltip("Open the transcript beside it")
      .children(chain(lines, C.hairStrong))
      .child(div().w(12).flex_none())
      .child(tile(C, parent.program, k.status, { size: 22, id: `${key}-tile`, hot }))
      .child(nudge(v_flex(), `${key}-label`, hot).flex_1().min_w(0).gap(4)
        .child(div().truncate().text_size(12.5).font_medium().child(k.title))
        .child(h_flex().gap(8).items_center().child(statusMark(C, k.status, { size: 10.5 }) ?? div())
          .child(micro([k.model?.short, `${pad2(k.tools)} tools`].filter(Boolean).join(" · "), C.muted).truncate())));
  }

  // One split per click: a double-click or a quick second press would stack two panes (or two
  // failure toasts if the split can't happen).
  openTranscript(parent, k) {
    const now = Date.now();
    if (now - (this.splitAt ?? 0) < 1000) return;
    this.splitAt = now;
    run("pane.split", { direction: "right", pane: parent.pane, mod: "endfield-transcript", props: { path: k.path, title: k.title } });
  }

  natives(a) {
    const all = this.sessions.get(a.address)?.subagents ?? [];
    const working = all.filter((k) => k.status === "working").length;
    const shown = all.slice(0, Math.max(NATIVE_SHOWN, working));
    return { shown, hidden: all.length - shown.length };
  }

  render(cx) {
    const C = palette();
    const collapsed = narrow();
    const hot = shared("endfield.card.hot") ?? null;
    if (hot !== this.card.hot) { this.card.hot = hot; this.cardTick(cx); }
    const sort = sortOf();
    const byPriority = sort.id === "priority";
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    for (const a of list) this.fx.track(a.address, a.status, cx);
    // A kept sub-agent (one with a pane) is in agents() too: under its parent's tree it gets no row of its own unless pinned.
    const nested = new Set(collapsed ? [] : list.flatMap((a) => this.tree(all, a.address).map((s) => s.t.address)));
    list = list.filter((a) => a.pinned || !nested.has(a.address));
    const urgency = new Map(list.map((a) => [a.address, Math.max(rank(a.status), ...this.tree(all, a.address).map((s) => rank(kidStatus(s.t, this.listed))))]));
    if (byPriority) list = [...list].sort((x, y) => urgency.get(y.address) - urgency.get(x.address) || this.since(y) - this.since(x) || y.seq - x.seq);
    list = [...list.filter((a) => a.pinned), ...list.filter((a) => !a.pinned)];
    setAgentOrder(list.map((a) => a.address));

    const leads = leadPanes(panes());
    const tabs = new Map(spaces().flatMap((s) => s.tabs).map((tab) => [tab.id, tab]));
    const tabCounts = new Map();
    for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
    const label = (a) => {
      const tab = tabs.get(a.tab);
      const many = tabCounts.get(a.tab) > 1;
      const l = tab ? title(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : (a.title || "");
      return /^\d+$/.test(l) ? a.program?.name || l : l;
    };

    if (collapsed) return this.rail(C, list);

    const row = (a, subs, native) => {
      const on = a.focused;
      const session = this.sessions.get(a.address);
      const kids = subs.length + native.shown.length;
      const fg = on ? C.selText : C.text;
      const sub = on ? C.selMuted : C.muted;
      const when = this.since(a);
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      const where = [machine, a.space_name, a.tab_name && !/^\d+$/.test(a.tab_name) ? a.tab_name : pad2(a.tab_index)].filter(Boolean).join(" / ");
      const hovered = this.hovered === a.address;
      const fx = this.fx.of(a.address);
      const st = statusOf(a.status);
      this.info[a.address] = { title: label(a), where };
      return flicker(h_flex()
        .id(`ag-${a.address}`)
        .relative()
        .h(H.row)
        .flex_none()
        .pl(14)
        .pr(14)
        .gap(10)
        .items_center()
        .cursor_pointer()
        .on_hover(this.hover(a.address))
        .on_mouse_move((e) => { this.bounds[a.address] = e.bounds; })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .child(wipe(`ag-hover-${a.address}`, C.sunken, this.width, hovered && !on))
        // Only while working: a 1px segment rides the row's floor like a conveyor.
        .when(Boolean(st?.conveyor), (el) => el.child(div().absolute().left(0).right(0).bottom(0).h(1).overflow_hidden()
          .child(div().absolute().top(0).h(1).w(28).bg(C[on ? "flowInv" : "flow"]).loop("left", { from: -28, to: this.width, ...MOTION.conveyor }))))
        .when(statusOf(a.status)?.edge === "hazard", (el) => el.child(div().absolute().left(0).top(8).bottom(8).flex().child(hazardTick(34))))
        .child(div().relative().id(`agent-fold-${a.address}`)
          .when(kids > 0, (el) => el.tooltip(this.folded.has(a.address) ? `Show ${kids} sub-agents` : "Fold sub-agents").on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          }))
          .child(tile(C, a.program, a.status, { size: 26, inv: on, id: `ag-tile-${a.address}`, hot: hovered })))
        .child(nudge(v_flex(), `ag-label-${a.address}`, hovered).flex_1().min_w(0).gap(5)
          .child(h_flex().min_w(0).gap(6).items_center()
            .child(div().min_w(0).truncate().font_medium().text_color(fg).child(label(a)))
            .when(a.pinned, (el) => el.child(icon("pin", 11).text_color(sub)))
            .when(kids + native.hidden > 0 && (this.folded.has(a.address) || native.hidden > 0),
              (el) => el.child(micro(`+${this.folded.has(a.address) ? kids + native.hidden : native.hidden}`, sub))))
          .child(h_flex().min_w(0).gap(8).items_center()
            .child(statusMark(C, a.status, { inv: on, size: 11, id: `ag-disc-${a.address}`, pop: fx.pop }) ?? div())
            .when(Boolean(session?.model?.short), (el) => el.child(micro(session.model.short, sub).flex_none()))
            .child(micro(where, sub).min_w(0).truncate())))
        .child(v_flex().relative().self_start().pt(10).flex_none().items_end().gap(8)
          .when(hovered, (el) => el.child(div().id(`pin-${a.address}`).mt(-4).size(20).flex().items_center().justify_center().rounded(3)
            .text_color(sub).hover((h) => h.bg(on ? C.selMuted : C.hair).text_color(fg))
            .tooltip(a.pinned ? "Unpin" : "Pin to the top")
            .on_click((_e, cx) => {
              cx.stop_propagation();
              run("terminal.pin", { terminal: a.address, pinned: !a.pinned });
              // The row moves out from under the pointer, and no hover-out comes.
              this.hovered = null;
              cx.notify();
            })
            .child(icon(a.pinned ? "pin-off" : "pin", 12))))
          .when(!hovered && Boolean(when), (el) => el.child(micro(duration(now - when), sub)))
          .when(Boolean(session?.ctx), (el) => el.child(miniGauge(C, session.ctx, on)))), fx.flicker);
    };

    // Each entry carries its height and whether it is the selected one, for the selection block.
    // Claude Code's own sub-agents come first under the parent, then the ones it started with hc.
    const withKids = (a) => {
      const subs = this.tree(all, a.address);
      const native = this.natives(a);
      const count = subs.length + native.shown.length;
      const kids = this.folded.has(a.address) ? [] : [
        ...native.shown.map((k, i) => ({ el: this.nativeRow(C, a, k, [i === count - 1 ? "└" : "├"]), h: H.sub, on: false })),
        ...subs.map((s) => ({ el: this.subRow(C, s, shown), h: H.sub, on: s.t.address === shown })),
      ];
      return [{ el: row(a, subs, native), h: H.row, on: a.focused }, ...kids];
    };

    // Grouped mode: a `// space` header per run of neighbours; priority mode: the rows say their own status.
    const groups = [];
    for (const a of list) {
      const id = a.pinned ? "pinned" : byPriority ? "all" : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: a.pinned ? "Pinned" : byPriority ? null : a.space_name || "", members: [a] });
    }
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => (rank(a.status) > rank(m) ? a.status : m), null);
      return h_flex().id(g.id).h(H.head).pt(6).px(16).gap(8).flex_none().items_center().cursor_pointer()
        .on_click((_e, cx) => { open ? this.folded.add(g.id) : this.folded.delete(g.id); cx.notify(); })
        .child(micro(g.label, C.muted).min_w(0).truncate())
        .child(div().flex_1().h(1).bg(C.hair))
        .child(micro(pad2(g.members.length), C.muted))
        .when(!open && Boolean(top) && !statusOf(top)?.quiet, (el) => el.child(glyph(C, top, { size: 10 })))
        .child(icon(open ? "chevron-down" : "chevron-right", 10).text_color(C.muted));
    };
    const rows = groups.flatMap((g) => [...(g.label ? [{ el: header(g), h: H.head, on: false }] : []), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]);
    const at = rows.findIndex((r) => r.on);
    const top = rows.slice(0, Math.max(0, at)).reduce((y, r) => y + r.h, 0);
    const active = list.filter((a) => !statusOf(a.status)?.quiet).length;

    return root(C, this.entrance.apply(v_flex().size_full().min_h(0).bg(C.ground).border_t(1).border_color(C.hair)
      .child(h_flex().flex_none().h(44).pt(10).pl(16).pr(12).gap(10).items_center()
        .child(div().text_size(13).font_semibold().child("// Agents"))
        .child(div().flex_1())
        .child(micro(`${pad2(active)}/${pad2(list.length)} active`, C.muted))
        .child(div().id("ag-sort").h(20).w(28).flex_none().flex().items_center().justify_center().rounded_full().border_1().border_color(C.hairStrong)
          .text_color(C.text).hover((h) => h.bg(C.raised)).tooltip(`Sort agents: ${sort.label}`)
          .on_click(() => openOverlay({ mod: "endfield", kind: "popup", width: 210, height: 112, props: { role: "sortmenu" } }))
          .child(icon(sort.icon, 12))))
      .when(list.length === 0, (el) => el.child(v_flex().relative().h(120).flex_none().px(16).pt(8).gap(6).overflow_hidden()
        .child(contour(this.width || 248, 160, C.text))
        .child(micro("No agents reporting", C.muted))
        .child(div().text_size(12).line_height(1.45).text_color(C.muted)
          .child("Agents show up here when they report their status. Older versions and agents inside tmux may not."))))
      .child(v_flex().id("ag-list").flex_1().min_h(0).pb(8).overflow_y_scrollbar()
        .on_size_change((size, cx) => { this.width = size.width; cx.notify(); })
        .child(slide("ag-slide", C, top, rows[at]?.h ?? H.row).when(at < 0, (el) => el.opacity(0)))
        .children(rows.map((r) => r.el)))));
  }

  rail(C, list) {
    return root(C, this.entrance.apply(v_flex().size_full().min_h(0).bg(C.ground).border_t(1).border_color(C.hair)
      .child(v_flex().id("ag-list").flex_1().min_h(0).pt(6).gap(2).items_center().overflow_y_scrollbar()
        .children(list.map((a, i) => {
          const st = statusOf(a.status);
          return h_flex().id(`ag-${a.address}`).relative().w(28).h(28).flex_none().items_center().justify_center().rounded(2)
            .when(a.focused, (el) => el.bg(C.selBg))
            .when(!a.focused, (el) => el.hover((h) => h.bg(C.sunken)))
            .tooltip(`${a.space_name} · ${st?.word ?? a.status}`)
            .on_click(() => run("pane.focus", { pane: a.pane }))
            .child(st?.kind === "pill" ? div().size(16).rounded_full().bg(C.signal).flex().items_center().justify_center().text_size(10).font_bold().text_color(C.ink).child("!") : micro(pad2(i + 1), a.focused ? C.selText : C.muted, 9.5))
            .child(div().absolute().left(3).right(3).bottom(1).h(2).bg(C[st?.bar ?? "hairStrong"]));
        })))
      .child(h_flex().h(30).flex_none().items_center().justify_center()
        .child(div().id("collapse").size(24).flex().items_center().justify_center().rounded(3).text_color(C.muted)
          .hover((h) => h.bg(C.sunken).text_color(C.text)).tooltip("Unfold the sidebar").on_click(toggleSidebar).child(icon("chevron-right", 11))))));
  }
}
