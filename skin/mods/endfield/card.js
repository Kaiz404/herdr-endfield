// card: the session panel beside the sidebar for a squad row, laid out as a dossier: a header
// strip (who, the task, status and model), then Context, Tools, Recent and Tasks. An agent's, or a
// Claude Code sub-agent's (props.sub), which is the same panel without the parts only a terminal
// has (hovercard.js CARD_KINDS). The squad list opens and closes it: a window while
// the row is hovered (it never takes the keyboard), a popup when a right-click holds it, so Herdr
// closes it on Esc and on a press beside it. The panel only reports whether the pointer is on it
// (shared "endfield.card.hot") and that it closed. Its session is the list's (shared
// "endfield.card.session", published while this card is open): no poller here.
// The chat row's buttons never act themselves: each opens its confirm dialog (actions.js). A
// sub-agent's two buttons ask the list (shared "endfield.card.ask"), which owns the transcript pane.
// props: {role: "card", terminal (a sub-agent's parent's), sub: sub-agent id | null, title,
//   where: [machine?, space, tab], callsign, label (its Squads row's), ident (a sub-agent's), snap: Session | Sub, overlay,
//   fit: the panel's height cap (hovercard.js cardPlace), shown: it replaces a card already up, so no reveal}

import { div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, run, shared, setShared, closeOverlay, checking } from "herdr";
import { palette, root, micro, spaced, wide, dots, rings, pill, glyph, icon, MOTION, FONT } from "./kit.js";
import { DASH, fmtTokens, taskView, tasksOf } from "./fleet.js";
import { roster } from "./roster.js";
import { readLog, KIND, openComms } from "./comms.js";
import { openDispatch } from "./dispatch.js";
import { showWork } from "./report.js";
import { actionsFor, gate, MODE_WORD } from "./orders.js";
import { openAction } from "./actions.js";
import { unlink, openLink } from "./linkdialog.js";
import { lifeOf, untold, linkedWith } from "./links.js";
import { CARD, PANEL, CARD_KINDS, questionOf, headerOf, toolsView, recentView } from "./hovercard.js";

const SEGS = 20;
const HOT_FROM = 0.75;
// The longest Tools bar, in px: the row's width less the tool's name and its count.
const BAR_W = 200;

// The list's live session while it is this card's (its sub-agent `p.sub` for a sub-agent's card),
// else the one the card opened with.
const sessionOf = (p) => {
  const live = shared("endfield.card.session");
  const mine = live?.terminal === p.terminal ? live : null;
  return (p.sub ? mine?.subagents?.find((k) => k.id === p.sub) : mine) ?? p.snap ?? null;
};

export class Card {
  init(p, cx) {
    this.p = p;
    this.entered = Boolean(p.shown);
    this.comms = [];
    if (checking()) return;
    // The run's elapsed time, Recent's ages and a running task's time are clocks: redrawn when the
    // text they show changes.
    cx.timer.every(1000, (cx) => {
      const v = this.view(props() ?? this.p, Date.now());
      const clocks = [...v.head.facts, ...v.recent.map((r) => r.age), ...v.tasks.running.map((t) => t.time)].join();
      if (clocks !== this.clocks) { this.clocks = clocks; cx.notify(); }
    });
    if (p.sub) return;
    cx.spawn(async (cx) => {
      this.comms = (await readLog()).filter((m) => m.from === p.terminal || m.to === p.terminal);
      cx.notify();
    });
  }

  // Only this card's own claim: the next card may already be up, with the pointer on it.
  close() {
    const id = props()?.overlay ?? this.p.overlay;
    if (shared("endfield.card.hot") === id) setShared("endfield.card.hot", null);
    setShared("endfield.card.closed", id);
  }

  act(name, args) {
    run(name, args);
    closeOverlay(props().overlay);
  }

  /** A sub-agent's button: the list opens its transcript pane, with the follow-up box focused for "followup". */
  ask(act) {
    const p = props();
    setShared("endfield.card.ask", { key: `sa-${p.sub}`, act, at: Date.now() });
    closeOverlay(p.overlay);
  }

  hover(id) {
    return (over, cx) => { if (over) this.hot = id; else if (this.hot === id) this.hot = null; cx.notify(); };
  }

