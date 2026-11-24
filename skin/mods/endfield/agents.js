// agents: the squad sidebar. Every agent grouped by its space (a squad), each squad in tree order
// (a lead, then the agents it started, joined by right-angle connectors whatever their vendor),
// each agent a party chip with its operator's callsign. Past 12 agents the rows go compact and the
// agents that need input are also pinned above every squad. Behaviour kept from the shipped
// `agents` mod: setAgentOrder, sort modes, pins, peek for sub-agents, title cleaning. Claude Code
// agents and their sub-agents also show their model and effort, how long they have run and a
// context gauge (sessions.js, fleet.js rowMeta), their own sub-agents read from
// the transcript, and a session card while hovered (card.js). An idle row folds to one line.

import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, panes, focused, spaces, run, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props } from "herdr";
import { palette, root, narrow, toggleSidebar, statusMark, glyph, hazard, chip, micro, spaced, wide, icon, pad2, telling, wipe, marker, nudge, rings, cross, ticks, pill, gauge, Entrance, StatusFx, MOTION, IDENTITY, FONT, GAUGE } from "./kit.js";
import { roster, holdCrew } from "./roster.js";
import { BY, DENSE_AT, statusOf, castCrew, held, inFlight, subagentView, PANE_ROLES, opening, transcriptsIn, transcriptPlan, rowShape, rowMeta, tasksOf } from "./fleet.js";
import { toggleReport, goTo } from "./report.js";
import { openDispatch } from "./dispatch.js";
import { Sessions, isClaude } from "./sessions.js";
import { CARD, wantedCard, dismissed, cardHeight, cardPlace, windowHeight } from "./hovercard.js";
import { squadMove, dropEdge } from "./squads.js";
import { openSquadMenu } from "./squadmenu.js";

// Fixed heights, so the selection marker knows where the selected row starts (the row's own ink plate snaps).
// Compact (DENSE_AT agents and up): 34px rows that keep the chip, badge and callsign over the task.
// An idle row (fleet.js rowShape) is one line at either size, with its own smaller chip.
const H = {
  full: { lead: 56, child: 50, idle: 34, head: 28, chip: [36, 28], idleChip: 22, pad: [16, 46], more: 26 },
  dense: { lead: 34, child: 34, idle: 26, head: 26, chip: [24, 20], idleChip: 18, pad: [14, 34], more: 22 },
};
const PIN = { max: 3, row: 34, more: 22 };
// A wheel notch in lines, as pixels, for the "N below" estimate (the scroll area reports no offset).
// How far a held squad header must move before it counts as a drag.
const DRAG_START_PX = 4;
const LINE_PX = 20;
// The squad name field takes the keyboard again once the menu that asked for it has closed.
const NAME_FOCUS_MS = 300;

// Where a dragged squad will land: a 2px ink line over the edge, drawn over the rows so no height changes.
const dropLine = (C, edge) => div().absolute().left(0).right(0).h(2).bg(C.text).when(edge === "top", (l) => l.top(0)).when(edge === "bottom", (l) => l.bottom(0));

const cwdOf = (a) => panes().find((p) => p.terminal === a.address)?.cwd ?? null;

