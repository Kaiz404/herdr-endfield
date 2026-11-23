// agents: the squad sidebar. Every agent grouped by its space (a squad), each squad in tree order
// (a lead, then the agents it started, joined by right-angle connectors whatever their vendor),
// each agent a party chip with its operator's callsign. Past 12 agents the rows go compact and the
// agents that need input are also pinned above every squad. Behaviour kept from the shipped
// `agents` mod: setAgentOrder, sort modes, pins, peek for sub-agents, title cleaning. Claude Code
// agents and their sub-agents also show their model and effort, how long they have run and a
// context gauge (sessions.js, fleet.js rowMeta), their own sub-agents read from
// the transcript, and a session card while hovered (card.js). An idle row folds to one line.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, panes, focused, spaces, run, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props } from "herdr";
import { palette, root, narrow, toggleSidebar, statusMark, glyph, hazard, chip, micro, wide, icon, pad2, telling, wipe, marker, nudge, rings, cross, ticks, pill, gauge, Entrance, StatusFx, MOTION, IDENTITY, FONT, GAUGE } from "./kit.js";
import { roster } from "./roster.js";
import { BY, DENSE_AT, statusOf, subNumbers, subagentView, rowShape, rowMeta } from "./fleet.js";
import { toggleReport, goTo } from "./report.js";
import { openDispatch } from "./dispatch.js";
import { Sessions, isClaude } from "./sessions.js";
import { CARD, cardHeight } from "./card.js";

// Fixed heights, so the selection marker knows where the selected row starts (the row's own ink plate snaps).
// Compact (DENSE_AT agents and up): 34px rows that keep the chip, badge and callsign over the task.
// An idle row (fleet.js rowShape) is one line at either size, with its own smaller chip.
const H = {
  full: { lead: 56, child: 50, idle: 34, head: 28, chip: [36, 28], idleChip: 22, pad: [16, 46], more: 26 },
  dense: { lead: 34, child: 34, idle: 26, head: 26, chip: [24, 20], idleChip: 18, pad: [14, 34], more: 22 },
};
const PIN = { max: 3, row: 34, more: 22 };
// A wheel notch in lines, as pixels, for the "N below" estimate (the scroll area reports no offset).
const LINE_PX = 20;

const cwdOf = (a) => panes().find((p) => p.terminal === a.address)?.cwd ?? null;

// A session or sub-agent (sessions.js; both carry these fields) as fleet.js rowMeta reads it.
const runOf = (s, live, program) => ({ startedAt: s?.startedAt, lastAt: s?.lastAt, live, model: s?.model?.short, modelId: s?.model?.id,
  effort: s?.effort, used: s?.ctx?.used, total: s?.ctx?.total, program });

const SORTS = [
  { id: "priority", label: "Priority", icon: "clock", by: BY.priority },
  { id: "order", label: "Tab order", icon: "layers", by: BY.order },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];

// A tab nobody named (or named after its program) reads as its agent's live title.
function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, lead) {
  const live = telling(lead);
  return (tab.name === lead?.program?.name || !tab.named) && live ? live : tab.name;
}