  /** What the card shows of its session at `now`. A sub-agent's `m` is its parent: the card is headed by the parent's tab. */
  view(p, now) {
    const m = roster().all.get(p.terminal);
    const s = sessionOf(p);
    const status = (p.sub ? s?.status : m?.status) ?? "idle";
    const head = headerOf({ callsign: (p.sub ? p.ident : m?.ident)?.callsign ?? p.callsign, label: p.label ?? m?.label,
      where: p.where, title: p.title ?? m?.title, approx: s?.approx, status, s, now });
    return { m, s, status, head, recent: recentView(s?.recent, now), tasks: taskView(tasksOf(s), now) };
  }

  /** A section's label row: its pieces ([text, colour]), then a hairline to the edge. */
  label(C, pieces) {
    return h_flex().gap(8).items_center().min_w(0)
      .child(spaced(pieces, C.text).flex_none())
      .child(div().flex_1().h(1).bg(C.hair));
  }

  /** The Tools section: total calls and turns, then the most called tools as bars. */
  tools(C, s, turns) {
    const rows = toolsView(s?.toolCounts);
    return v_flex().px(18).pt(10).pb(12).gap(6).border_b(1).border_color(C.hair)
      .child(this.label(C, [["Tools", C.muted], [`${s?.tools ?? 0} calls`, C.text], ["Turns", C.muted], [turns != null ? String(turns) : DASH, C.text]]))
      .when(rows.length === 0, (el) => el.child(div().h(14).text_size(11).text_color(C.muted).child("No tool calls yet.")))
      .children(rows.map((t) => h_flex().id(`card-tool-${t.tool}`).h(14).gap(8).items_center().min_w(0)
        .child(div().w(76).flex_none().truncate().font_family(FONT.mono).text_size(11).child(t.tool))
        .child(div().w(Math.max(2, Math.round(t.share * BAR_W))).h(6).flex_none().bg(C.text))
        .child(div().flex_none().font_family(FONT.mono).text_size(10).text_color(C.muted).child(String(t.count)))));
  }