// A session or sub-agent (sessions.js; both carry these fields) as fleet.js rowMeta reads it.
const runOf = (s, live, program) => ({ startedAt: s?.startedAt, lastAt: s?.lastAt, live, model: s?.model?.short, modelId: s?.model?.id,
  effort: s?.effort, used: s?.ctx?.used, total: s?.ctx?.total, program, tasks: tasksOf(s) });

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
    // Per tab, the sub-agent path its transcript pane was opened on (Herdr doesn't report a pane's props).
    try { this.viewing = JSON.parse(localStorage.getItem("transcripts") ?? "{}") ?? {}; } catch { this.viewing = {}; }
    if (!this.viewing || typeof this.viewing !== "object" || Array.isArray(this.viewing)) this.viewing = {};
    // Data, not animation: the "1h07" labels age, and the operator assignments are reread.
    IDENTITY.refresh();
    cx.timer.every(30000, (cx) => { IDENTITY.refresh(); cx.notify(); });
    this.bounds = {};
    this.info = {};
    this.subNums = new Map();
    // Parents whose finished sub-agents are listed too; kept until the mod reloads.
    this.opened = new Set();
    this.card = { open: null, hot: null, seq: 0, armed: false, kept: null };
    // The one card this list owns; a card that isn't it (left from a reload) closes itself.
    setShared("endfield.card.open", null);
    // Shared values outlive a restart and overlay ids may not: an old report must not close a new card.
    setShared("endfield.card.closed", null);
    // Polled whether the sidebar is wide, a rail or hidden: the HUD footer, the report and the card read it.
    this.sessions = new Sessions("agents");
    this.sessions.start(cx, () => agents().filter(isClaude).map((a) => ({ terminal: a.address, cwd: cwdOf(a), status: a.status })));
    // A squad header pressed, and the squad the pointer is over now (null where it can't drop).
    this.drag = null;
    // The squad whose name its header is editing. A menu's Rename squad asks through shared.
    this.naming = null;
    this.nameInput = InputState.new({ placeholder: "Squad name" });
    this.nameInput.on("submit", (_e, cx) => this.rename(cx));
    setShared("endfield.squad.rename", null);
  }

  close() {
    this.sessions.stop();
    if (this.card.open) closeOverlay(this.card.open.id);
    setShared("endfield.card.open", null);
  }

  // What wantedCard reads, taken when a decision is made. The hovered row counts only while the
  // list draws rows (the rail has none to report the pointer leaving) and its agent is still listed.
  cardFacts() {
    const row = !narrow() && agents().some((a) => `ag-${a.address}` === this.hovered) ? this.hovered.slice(3) : null;
    return { row, hot: this.card.hot, open: this.card.open };
  }

  setCard(address) {
    if (this.card.open) closeOverlay(this.card.open.id);
    this.card.open = address ? this.openCard(address) : null;
    setShared("endfield.card.open", this.card.open?.id ?? null);
  }

  /**
   * The card follows the pointer with a grace period: the wanted card is the hovered agent row's,
   * else the open one while the pointer is on it. Every hover change re-arms one timer.
   */
  cardTick(cx) {
    const seq = ++this.card.seq;
    const { row } = this.cardFacts();
    this.card.armed = true;
    cx.timer.after((row && row !== this.card.open?.address ? MOTION.card.open : MOTION.card.close).delay, () => {
      if (seq !== this.card.seq) return;
      this.card.armed = false;
      const want = wantedCard(this.cardFacts());
      if (want !== (this.card.open?.address ?? null)) this.setCard(want);
    });
  }

  /**
   * Each render: a card pressed beside (or closed by its own button) goes at once, and a card that
   * is up but no longer wanted (the sidebar folded, its agent gone) gets its close timer. A press
   * on the card's own row is beside the card too, and keeps it.
   */
  cardSync(cx) {
    const hot = shared("endfield.card.hot") ?? null;
    const moved = hot !== this.card.hot;
    this.card.hot = hot;
    const kept = this.card.kept;
    this.card.kept = null;
    const closed = shared("endfield.card.closed") ?? null;
    if (dismissed({ closed, open: this.card.open, kept })) {
      // The press landed elsewhere, so a hover the row still claims is one whose exit went unreported.
      if (this.hovered === `ag-${this.card.open.address}`) this.hovered = null;
      this.card.seq++;
      this.card.armed = false;
      this.setCard(null);
      // The press may have been on another agent's row: its card still opens after the usual delay.
      if (this.cardFacts().row) { this.cardTick(cx); return; }
    } else if (closed && closed === this.card.open?.id) setShared("endfield.card.closed", null);
    const open = this.card.open;
    if (moved || (open && !this.card.armed && wantedCard(this.cardFacts()) !== open.address)) this.cardTick(cx);
  }

  // Beside the row, where hovercard.js cardPlace puts it.
  openCard(address) {
    const b = this.bounds[`ag-${address}`];
    const a = agents().find((x) => x.address === address);
    if (!b || !a) return null;
    const s = this.sessions.get(address);
    let winH = 900;
    try { winH = windowHeight(window.bounds().height); } catch {}
    const { y, tall, fit } = cardPlace({ want: cardHeight(s, a.status), row: b, winH });
    const id = openOverlay({
      mod: "endfield", kind: "window", frame: "none",
      at: { x: Math.round(b.x + b.width - 12 - CARD.pad), y },
      width: CARD.width + CARD.slide + 2 * CARD.pad,
      height: tall,
      props: { role: "card", terminal: address, ...this.info[address], snap: s ?? null, fit },
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

  openTranscript(parent, k) {
    const tab = parent.tab;
    const reg = shared(PANE_ROLES);
    const plan = transcriptPlan(panes(), tab, this.viewing[tab], k.path, reg);
    if (plan.focus) return run("pane.focus", { pane: plan.focus });
    for (const pane of plan.close) run("pane.close", { pane });
    const next = opening(reg, panes(), tab, "transcript");
    setShared(PANE_ROLES, next);
    run("pane.split", { direction: "right", pane: parent.pane, mod: "endfield", props: { role: "transcript", path: k.path, title: k.title, id: k.id, parent: parent.address, via: parent.ident.callsign } });
    const all = panes();
    this.viewing = Object.fromEntries(Object.entries({ ...this.viewing, [tab]: k.path }).filter(([t]) => t === tab || transcriptsIn(all, t, next).length));
    localStorage.setItem("transcripts", JSON.stringify(this.viewing));
  }

  focus(m) { goTo(m); }

  fold(id, cx) {
    this.folded.has(id) ? this.folded.delete(id) : this.folded.add(id);
    localStorage.setItem("squads.folded", JSON.stringify([...this.folded]));
    cx.notify();
  }

  /** Edits squad `id`'s name in its header: Enter runs space.rename, Esc or a press elsewhere leaves it. */
  startNaming(id, cx) {
    const sp = spaces().find((s) => s.id === id);
    if (!sp) return;
    this.naming = id;
    this.nameInput.set_value(sp.name);
    this.nameInput.focus();
    cx.timer.after(NAME_FOCUS_MS, () => { if (this.naming === id) this.nameInput.focus(); });
    cx.notify();
  }

  rename(cx) {
    const id = this.naming;
    const name = this.nameInput.value().trim();
    this.naming = null;
    if (id && name && name !== spaces().find((s) => s.id === id)?.name) run("space.rename", { id, name });
    cx.notify();
  }

  stopNaming(cx) {
    this.naming = null;
    cx.notify();
  }

  /** The pointer over squad q while a header is held: q is where it drops if Herdr can move it there. */
  dragOver(q, order) {
    return (e, cx) => {
      if (!this.drag) return;
      // A press only becomes a drag once the pointer has moved a few pixels: a shaky click stays a click.
      if (!this.drag.live) {
        if (this.drag.y != null && Math.abs((e.position?.y ?? this.drag.y) - this.drag.y) < DRAG_START_PX) return;
        this.drag.live = true;
      }
      const over = q.id === this.drag.from || squadMove(order, this.drag.from, q.id) ? q.id : null;
      if (over !== this.drag.over) { this.drag.over = over; cx.notify(); }
    };
  }

  /** The release: a held header let go over another squad moves its space there (space.move). */
  drop(order, cx) {
    const d = this.drag;
    this.drag = null;
    const move = d?.live && d.over ? squadMove(order, d.from, d.over) : null;
    if (move) run("space.move", move);
    if (d) cx.notify();
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
   * One agent row. r: { key, m, depth, shape, h, size, top, on, here?, title, meta, native, up, click }, tops relative
   * to its squad; `up` is the parent's row. An idle row is one line: chip, callsign, task, status.
   * A two-line row: callsign, model, effort, then elapsed and status at the right; under it the task,
   * then the context gauge at the right. Status and elapsed never shrink: the model and effort give
   * way first, then the callsign truncates.
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
    const { model, effort, time, running, gauge: ctx } = r.meta;
    const fx = this.fx.of(m.address);
    const pin = this.pinButton(C, r, hot, on);
    const keep = (_e, cx) => { this.card.kept = this.card.open?.id ?? null; cx.notify(); };
    const carded = r.key === `ag-${this.card.open?.address}`;
    // The connector: a 1px right angle from the parent chip's foot to this chip's side, drawn top-down when the child arrives.
    let link = null;
    if (r.up) {
      const left = D.pad[r.up.depth ? 1 : 0] + r.up.size / 2;
      const foot = r.up.top + r.up.h / 2 + r.up.size / 2;
      link = div().id(`${r.key}-link`).absolute().left(left).top(foot - r.top).w(Math.max(4, pad - left - 3))
        .h(this.fresh.has(r.key) ? 0 : r.top + r.h / 2 - foot).border_l(1).border_b(1).border_color(on ? C.selMuted : C.hairStrong)
        .transition("height", MOTION.link.draw);
    }
    const mark = statusMark(C, m.status, { inv: on, size: 11, id: `${r.key}-disc`, pop: fx.pop }) ?? div();
    const right = dense
      ? h_flex().h(12).flex_none().items_center().tooltip(st?.word ?? m.status).child(glyph(C, m.status, { inv: on, size: 11, id: `${r.key}-disc`, pop: fx.pop }) ?? div())
      : one ? h_flex().flex_none().items_center().child(mark) : null;
    // flex_1 sizes from zero, so the model and effort get only the room the rest leaves.
    const head = h_flex().flex_1().min_w(0).gap(6).items_center().overflow_hidden()
      .when(Boolean(model), (el) => el.child(micro(model, sub).min_w(0).truncate()))
      .when(Boolean(effort), (el) => el.child(micro(effort, on ? C.selDim : C.dim).flex_none()));
    const label = one
      ? nudge(h_flex(), `${r.key}-label`, hot).flex_1().min_w(0).gap(8).items_center()
        .child(wide(m.ident.callsign, fg, 9).flex_none())
        .child(div().min_w(0).truncate().font_medium().text_size(11.5).child(r.title))
      : dense
      ? nudge(v_flex(), `${r.key}-label`, hot).flex_1().min_w(0).gap(4)
        .child(h_flex().min_w(0).gap(6).items_center()
          .child(wide(m.ident.callsign, fg, 9).flex_none())
          .child(head))
        .child(div().min_w(0).truncate().font_medium().text_size(11.5).child(r.title))
      : nudge(v_flex(), `${r.key}-label`, hot).flex_1().min_w(0).gap(6)
        .child(h_flex().min_w(0).gap(8).items_center()
          .child(wide(m.ident.callsign, fg, 10).flex_shrink(1).min_w(0).truncate())
          .child(head)
          .when(Boolean(pin), (el) => el.child(pin))
          .when(running > 0, (el) => el.child(h_flex().id(`${r.key}-tasks`).flex_none().gap(3).items_center().text_color(sub)
            .tooltip(`${running} background task${running === 1 ? "" : "s"} running`)
            .child(icon("tasks", 10)).child(div().font_family(FONT.mono).text_size(10).line_height(1).child(String(running)))))
          .when(Boolean(time), (el) => el.child(h_flex().flex_none().gap(4).items_center().text_color(sub)
            .child(icon("clock", 10)).child(div().font_family(FONT.mono).text_size(10).line_height(1).child(time))))
          .child(div().flex_none().child(mark)))
        .child(h_flex().min_w(0).gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().font_medium().text_size(13).child(r.title))
          .when(Boolean(ctx), (el) => el.child(gauge(C, ctx, { inv: on, id: `${r.key}-ctx` }))));
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
      // Told to the list before its next render, where the card's report of the same press is read.
      .when(carded, (el) => el.on_mouse_down("left", keep).on_mouse_down("middle", keep))
      .on_mouse_down("right", (e, cx) => {
        if (carded) keep(e, cx);
        if (!r.native) openSquadMenu({ kind: "chat", terminal: m.address, snap: this.sessions.get(m.address) ?? null });
      })
      .child(wipe(`${r.key}-wipe`, C.sunken, this.width, hot && !on))
      .when(st?.edge === "hazard", (el) => el.child(div().absolute().left(0).top(6).flex().child(hazard(C, 4, r.h - 12))))
      .when(Boolean(link), (el) => el.child(link))
      .child(chip(C, m.ident, m.status, { size, on, id: r.key, flash: fx.flash ? fx : null }))
      .child(label)
      .when(Boolean(pin) && Boolean(right), (el) => el.child(pin))
      .when(Boolean(right), (el) => el.child(right));
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

  /** Where a held squad would drop relative to squad q: "top" or "bottom" of it, or null. */
  dropAt(q, order) {
    const d = this.drag;
    return d && d.over === q.id && d.from !== q.id ? dropEdge(order, d.from, q.id) : null;
  }

  /**
   * A squad's header: formation number, name, (folded) a stack of its operators, its ! and count, + and the chevron.
   * Click folds it. A space's squad also drags to reorder, renames on a double-click and has a right-click menu.
   */
  head(C, D, s, order) {
    const { q, folded, blocked } = s;
    const id = `sq-${q.id}`;
    const hot = this.hovered === id;
    const naming = this.naming === q.id;
    const edge = this.dropAt(q, order);
    const lifted = this.drag?.from === q.id && this.drag.over !== q.id;
    const name = naming
      ? h_flex().id(`${id}-name`).relative().flex_1().min_w(0).h(D.head - 6).px(6).items_center().rounded(3).border_1().border_color(C.hairStrong).bg(C.raised)
        .font_family(FONT.mono).text_size(11)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => cx.stop_propagation())
        .on_mouse_down_out((_e, cx) => this.stopNaming(cx))
        .on_key_down((e, cx) => { if (e.key === "escape") this.stopNaming(cx); })
        .child(Input.new(this.nameInput))
      // The name renames on a double-click and never folds, so renaming can't fold and unfold the squad.
      : div().id(`${id}-title`).relative().flex_shrink(1).min_w(0)
        .when(!q.pinned, (el) => el.on_click((e, cx) => { cx.stop_propagation(); if (e.click_count === 2) this.startNaming(q.id, cx); }))
        .child(wide(q.name, C.text, 10).truncate());
    return h_flex().id(id).relative().h(D.head).flex_none().pl(14).pr(10).gap(8).items_center().cursor_pointer()
      .on_hover((over, cx) => { if (over) this.hovered = id; else if (this.hovered === id) this.hovered = null; cx.notify(); })
      .on_click((_e, cx) => { if (!naming) this.fold(q.id, cx); })
      .on_mouse_move(this.dragOver(q, order))
      .when(!q.pinned, (el) => el
        .on_mouse_down("left", (e) => { if (e.click_count === 1) this.drag = { from: q.id, over: q.id, y: e.position?.y ?? null, live: false }; })
        .on_mouse_down("right", () => openSquadMenu({ kind: "squad", id: q.id })))
      .when(lifted, (el) => el.opacity(0.5))
      .tooltip(q.pinned ? "Pinned agents, from every space. Click to fold." : `Squad ${q.num} ${q.name}. Click to fold, drag to reorder, double-click the name to rename, right-click for more.`)
      .child(wipe(`${id}-wipe`, C.sunken, this.width, hot))
      .when(edge === "top" || (edge === "bottom" && folded), (el) => el.child(dropLine(C, edge)))
      .child(div().relative().w(22).h(16).flex_none().flex().items_center().justify_center().rounded(3).bg(C.selBg)
        .font_family(FONT.mono).text_size(9).text_color(C.selText).child(q.pinned ? icon("pin", 10).text_color(C.selText) : q.num))
      .child(name)
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
          .tooltip(`${m.ident.callsign}, ${m.title}, squad ${num.get(m.space)}`)
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
  // account's usage limits, the report every Claude Code agent's context, tokens and turns, and a
  // card action's dialog the model, effort and mode it reads back. Published only when they change.
  share(R) {
    const f = R.flat.find((m) => m.focused);
    const s = f ? this.sessions.get(f.address) : null;
    const focus = f ? { ctx: s?.ctx ?? null, model: s?.model?.short ?? f.program?.name ?? null } : null;
    const all = Object.fromEntries(R.flat.flatMap((m) => {
      const x = this.sessions.get(m.address);
      return x ? [[m.address, { ctx: x.ctx ?? null, tokens: x.tokens?.total ?? null, turns: x.turns ?? null, model: x.model?.short ?? null, effort: x.effort, mode: x.mode }]] : [];
    }));
    // The open card's whole session: the card draws it and runs no poller of its own.
    const card = this.card.open ? this.sessions.get(this.card.open.address) : null;
    // Every surface's roster casts by model (roster.js), so each draws an agent the same.
    // Sorted, so the same models in another order don't publish again.
    const models = Object.fromEntries(R.flat.flatMap((m) => { const id = this.sessions.get(m.address)?.model?.id; return id ? [[m.address, id]] : []; }).sort(([a], [b]) => (a < b ? -1 : 1)));
    // Every surface reads an idle or finished agent whose session waits on background work as waiting (fleet.js memberStatus).
    const waiting = R.flat.filter((m) => this.sessions.get(m.address)?.waiting).map((m) => m.address).sort();
    for (const [key, value] of [["endfield.focus", focus], ["endfield.sessions", all], ["endfield.card.session", card], ["endfield.limits", this.sessions.limits], ["endfield.models", models], ["endfield.waiting", waiting]]) {
      const text = JSON.stringify(value);
      if (text !== this.published?.[key]) { (this.published ??= {})[key] = text; setShared(key, value); }
    }
  }

  render(cx) {
    const C = palette();
    this.cardSync(cx);
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
    // Sub-agents draw around the fleet's operators and the ones sub-agents already hold (holdCrew).
    const taken = new Set(R.taken);
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
        const meta = rowMeta(runOf(this.sessions.get(m.address), inFlight(m.status), m.program?.name), now, GAUGE.segments);
        const r = { key: `ag-${m.address}`, m, depth: m.depth, ...sized(m.status, m.depth), top: inner, on: m.agent ? m.focused : m.address === shown,
          title: label(m), meta, up: m.parent ? placed.get(m.parent) : null, click: () => this.focus(m) };
        placed.set(m.address, r);
        if (m.agent) {
          const where = [m.address.includes("/") ? m.address.split("/")[0] : null, m.spaceName, m.agent.tab_name && !/^\d+$/.test(m.agent.tab_name) ? m.agent.tab_name : pad2(m.tabIndex)].filter(Boolean);
          this.info[m.address] = { title: r.title, where, callsign: m.ident.callsign };
        }
        push(r);
        // Claude Code's own sub-agents, read from its transcript, hang under it like any child.
        const subs = m.agent && isClaude(m.agent) ? this.natives(m) : { shown: [], earlier: 0 };
        const shownSubs = subs.shown;
        // Each draws from its own model's pool (its parent's model when the transcript names none).
        const crew = castCrew(IDENTITY, this.subNums.get(m.address), shownSubs.map((k) => ({ id: k.id, startedAt: k.startedAt,
          ident: IDENTITY.resolve(m.program, null, { parent: m.program, model: k.model?.id ?? m.model }), program: m.program })), taken);
        if (shownSubs.length) nextNums.set(m.address, crew);
        const docked = shownSubs.length ? transcriptsIn(panes(), m.tab, shared(PANE_ROLES))[0] : null;
        for (const k of shownSubs) {
          // The one its tab's transcript pane shows wears the selected plate; the yellow marker only while that pane is focused.
          const viewed = Boolean(docked) && this.viewing[m.tab] === k.path;
          push({ key: `sa-${k.id}`, m: { address: `sa-${k.id}`, status: k.status, ident: crew.get(k.id) }, depth: m.depth + 1,
            ...sized(k.status, m.depth + 1), top: inner, on: viewed, here: viewed && docked.focused, title: k.title, native: true, meta: rowMeta(runOf(k, inFlight(k.status)), now, GAUGE.segments),
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
    holdCrew(held([...nextNums.values()].flatMap((c) => [...c.values()])));
    this.arrive([...sections.flatMap((s) => [...s.rows.map((r) => r.key), ...(s.folded ? [`sq-${s.q.id}-stack`] : [])]), ...blocked.map((m) => `pin-${m.address}`)], cx);

    const here = (r) => r.here ?? r.on;
    const selIn = sections.find((s) => !s.folded && s.rows.some(here));
    const selRow = selIn?.rows.find(here);
    const sel = selRow ? { top: selIn.start + selRow.top, h: selRow.h } : null;
    const maxY = Math.max(0, y - this.viewH);
    this.scrollY = Math.min(this.scrollY, maxY);
    // A live run under a minute reads seconds, so while one is on screen the list redraws each
    // second. Past the minute it reads "1m" and the 30s refresh is enough.
    const seen = (top, h) => !this.viewH || (top < this.scrollY + this.viewH && top + h > this.scrollY);
    const ticking = !dense && sections.some((s) => !s.folded && s.rows.some((r) => r.meta?.ticking && seen(s.start + r.top, r.h)));
    if (ticking && !this.ticking) {
      this.ticking = true;
      cx.timer.after(1000, (cx) => { this.ticking = false; cx.notify(); });
    }
    const below = this.viewH ? sections.reduce((n, s) => n + (s.folded ? 0 : s.rows.filter((r) => !r.native && !r.more && s.start + r.top >= this.scrollY + this.viewH).length), 0) : 0;
    const active = R.flat.filter((m) => !statusOf(m.status)?.quiet).length;
    // The geometric layer fills the list's empty foot, never behind a row.
    const room = this.viewH - y > 170;
    const order = spaces().map((sp) => ({ id: sp.id, machine: sp.machine ?? null }));
    const ask = shared("endfield.squad.rename");
    if (ask && ask.at !== this.asked) {
      this.asked = ask.at;
      cx.timer.after(MOTION.settle.delay, (cx) => this.startNaming(ask.id, cx));
    }

    return root(C, this.entrance.apply(v_flex().relative().size_full().min_h(0).bg(C.ground).border_t(1).border_color(C.hair).overflow_hidden()
      .when(room && R.flat.length > 0, (el) => el
        .child(rings(C.geo, 260).absolute().right(-70).bottom(-60))
        .child(cross(C.cross).absolute().left(14).bottom(14))
        .child(spaced(["Grid 04", "1:240"], C.muted, { size: 9, gap: 8 }).absolute().left(30).bottom(15))
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
        .on_mouse_up("left", (_e, cx) => this.drop(order, cx))
        .on_hover((over, cx) => { if (!over && this.drag) { this.drag = null; cx.notify(); } })
        .children(sections.flatMap((s) => [
          this.head(C, D, s, order),
          v_flex().id(`sq-${s.q.id}-rows`).relative().flex_none().overflow_hidden().h(s.folded ? 0 : s.inner)
            .transition("height", MOTION.squad.fold)
            .on_mouse_move(this.dragOver(s.q, order))
            // A press on a row is never a drag; it clears one whose release landed outside the list.
            .on_mouse_down("left", () => { this.drag = null; })
            .children(s.rows.map((r) => (r.more ? this.more(C, D, r) : this.row(C, D, r))))
            .when(this.dropAt(s.q, order) === "bottom" && !s.folded, (el) => el.child(dropLine(C, "bottom"))),
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
            .tooltip(`${m.ident.callsign}, ${m.title}, ${st?.word ?? m.status}`)
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