export class SortMenu {
  render() {
    const C = palette();
    const on = sortOf().id;
    return root(C, v_flex().w_full().p(6).bg(C.raised)
      .child(div().px(8).pt(4).pb(8).child(micro("Sort within squads", C.muted)))
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
    try { this.folded = new Set(JSON.parse(localStorage.getItem("squads.folded") ?? "[]")); } catch { this.folded = new Set(); }
    this.width = 0;
    this.viewH = 0;
    this.scrollY = 0;
    this.fx = new StatusFx();
    this.fresh = new Set();
    this.seen = null;
    this.entrance = new Entrance(2);
    this.entrance.start(cx);
    // Data, not animation: the "1h07" labels age, and the operator assignments are reread.
    IDENTITY.refresh();
    cx.timer.every(30000, (cx) => { IDENTITY.refresh(); cx.notify(); });
    this.bounds = {};
    this.info = {};
    this.subNums = new Map();
    // Parents whose finished sub-agents are listed too; kept until the mod reloads.
    this.opened = new Set();
    this.card = { open: null, hot: null, seq: 0 };
    // The one card this list owns; a card that isn't it (left from a reload) closes itself.
    setShared("endfield.card.open", null);
    // Polled whether the sidebar is wide, a rail or hidden: the HUD footer, the report and the card read it.
    this.sessions = new Sessions("agents");
    this.sessions.start(cx, () => agents().filter(isClaude).map((a) => ({ terminal: a.address, cwd: cwdOf(a), status: a.status })));
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
    const rowOf = () => (agents().some((a) => `ag-${a.address}` === this.hovered) ? this.hovered.slice(3) : null);
    const row = rowOf();
    cx.timer.after((row && row !== this.card.open?.address ? MOTION.card.open : MOTION.card.close).delay, () => {
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
    const b = this.bounds[`ag-${address}`];
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
      props: { role: "card", terminal: address, ...this.info[address], snap: s ?? null },
    });
    return { id, address };
  }

  // Keys seen for the first time draw once at their start (a connector at height 0, a pinned row
  // closed, a squad's stack transparent), then transition to rest.
  arrive(keys, cx) {
    const first = this.seen === null;
    if (!first) for (const k of keys) if (!this.seen.has(k)) this.fresh.add(k);
    this.seen = new Set(keys);
    if (this.fresh.size && !this.settling) {
      this.settling = true;
      cx.timer.after(MOTION.settle.delay, (cx) => { this.fresh.clear(); this.settling = false; cx.notify(); });
    }
  }

  hover(key) {
    return (over, cx) => {
      if (over) this.hovered = key;
      else if (this.hovered === key) this.hovered = null;
      this.cardTick(cx);
      cx.notify();
    };
  }

  natives(m) {
    return subagentView(this.sessions.get(m.address)?.subagents ?? [], this.opened.has(m.address));
  }

  // One split per click: a double-click or a quick second press would stack two panes.
  openTranscript(parent, k) {
    const now = Date.now();
    if (now - (this.splitAt ?? 0) < 1000) return;
    this.splitAt = now;
    run("pane.split", { direction: "right", pane: parent.pane, mod: "endfield-transcript", props: { path: k.path, title: k.title } });
  }

  focus(m) { goTo(m); }

  fold(id, cx) {
    this.folded.has(id) ? this.folded.delete(id) : this.folded.add(id);
    localStorage.setItem("squads.folded", JSON.stringify([...this.folded]));
    cx.notify();
  }

  /** A pinned agent's row shows the pin; hovering any agent's row offers pin or unpin. */
  pinButton(C, r, hot, on) {
    const pinned = Boolean(r.m.agent?.pinned);
    if (r.native || !r.m.agent || !(pinned || hot)) return null;
    const id = `${r.key}-pin`;
    return div().id(id).size(18).flex_none().flex().items_center().justify_center().rounded_full()
      .text_color(on ? C.selText : pinned ? C.text : C.muted).hover((s) => s.bg(on ? C.selMuted : C.raised))
      .tooltip(pinned ? "Unpin" : "Pin to the top")
      .on_click((_e, cx) => { cx.stop_propagation(); run("terminal.pin", { terminal: r.m.address, pinned: !pinned }); })
      .child(icon(pinned && hot ? "pin-off" : "pin", 11));
  }

  /**
   * One agent row. r: { key, m, depth, shape, h, size, top, on, title, meta, native, up, click }, tops relative
   * to its squad; `up` is the parent's row. An idle row is one line: chip, callsign, task, status.
   */
  row(C, D, r) {
    const { m, depth, size } = r;
    const dense = D === H.dense;
    const one = r.shape === "idle";
    const on = r.on;
    const hot = this.hovered === r.key;
    const fg = on ? C.selText : C.text;
    const sub = on ? C.selMuted : C.muted;
    const pad = D.pad[depth ? 1 : 0];
    const st = statusOf(m.status);
    const { head, time, gauge: ctx } = r.meta;
    const fx = this.fx.of(m.address);
    const pin = this.pinButton(C, r, hot, on);
    // The connector: a 1px right angle from the parent chip's foot to this chip's side, drawn top-down when the child arrives.
    let link = null;
    if (r.up) {
      const left = D.pad[r.up.depth ? 1 : 0] + r.up.size / 2;
      const foot = r.up.top + r.up.h / 2 + r.up.size / 2;
      link = div().id(`${r.key}-link`).absolute().left(left).top(foot - r.top).w(Math.max(4, pad - left - 3))
        .h(this.fresh.has(r.key) ? 0 : r.top + r.h / 2 - foot).border_l(1).border_b(1).border_color(on ? C.selMuted : C.hairStrong)
        .transition("height", MOTION.link.draw);
    }
    const right = one && !dense
      ? h_flex().flex_none().items_center().child(statusMark(C, m.status, { inv: on, size: 11, id: `${r.key}-disc`, pop: fx.pop }) ?? div())
      : dense
      ? h_flex().h(12).flex_none().items_center().tooltip(st?.word ?? m.status).child(glyph(C, m.status, { inv: on, size: 11, id: `${r.key}-disc`, pop: fx.pop }) ?? div())
      : v_flex().flex_none().items_end().gap(5)
        .child(statusMark(C, m.status, { inv: on, size: 11, id: `${r.key}-disc`, pop: fx.pop }) ?? div())
        .when(Boolean(time), (el) => el.child(h_flex().gap(4).items_center().text_color(sub)
          .child(icon("clock", 10)).child(micro(time, sub).flex_none())))
        .when(Boolean(ctx), (el) => el.child(gauge(C, ctx, { inv: on, id: `${r.key}-ctx` })));
    return h_flex()
      .id(r.key)
      .relative()
      .h(r.h)
      .flex_none()
      .pl(pad)
      .pr(12)
      .gap(dense || one ? 8 : 10)
      .items_center()
      .cursor_pointer()
      .text_color(fg)
      .when(on, (el) => el.bg(C.selBg))
      .on_hover(this.hover(r.key))
      .on_mouse_move((e) => { this.bounds[r.key] = e.bounds; })
      .on_click(r.click)
      .child(wipe(`${r.key}-wipe`, C.sunken, this.width, hot && !on))
      .when(st?.edge === "hazard", (el) => el.child(div().absolute().left(0).top(6).flex().child(hazard(C, 4, r.h - 12))))
      // Only while generating: a 28px segment scans the row's floor.
      .when(Boolean(st?.conveyor), (el) => el.child(div().absolute().left(14).right(14).bottom(0).h(1).overflow_hidden()
        .child(div().absolute().top(0).h(1).w(28).bg(C[on ? "flowInv" : "flow"]).loop("left", { from: -28, to: this.width, ...MOTION.status.scan }))))
      .when(Boolean(link), (el) => el.child(link))
      .child(chip(C, m.ident, m.status, { size, on, id: r.key, flash: fx.flash ? fx : null }))
      .child(one
        ? nudge(h_flex(), `${r.key}-label`, hot).flex_1().min_w(0).gap(8).items_center()
          .child(wide(m.ident.callsign, fg, 9).flex_none())
          .child(div().min_w(0).truncate().font_medium().text_size(11.5).child(r.title))
        : nudge(v_flex(), `${r.key}-label`, hot).flex_1().min_w(0).gap(dense ? 4 : 6)
          .child(h_flex().min_w(0).gap(6).items_center()
            .child(wide(m.ident.callsign, fg, dense ? 9 : 10).flex_none())
            .child(micro(head, sub).min_w(0).truncate()))
          .child(div().min_w(0).truncate().font_medium().text_size(dense ? 11.5 : 13).child(r.title)))
      .when(Boolean(pin), (el) => el.child(pin))
      .child(right);
  }

  /** Under a Claude Code agent's sub-agents: "+N earlier" lists the finished ones too, "Show less" folds back. */
  more(C, D, r) {
    const hot = this.hovered === r.key;
    return h_flex().id(r.key).relative().h(r.h).flex_none().pl(D.pad[1]).pr(12).items_center().cursor_pointer()
      .on_hover((over, cx) => { if (over) this.hovered = r.key; else if (this.hovered === r.key) this.hovered = null; cx.notify(); })
      .on_click(r.click)
      .child(wipe(`${r.key}-wipe`, C.sunken, this.width, hot))
      .child(micro(r.open ? "▴ Show less" : `▾ +${r.earlier} earlier`, hot ? C.text : C.muted).relative());
  }

  /** A squad's header: formation number, name, (folded) a stack of its operators, its ! and count, + and the chevron. */
  head(C, D, s) {
    const { q, folded, blocked } = s;
    const id = `sq-${q.id}`;
    const hot = this.hovered === id;
    return h_flex().id(id).relative().h(D.head).flex_none().pl(14).pr(10).gap(8).items_center().cursor_pointer()
      .on_hover((over, cx) => { if (over) this.hovered = id; else if (this.hovered === id) this.hovered = null; cx.notify(); })
      .on_click((_e, cx) => this.fold(q.id, cx))
      .tooltip(q.pinned ? "Pinned agents, from every space · click to fold" : `Squad ${q.num} · ${q.name} · click to fold`)
      .child(wipe(`${id}-wipe`, C.sunken, this.width, hot))
      .child(div().relative().w(22).h(16).flex_none().flex().items_center().justify_center().rounded(3).bg(C.selBg)
        .font_family(FONT.mono).text_size(9).text_color(C.selText).child(q.pinned ? icon("pin", 10).text_color(C.selText) : q.num))
      .child(wide(q.name, C.text, 10).relative().flex_shrink(1).min_w(0).truncate())
      .when(folded, (el) => el.child(h_flex().id(`${id}-stack`).relative().flex_none().pl(4)
        .opacity(this.fresh.has(`${id}-stack`) ? 0 : 1).transition("opacity", MOTION.squad.stack)
        .children(q.members.slice(0, 6).map((m, i) => div().ml(i ? -5 : 0).child(chip(C, { ...m.ident, badge: null }, m.status, { size: 16 }))))))
      .child(div().relative().flex_1().min_w(6).h(1).bg(C.hair))
      .when(blocked > 0, (el) => el.child(div().relative().w(14).h(12).flex_none().flex().items_center().justify_center().bg(C.signal)
        .text_size(9).font_weight(700).text_color(C.ink).tooltip(`${blocked} need input`).child("!")))
      .child(micro(pad2(q.members.length), C.muted).relative().flex_none())
      .when(!q.pinned, (el) => el.child(div().id(`${id}-add`).relative().size(18).flex_none().flex().items_center().justify_center().rounded_full().border_1().border_color(C.hairStrong)
        .hover((h) => h.bg(C.raised)).tooltip(`Dispatch a new agent to ${q.name}`)
        .on_click((_e, cx) => { cx.stop_propagation(); openDispatch({ mode: "new", space: q.id }); })
        .child(icon("plus", 10))))
      .child(micro(folded ? "▸" : "▾", C.muted).relative().w(8).flex_none());
  }

  /** Past 12 agents: the agents that need input, pinned above every squad (three, then "+N more"). */
  pinned(C, blocked, num) {
    return v_flex().mx(12).mb(10).flex_none().rounded(3).border_1().border_color(C.hairStrong).bg(C.raised).overflow_hidden()
      .child(h_flex().h(26).pr(10).gap(8).items_center().border_b(1).border_color(C.hair)
        .child(hazard(C, 6, 26))
        .child(wide(pad2(blocked.length), C.text, 13))
        .child(micro("Needs input", C.text))
        .child(div().flex_1().h(1).bg(C.hair))
        .child(micro("Pinned", C.muted, 9)))
      .children(blocked.slice(0, PIN.max).map((m) => {
        const key = `pin-${m.address}`;
        const on = m.focused;
        const hot = this.hovered === key;
        const fg = on ? C.selText : C.text;
        return h_flex().id(key).relative().h(PIN.row).flex_none().overflow_hidden().pl(10).pr(8).gap(9).items_center().cursor_pointer()
          // A height grown from 0 here stalls part way (native limit seen in r4), so a new pin fades in instead.
          .opacity(this.fresh.has(key) ? 0 : 1).transition("opacity", MOTION.pin.content)
          .when(on, (el) => el.bg(C.selBg))
          .on_hover((over, cx) => { if (over) this.hovered = key; else if (this.hovered === key) this.hovered = null; cx.notify(); })
          .on_click((_e, cx) => { this.folded.delete(m.space); this.focus(m); cx.notify(); })
          .tooltip(`${m.ident.callsign} · ${m.title} · squad ${num.get(m.space)}`)
          .child(wipe(`${key}-wipe`, C.sunken, this.width, hot && !on))
          .child(chip(C, m.ident, "blocked", { size: 22, on, ground: on ? C.selBg : C.raised }))
          .child(nudge(v_flex(), `${key}-label`, hot).flex_1().min_w(0).gap(4)
            .child(wide(m.ident.callsign, fg, 9))
            .child(div().min_w(0).truncate().text_size(11.5).font_medium().text_color(fg).child(m.title)))
          .child(div().relative().w(20).h(16).flex_none().flex().items_center().justify_center().rounded(3).border_1()
            .border_color(on ? C.selMuted : C.hairStrong).font_family(FONT.mono).text_size(8.5).text_color(fg).child(num.get(m.space)))
          .child(div().relative().size(18).flex_none().rounded_full().bg(C.signal).flex().items_center().justify_center().text_size(7).text_color(C.ink).child("▶"));
      }))
      .when(blocked.length > PIN.max, (el) => el.child(h_flex().id("pin-more").h(PIN.more).px(10).gap(6).items_center().border_t(1).border_color(C.hair).cursor_pointer()
        .on_click(() => toggleReport(true))
        .child(micro(`+${blocked.length - PIN.max} more need input`, C.muted)).child(div().flex_1()).child(micro("Report ▶", C.text))));
  }

  // This list owns the one session poller: the HUD footer gets the focused agent's context and the
  // account's usage limits, the
  // report every Claude Code agent's context, tokens and turns. Published only when they change.
  share(R) {
    const f = R.flat.find((m) => m.focused);
    const s = f ? this.sessions.get(f.address) : null;
    const focus = f ? { ctx: s?.ctx ?? null, model: s?.model?.short ?? f.program?.name ?? null } : null;
    const all = Object.fromEntries(R.flat.flatMap((m) => {
      const x = this.sessions.get(m.address);
      return x ? [[m.address, { ctx: x.ctx ?? null, tokens: x.tokens?.total ?? null, turns: x.turns ?? null }]] : [];
    }));
    // The open card's whole session: the card draws it and runs no poller of its own.
    const card = this.card.open ? this.sessions.get(this.card.open.address) : null;
    for (const [key, value] of [["endfield.focus", focus], ["endfield.sessions", all], ["endfield.card.session", card], ["endfield.limits", this.sessions.limits]]) {
      const text = JSON.stringify(value);
      if (text !== this.published?.[key]) { (this.published ??= {})[key] = text; setShared(key, value); }
    }
  }

  render(cx) {
    const C = palette();
    const hot = shared("endfield.card.hot") ?? null;
    if (hot !== this.card.hot) { this.card.hot = hot; this.cardTick(cx); }
    const sort = sortOf();
    const R = roster(sort.by);
    const list = agents();
    for (const m of R.all.values()) this.fx.track(m.address, m.status, cx);
    setAgentOrder(R.flat.filter((m) => m.agent).map((m) => m.address));
    this.share(R);
    if (narrow()) return this.rail(C, R);

    const shown = focused()?.agent;
    const leads = leadPanes(panes());
    const tabs = new Map(spaces().flatMap((s) => s.tabs).map((tab) => [tab.id, tab]));
    const tabCounts = new Map();
    for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
    const label = (m) => {
      if (!m.agent) return m.title;
      const a = m.agent, tab = tabs.get(a.tab);
      const many = tabCounts.get(a.tab) > 1;
      const l = tab ? title(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : (a.title || "");
      return /^\d+$/.test(l) ? a.program?.name || l : l;
    };

    const D = R.all.size >= DENSE_AT ? H.dense : H.full;
    const dense = D === H.dense;
    const num = new Map(R.squads.map((q) => [q.id, q.num]));
    const blocked = R.flat.filter((m) => m.status === "blocked");

    // Each squad: its rows with tops inside the squad, and where the squad starts in the list.
    let y = 0;
    const nextNums = new Map();
    const sections = R.squads.map((q) => {
      const folded = this.folded.has(q.id);
      const start = y + D.head;
      const placed = new Map();
      const rows = [];
      let inner = 0;
      const now = Date.now();
      // Height and chip come from the row's shape, so every row of one shape is the same height.
      const sized = (status, depth) => {
        const shape = rowShape(status, depth);
        return { shape, h: D[shape], size: shape === "idle" ? D.idleChip : D.chip[depth ? 1 : 0] };
      };
      const push = (r) => { rows.push(r); inner += r.h; };
      for (const m of q.members) {
        const meta = rowMeta(runOf(this.sessions.get(m.address), m.status === "working", m.program?.name), now, GAUGE.segments);
        const r = { key: `ag-${m.address}`, m, depth: m.depth, ...sized(m.status, m.depth), top: inner, on: m.agent ? m.focused : m.address === shown,
          title: label(m), meta, up: m.parent ? placed.get(m.parent) : null, click: () => this.focus(m) };
        placed.set(m.address, r);
        if (m.agent) {
          const where = [m.address.includes("/") ? m.address.split("/")[0] : null, m.spaceName, m.agent.tab_name && !/^\d+$/.test(m.agent.tab_name) ? m.agent.tab_name : pad2(m.tabIndex)].filter(Boolean).join(" / ");
          this.info[m.address] = { title: r.title, where, callsign: m.ident.callsign };
        }
        push(r);
        // Claude Code's own sub-agents, read from its transcript, hang under it like any child.
        const subs = m.agent && isClaude(m.agent) ? this.natives(m) : { shown: [], earlier: 0 };
        const shownSubs = subs.shown;
        const nums = subNumbers(this.subNums.get(m.address) ?? new Map(), [...shownSubs].sort((x, y) => (x.startedAt ?? 0) - (y.startedAt ?? 0)).map((k) => k.id));
        if (shownSubs.length) nextNums.set(m.address, nums);
        for (const k of shownSubs) {
          const ident = IDENTITY.resolve(m.program, null, { parent: m.program });
          const n = nums.get(k.id);
          push({ key: `sa-${k.id}`, m: { address: `sa-${k.id}`, status: k.status, ident: { ...ident, callsign: `${ident.name.toUpperCase()}${n > 1 ? `·${n}` : ""}` } }, depth: m.depth + 1,
            ...sized(k.status, m.depth + 1), top: inner, on: false, title: k.title, native: true, meta: rowMeta(runOf(k, k.status === "working"), now, GAUGE.segments),
            up: r, click: () => this.openTranscript(m, k) });
        }
        if (subs.earlier) {
          const open = this.opened.has(m.address);
          push({ key: `sm-${m.address}`, more: true, h: D.more, top: inner, on: false, open, earlier: subs.earlier,
            click: (_e, cx) => { open ? this.opened.delete(m.address) : this.opened.add(m.address); cx.notify(); } });
        }
      }
      y = start + (folded ? 0 : inner);
      return { q, folded, start, rows, inner, blocked: q.members.filter((m) => m.status === "blocked").length };
    });
    this.subNums = nextNums;
    this.arrive([...sections.flatMap((s) => [...s.rows.map((r) => r.key), ...(s.folded ? [`sq-${s.q.id}-stack`] : [])]), ...blocked.map((m) => `pin-${m.address}`)], cx);

    const selIn = sections.find((s) => !s.folded && s.rows.some((r) => r.on));
    const selRow = selIn?.rows.find((r) => r.on);
    const sel = selRow ? { top: selIn.start + selRow.top, h: selRow.h } : null;
    const maxY = Math.max(0, y - this.viewH);
    this.scrollY = Math.min(this.scrollY, maxY);
    const below = this.viewH ? sections.reduce((n, s) => n + (s.folded ? 0 : s.rows.filter((r) => !r.native && !r.more && s.start + r.top >= this.scrollY + this.viewH).length), 0) : 0;
    const active = R.flat.filter((m) => !statusOf(m.status)?.quiet).length;
    // The geometric layer fills the list's empty foot, never behind a row.
    const room = this.viewH - y > 170;

    return root(C, this.entrance.apply(v_flex().relative().size_full().min_h(0).bg(C.ground).border_t(1).border_color(C.hair).overflow_hidden()
      .when(room && R.flat.length > 0, (el) => el
        .child(rings(C.geo, 260).absolute().right(-70).bottom(-60))
        .child(cross(C.cross).absolute().left(14).bottom(14))
        .child(micro("Grid 04 · 1:240", C.muted, 9).absolute().left(30).bottom(15))
        .child(ticks(C.tick, 81).absolute().left(16).bottom(34)))
      .child(h_flex().flex_none().h(44).pt(6).pl(16).pr(12).gap(8).items_center()
        .child(div().text_size(13).font_semibold().child("// Squads"))
        .child(div().flex_1())
        .child(micro(`${pad2(active)}/${pad2(R.flat.length)} active`, C.muted))
        .child(h_flex().id("ag-sort").h(20).px(8).flex_none().items_center().rounded_full().border_1().border_color(C.hairStrong)
          .hover((h) => h.bg(C.raised)).tooltip("Sort within each squad")
          .on_click(() => openOverlay({ mod: "endfield", kind: "popup", width: 210, height: 112, props: { role: "sortmenu" } }))
          .child(micro(`${sort.label} ▾`, C.text))))
      .when(R.flat.length === 0, (el) => el.child(v_flex().relative().h(210).flex_none().items_center().justify_center().gap(8).overflow_hidden()
        .child(rings(C.geo, 164).absolute().left((this.width || 248) / 2 - 82).top(23))
        .child(div().relative().text_size(13).font_medium().child("No squad deployed"))
        .child(div().relative().w(170).text_size(12).line_height(1.4).text_color(C.muted).text_center().child("Agents you start show here, grouped by project."))
        .child(div().relative().mt(6).child(pill(C, "ag-empty-dispatch", "Dispatch", { knob: "+", hot: this.hovered === "ag-empty-dispatch",
          on_hover: (over, cx) => { this.hovered = over ? "ag-empty-dispatch" : null; cx.notify(); }, action: () => openDispatch({ mode: "new" }) })))))
      .when(dense && blocked.length > 0, (el) => el.child(this.pinned(C, blocked, num)))
      .child(v_flex().id("ag-list").relative().flex_1().min_h(0).pb(8).overflow_y_scrollbar()
        .on_size_change((size, cx) => { this.width = size.width; this.viewH = size.height; cx.notify(); })
        .on_scroll_wheel((e, cx) => {
          const dy = e.delta_lines ? -e.delta_lines.y * LINE_PX : -e.delta.y;
          const next = Math.max(0, Math.min(maxY, this.scrollY + dy));
          if (next !== this.scrollY) { this.scrollY = next; cx.notify(); }
        })
        .children(sections.flatMap((s) => [
          this.head(C, D, s),
          v_flex().id(`sq-${s.q.id}-rows`).relative().flex_none().overflow_hidden().h(s.folded ? 0 : s.inner)
            .transition("height", MOTION.squad.fold)
            .children(s.rows.map((r) => (r.more ? this.more(C, D, r) : this.row(C, D, r)))),
        ]))
        .child(marker("ag-mark", C, sel?.top ?? 0, sel?.h ?? 0).when(!sel, (el) => el.opacity(0))))
      .when(below > 0, (el) => el.child(h_flex().h(28).flex_none().pl(16).pr(12).gap(8).items_center().border_t(1).border_color(C.hairStrong)
        .child(micro(`▾ ${below} more agent${below === 1 ? "" : "s"} below`, C.muted)).child(div().flex_1().h(1).bg(C.hair)).child(micro("Scroll", C.muted))))));
  }

  rail(C, R) {
    return root(C, this.entrance.apply(v_flex().size_full().min_h(0).bg(C.ground).border_t(1).border_color(C.hair)
      .child(div().pt(10).pb(6).flex().justify_center().child(micro("AG", C.muted, 9)))
      .child(v_flex().id("ag-list").flex_1().min_h(0).gap(2).items_center().overflow_y_scrollbar()
        .children(R.flat.map((m) => {
          const st = statusOf(m.status);
          const on = m.agent ? m.focused : false;
          return v_flex().id(`ag-${m.address}`).relative().w(44).h(48).flex_none().items_center().justify_center().gap(4)
            .when(on, (el) => el.bg(C.selBg))
            .when(!on, (el) => el.hover((h) => h.bg(C.sunken)))
            .tooltip(`${m.ident.callsign} · ${m.title} · ${st?.word ?? m.status}`)
            .on_click(() => this.focus(m))
            .when(st?.edge === "hazard", (el) => el.child(div().absolute().left(0).top(8).flex().child(hazard(C, 3, 32))))
            .child(chip(C, m.ident, m.status, { size: 26, on }))
            .child(h_flex().h(9).items_center().child(glyph(C, m.status, { inv: on, size: 9 }) ?? div()));
        })))
      .child(h_flex().h(30).flex_none().items_center().justify_center()
        .child(div().id("collapse").size(24).flex().items_center().justify_center().rounded(3).text_color(C.muted)
          .hover((h) => h.bg(C.sunken).text_color(C.text)).tooltip("Unfold the sidebar").on_click(toggleSidebar).child(icon("chevron-right", 11))))));
  }
}