  /** The Recent section: the last tool calls, newest first, each with its age, tool and what it was asked. */
  recent(C, rows) {
    return v_flex().px(18).pt(10).pb(12).gap(6).border_b(1).border_color(C.hair)
      .child(this.label(C, [["Recent", C.muted]]))
      .when(rows.length === 0, (el) => el.child(div().h(14).text_size(11).text_color(C.muted).child("None yet.")))
      .children(rows.map((r, k) => h_flex().id(`card-recent-${k}`).h(14).gap(8).items_center().min_w(0)
        .child(div().w(30).flex_none().font_family(FONT.mono).text_size(10).text_color(C.muted).child(r.age))
        .child(div().w(76).flex_none().truncate().font_family(FONT.mono).text_size(11).child(r.tool))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(C.muted).child(r.arg))));
  }

  /** The Tasks section. view: fleet.js taskView. A finished row is muted, its end word coloured only by TASK_END. */
  tasks(C, { running, finished }) {
    const row = (t) => h_flex().id(`card-task-${t.id}`).h(14).gap(8).items_center().min_w(0)
      .child(icon(`task-${t.kind}`, 11).text_color(t.end ? C.dim : C.text))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.end ? C.muted : C.text).child(t.description))
      .when(Boolean(t.end), (el) => el.child(micro(t.end.word, t.end.hue ? C[t.end.hue] : C.muted).flex_none()))
      .child(div().w(30).flex_none().flex().justify_end().font_family(FONT.mono).text_size(10).text_color(C.muted).child(t.time ?? DASH));
    const toggle = finished.length > 0 && div().id("card-tasks-more").flex_none().cursor_pointer()
      .on_click((_e, cx) => { this.more = !this.more; cx.notify(); })
      .child(micro(this.more ? "Show less" : `+${finished.length} finished`, C.text));
    return v_flex().px(18).pt(10).pb(12).gap(8).border_b(1).border_color(C.hair)
      .child(h_flex().gap(8).items_center()
        .child(micro(`Tasks ${String(running.length).padStart(2, "0")}`, C.muted))
        .child(div().flex_1().h(1).bg(C.hair))
        .when(Boolean(toggle), (el) => el.child(toggle)))
      .when(running.length === 0, (el) => el.child(div().h(14).text_size(11).text_color(C.muted).child("None running.")))
      .children(running.map(row))
      .when(Boolean(this.more), (el) => el.children(finished.map(row)));
  }

  render(cx) {
    const C = palette();
    const p = props() ?? this.p;
    if (this.entered && shared("endfield.card.open") !== p.overlay) closeOverlay(p.overlay);
    const K = CARD_KINDS[p.sub ? "sub" : "agent"];
    const { m, s, status, head, recent, tasks } = this.view(p, Date.now());
    const ctx = s?.ctx;
    const filled = ctx ? Math.round((Math.min(100, ctx.pct) / 100) * SEGS) : 0;
    const hot = (ctx?.pct ?? 0) >= HOT_FROM * 100;
    const question = questionOf(s, status);
    const tasksAny = tasks.running.length + tasks.finished.length > 0;
    const ident = p.sub ? p.ident : m?.ident;
    const mark = glyph(C, status, { size: 11 });
    const actions = actionsFor(m?.program?.key);
    // Typed actions go only to an agent Herdr calls idle, waiting on background work or not.
    const herdr = m?.herdrStatus ?? status;
    const why = gate(herdr);
    const line = (el) => el.border_b(1).border_color(C.hair);
    const dark = (id, label, action) => h_flex().id(id).h(26).px(12).items_center().rounded_full().border_1().border_color("#555555").text_size(12).font_medium().cursor_pointer()
      .hover((h) => h.bg("#2C2C2C")).on_click(action).child(label);
    const button = {
      peek: () => dark("card-peek", "Peek", () => this.act("terminal.peek", { terminal: p.terminal })),
      pin: () => dark("card-pin", m?.agent?.pinned ? "Unpin" : "Pin", () => this.act("terminal.pin", { terminal: p.terminal, pinned: !m?.agent?.pinned })),
      dispatch: () => pill(C, "card-dispatch", "Dispatch", { kind: "dark", knob: "+", hot: this.hot === "card-dispatch", on_hover: this.hover("card-dispatch"),
        action: () => { closeOverlay(p.overlay); openDispatch({ mode: "send", target: p.terminal }); } }),
      go: () => pill(C, "card-go", status === "blocked" ? "Answer" : "Focus", { kind: "primary", hot: this.hot === "card-go", on_hover: this.hover("card-go"),
        action: () => { showWork(); this.act("agent.focus", { terminal: p.terminal }); } }),
      followup: () => pill(C, "card-followup", "Follow-up", { kind: "dark", knob: "+", hot: this.hot === "card-followup", on_hover: this.hover("card-followup"),
        action: () => this.ask("followup") }),
      transcript: () => pill(C, "card-transcript", "Open transcript", { kind: "primary", hot: this.hot === "card-transcript", on_hover: this.hover("card-transcript"),
        action: () => this.ask("transcript") }),
    };
    return root(C, h_flex().id("card-root").p(CARD.pad)
      .on_size_change((_size, cx) => {
        if (this.entered) return;
        // Drawn once at rest (placeholder-first), then the reveal and the gauge run.
        cx.timer.after(MOTION.settle.delay, (cx) => { this.entered = true; cx.notify(); });
      })
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      // A press anywhere else is the person moving on, whatever hover says. The list closes the card.
      .on_mouse_down_out(() => setShared("endfield.card.closed", p.overlay))
      .on_hover((over) => setShared("endfield.card.hot", over ? p.overlay : null))
      .child(v_flex().id("card").relative().w(CARD.width).flex_none().self_start().overflow_hidden().rounded(4).border_1().border_color(C.hairStrong)
        .bg(C.raised).shadow_lg().when(Boolean(p.fit), (el) => el.max_h(p.fit))
        .left(this.entered ? CARD.slide : 0).opacity(this.entered ? 1 : 0)
        .transition("left", MOTION.card.slide).transition("opacity", MOTION.card.reveal)
        // Header strip: the operator's bust in a dotted frame; who and where, the task, then the
        // status word and glyph with the model, effort and elapsed time.
        .child(line(h_flex().flex_none().gap(14).items_center().pt(16).pb(14).pl(18).pr(16))
          .child(div().relative().w(66).h(78).flex_none()
            .child(div().absolute().left(0).top(0).w(66).h(78).rounded(3).overflow_hidden().bg(C.ground).border_1().border_color(C.hair)
              .border_b(3).border_color(ident?.accent ?? C.hairStrong)
              .child(dots(C.dot))
              .child(rings(C.hairStrong, 94).absolute().left(-14).top(-6))
              .child(ident?.avatar ? image(ident.avatar.bust).absolute().left(0).top(-6).w(66).h(79)
                : div().absolute().left(11).top(14).size(44).rounded_full().bg(ident?.fallbackIcon?.tile ?? C.selBg).flex().items_center().justify_center()
                  .child(wide(ident?.badge ?? "?", "#F2F2F2", 12))))
            .child(div().absolute().right(-6).bottom(-6).size(20).rounded_full().bg(C.ink).border_2().border_color("#FFFFFF")
              .flex().items_center().justify_center().font_family(FONT.mono).text_size(8).text_color("#F2F2F2").child(ident?.badge ?? "")))
          .child(v_flex().flex_1().min_w(0).gap(8)
            .child(spaced(head.who, C.text, { rest: C.muted }))
            .child(div().text_size(15).font_semibold().truncate().child(head.title))
            .child(h_flex().gap(8).items_center().min_w(0)
              .when(Boolean(mark), (el) => el.child(mark))
              .child(spaced([head.status, ...head.facts], C.text, { rest: C.muted })))))
        // Past its cap (props.fit) the middle scrolls, so the button row is never cut off.
        .child(v_flex().id("card-mid").overflow_y_scrollbar().when(Boolean(p.fit), (el) => el.flex_shrink(1).min_h(PANEL.mid))
        // Context: the input tokens of the last request (what the session carries now) of its
        // window, then 20 blocks lighting 18ms apart; past 75% they run red.
        .child(line(v_flex().px(18).py(12).gap(8))
          .child(h_flex().gap(8).items_end()
            .child(micro("Context", C.muted))
            .child(div().flex_1())
            .child(wide(ctx ? `${fmtTokens(ctx.used)} / ${fmtTokens(ctx.total)}` : DASH, C.text, 16))
            .child(micro(ctx ? `${ctx.pct}%` : "", C.muted)))
          .child(h_flex().gap(2).children(Array.from({ length: SEGS }, (_, k) => {
            const on = k < filled;
            return div().id(`seg-${k}`).flex_1().h(10).bg(on ? (hot && k >= SEGS * HOT_FROM ? C.red : C.text) : C.hair)
              .opacity(on && !this.entered ? 0.25 : 1).transition("opacity", { ...MOTION.row.wipe, delay: k * MOTION.card.segment.delay });
          }))))
        .child(this.tools(C, s, s?.turns ?? m?.turn))
        .child(this.recent(C, recent))
        // Background tasks: the running ones, then the finished ones folded under "+N finished".
        .when(tasksAny, (el) => el.child(this.tasks(C, tasks)))
        // Chat: its mode, and what the card can ask of it. Each opens a confirm.
        .when(K.chat, (el) => el.child(line(v_flex().px(18).pt(10).pb(12).gap(8))
          .child(h_flex().gap(8).items_center().min_w(0)
            .child(micro("Chat", C.muted).flex_none())
            .child(micro(MODE_WORD[s?.mode] ?? s?.mode ?? m?.program?.name ?? DASH, C.text).min_w(0).truncate())
            .child(div().flex_1())
            .child(micro(!actions.length ? "No actions" : why ? (herdr === "done" ? "Look at it first" : "Waits for idle") : "Idle", C.muted).flex_none()))
          .child(h_flex().gap(4).children(actions.map((a) => {
            const off = Boolean(why) && !a.session;
            return h_flex().id(`card-a-${a.key}`).h(24).px(7).flex_none().items_center().rounded_full().border_1().border_color(C.hairStrong)
              .text_size(11).font_medium().when(off, (el) => el.opacity(0.4)).tooltip(off ? why : a.note)
              .when(!off, (el) => el.cursor_pointer().hover((h) => h.bg(C.sunken))
                .on_click(() => { closeOverlay(p.overlay); openAction({ terminal: p.terminal, action: a.key, snap: s }); }))
              .child(a.label);
          })))
          // A link (links.js): both name who they're linked with; the helper unlinks on its own card. Unlink types nothing.
          .when(Boolean(m) && linkedWith(m).length > 0, (el) => el.child(h_flex().gap(8).items_center().min_w(0)
            .child(micro("Linked with", C.muted).flex_none())
            .child(micro(linkedWith(m).map((a) => `${roster().all.get(a)?.label ?? ""} ${a}`).join(", "), C.text).min_w(0).truncate())
            .child(div().flex_1())
            // A note it wasn't idle for at Link: one Send note per link that still owes it one.
            // Only while the other agent is still listed: a gone one has nothing to be told about.
            .children(untold(shared("endfield.links") ?? [], lifeOf(m)).filter((n) => roster().all.has(n.lead) && roster().all.has(n.helper)).map((n, i, all) => {
              const other = roster().all.get(n.side === "lead" ? n.helper : n.lead);
              return h_flex().id(`card-note-${i}`).h(24).px(7).flex_none().items_center().rounded_full().border_1().border_color(C.hairStrong)
                .text_size(11).font_medium().cursor_pointer().hover((h) => h.bg(C.sunken)).tooltip("It wasn't idle when linked. Types only its note, while it is idle.")
                .on_click(() => { closeOverlay(p.overlay); openLink(n); })
                .child(all.length > 1 ? `Send note ${other?.ident?.callsign ?? other?.label ?? ""}` : "Send note");
            }))
            .when(Boolean(m.linked), (el) => el.child(h_flex().id("card-unlink").h(24).px(7).flex_none().items_center().rounded_full().border_1().border_color(C.hairStrong)
              .text_size(11).font_medium().cursor_pointer().hover((h) => h.bg(C.sunken)).tooltip("Ends the link. Nothing is typed into either agent.")
              .on_click((_e, cx) => cx.spawn(async (cx) => { await unlink(m); cx.notify(); }))
              .child("Unlink")))))))
        // Comms: this agent's latest in (◀ from) and out (▶ to).
        .when(K.comms, (el) => el.child(line(v_flex().px(18).pt(10).pb(12).gap(8))
          .child(h_flex().gap(8).items_center()
            .child(micro(`Comms ${String(this.comms.length).padStart(2, "0")}`, C.muted))
            .child(div().flex_1().h(1).bg(C.hair))
            .child(div().id("card-log").cursor_pointer().on_click(() => { openComms(); closeOverlay(p.overlay); }).child(micro("Log ▶", C.text))))
          .when(this.comms.length === 0, (el) => el.child(div().text_size(11).text_color(C.muted).child("No messages yet. Dispatch sends the first one.")))
          .children(this.comms.slice(0, 2).map((c) => h_flex().gap(8).items_center().min_w(0)
            .child(micro(new Date(c.at).toTimeString().slice(0, 5), C.muted).w(34).flex_none())
            .child(div().w(3).h(12).flex_none().bg(C[KIND[c.kind]?.edge ?? "flow"]))
            .child(wide(c.to === p.terminal ? `◀ ${c.from}` : `▶ ${c.to}`, C.text, 8.5).flex_none())
            .child(div().min_w(0).truncate().text_size(11).text_color(C.muted).child(c.text))))))
        .when(Boolean(question), (el) => el.child(h_flex().mx(18).mt(12).gap(8).items_stretch()
          .child(div().w(4).flex_none().border_t(1.5).border_b(1.5).border_l(1.5).border_color(C.text))
          .child(div().flex_1().py(6).font_family("JetBrains Mono").text_size(11).line_height(1.45).child(question))
          .child(div().w(4).flex_none().border_t(1.5).border_b(1.5).border_r(1.5).border_color(C.text)))))
        // The ink footer: the actions, the card's main one set apart at the right.
        .child(h_flex().flex_none().mt(12).pl(18).pr(12).py(10).gap(6).items_center().bg(C.ink).text_color("#F2F2F2")
          .children(K.acts.slice(0, -1).map((act) => button[act]()))
          .child(div().flex_1())
          .child(button[K.acts.at(-1)]()))));
  }
}
