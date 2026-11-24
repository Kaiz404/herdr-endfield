// docking: a chat dragged out of Squads into the work area, and the move that follows a drop
// (dock.js holds the rules). The agents list opens the `dock` overlay when a held agent row leaves
// the list by its right edge: a frameless popup over the whole window that draws the chat's ghost
// at the pointer and the slab where it would land. On a drop it asks the list through the shared
// key `endfield.dock.ask` ({terminal, zone, anchor, at}), since the list outlives the overlay and
// a move must not stop halfway; the list runs moveChat and answers in `endfield.dock.done`
// ({at, ok}). The overlay holds the slab over Herdr's re-layout a beat, then fades and closes.
//   dock  props {role: "dock", terminal, anchor (the pane focused when the drag began), left (the
//         sidebar's right edge), from (the row's rect), grip (the press inside it), pointer, title, overlay}

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, run, panes, spaces, focused, shared, setShared, notify, layout } from "herdr";
import { palette, root, micro, wide, chip, MOTION } from "./kit.js";
import { roster } from "./roster.js";
import { zoneAt, landing, collapsed, workRect, dockPlan, applied, machineOf, homeOf, whereIs, moveToast } from "./dock.js";

// How long each step may take to show in panes(): park took about 1.5s on a local machine.
const WAIT = { ms: 4000, poll: 100 };

/** A chat as dock.js plans it, from its roster member and Herdr's panes. Null when it is gone. */
export function chatOf(address, m = roster().all.get(address)) {
  if (!m) return null;
  return { terminal: m.address, label: m.label, pane: panes().find((p) => p.terminal === address)?.pane ?? null, tab: m.tab, space: m.space,
    machine: machineOf(m.address), linked: m.linked ?? m.helpers?.[0] ?? null };
}

/** The Place of pane `pane`, or null when it is gone. */
export function anchorOf(pane) {
  const p = panes().find((x) => x.pane === pane);
  if (!p) return null;
  const s = spaces().find((x) => x.tabs.some((t) => t.id === p.tab));
  return { pane, tab: p.tab, space: s?.id ?? null, machine: s?.machine ?? null };
}

// A data wait inside a spawned task: it reads Herdr's lists and never repaints, so cx.sleep is not a motion timer.
async function until(cx, ok) {
  for (let t = 0; t <= WAIT.ms; t += WAIT.poll) {
    if (ok()) return true;
    await cx.sleep(WAIT.poll);
  }
  return false;
}

/** Says where the chat is when that isn't the tab it was sent to (dock.js moveToast). */
export const told = (chat, tab) => {
  const t = moveToast(chat, tab, whereIs(chat.terminal, panes(), spaces()));
  if (t) notify({ ...t, timeout: null });
};

/**
 * A move that stopped: the chat goes back to the tab it came from, right of `home` (dock.js
 * homeOf), when the park took its pane; never into a pane the person didn't choose. A toast says
 * where it is now, or how to show it again if it is left with no pane.
 */
async function recover(cx, chat, home) {
  const shown = () => panes().some((p) => p.terminal === chat.terminal);
  if (!shown() && home && panes().some((p) => p.pane === home)) {
    run("pane.focus", { pane: home });
    if (await until(cx, () => focused()?.pane === home) && focused()?.pane === home) {
      run("terminal.keep", { terminal: chat.terminal, place: "right" });
      await until(cx, shown);
    }
  }
  told(chat, null);
  return false;
}

/**
 * Runs a dock.js plan, each step once Herdr shows the last one applied. Between the park and the
 * keep the chat has no pane, no labels and no keep, and keep splits whatever pane has the focus:
 * so a keep runs only while the pane it was planned beside has it, and is tried twice. A step not
 * seen, or a throw, ends in recover. -> whether every step showed and it is in the tab planned.
 */
export async function moveChat(cx, chat, steps) {
  const home = homeOf(panes(), chat);
  const keep = steps.find((s) => s.cmd === "terminal.keep");
  try {
    for (const s of steps) {
      let ok = false;
      for (let i = 0; i < (s === keep ? 2 : 1) && !ok; i++) {
        if (s.beside && focused()?.pane !== s.beside) break;
        const pane = panes().find((p) => p.terminal === chat.terminal)?.pane;
        run(s.cmd, s.own ? { ...s.args, pane } : s.args);
        ok = await until(cx, () => applied(s, chat.terminal, panes(), focused()?.pane ?? null));
      }
      if (!ok) return await recover(cx, chat, home);
    }
  } catch {
    return await recover(cx, chat, home);
  }
  const tab = keep ? panes().find((p) => p.pane === keep.beside)?.tab ?? null : chat.tab;
  told(chat, tab);
  return whereIs(chat.terminal, panes(), spaces())?.tab === tab;
}

export const openDock = (p) => openOverlay({ mod: "endfield", kind: "popup", frame: "none", width: 1, height: 1, at: { x: 0, y: 0 }, props: { role: "dock", ...p } });

const box = (el, r) => el.absolute().left(r.x).top(r.y).w(r.w).h(r.h);

export class Dock {
  init(p, cx) {
    this.p = p;
    this.size = null;
    this.pt = p.pointer;
    // drag -> landing (asked the list) -> held (landed: the slab's beat) -> out (fading); back: cancelled, springing home.
    this.phase = "drag";
    this.zone = null;
    // The zone the slab belongs to, and whether it has grown out of its edge.
    this.slab = { zone: null, open: false };
    this.popped = false;
    // When the pointer last moved here: a drag nobody steers is cancelled (idle).
    this.movedAt = Date.now();
    this.idle(cx, MOTION.dock.idle.delay);
    this.keys = cx.focus_handle();
    cx.timer.after(MOTION.settle.delay, (cx) => { this.popped = true; this.keys.focus(); cx.notify(); });
  }

  // A drag nobody steers is cancelled: the release was missed, so the next click must not drop it.
  idle(cx, ms) {
    cx.timer.after(ms, (cx) => {
      if (this.phase !== "drag") return;
      const left = MOTION.dock.idle.delay - (Date.now() - this.movedAt);
      if (left <= 0) this.back(cx); else this.idle(cx, left);
    });
  }

  rect() { return workRect(this.size, this.p.left, layout()); }

  plan(zone) {
    const chat = chatOf(this.p.terminal);
    return chat ? { chat, ...dockPlan(chat, anchorOf(this.p.anchor), zone) } : { chat: null, problem: "It has ended" };
  }

  move(e, cx) {
    if (this.phase !== "drag") return;
    this.movedAt = Date.now();
    this.pt = e.position;
    const zone = zoneAt(this.pt, this.rect());
    if (zone === this.zone) { cx.notify(); return; }
    // A slab grows out of its zone's edge once it has been drawn there flat; from one zone to the next it slides.
    if (zone && !this.zone) {
      this.slab = { zone, open: false };
      cx.timer.after(MOTION.settle.delay, (cx) => { if (this.zone === zone) { this.slab = { zone, open: true }; cx.notify(); } });
    } else if (zone) this.slab = { zone, open: true };
    else this.slab = { ...this.slab, open: false };
    this.zone = zone;
    cx.notify();
  }

  drop(cx) {
    if (this.phase !== "drag") return;
    // Only a pointer move here sets a zone, so a release with no move since the overlay opened drops nothing.
    const plan = this.zone ? this.plan(this.zone) : null;
    if (!plan?.steps) return this.back(cx);
    this.phase = "landing";
    this.at = Date.now();
    setShared("endfield.dock.ask", { terminal: this.p.terminal, zone: this.zone, anchor: this.p.anchor, at: this.at });
    cx.timer.after(MOTION.dock.wait.delay, (cx) => { if (this.phase === "landing") this.back(cx); });
    cx.notify();
  }

  back(cx) {
    if (this.phase === "back" || this.phase === "out") return;
    this.phase = "back";
    this.slab = { ...this.slab, open: false };
    cx.timer.after(MOTION.dock.gone.delay + MOTION.dock.gone.duration, () => closeOverlay(this.p.overlay));
    cx.notify();
  }

  // The list's answer: landed, so hold the slab a beat over Herdr's re-layout, then fade and close.
  landed(cx) {
    const done = shared("endfield.dock.done");
    if (this.phase !== "landing" || done?.at !== this.at) return;
    if (!done.ok) { cx.timer.after(0, (cx) => this.back(cx)); return; }
    this.phase = "held";
    cx.timer.after(MOTION.dock.beat.delay, (cx) => {
      this.phase = "out";
      cx.timer.after(MOTION.dock.out.duration, () => closeOverlay(this.p.overlay));
      cx.notify();
    });
  }

  render(cx) {
    const C = palette();
    const p = props() ?? this.p;
    this.landed(cx);
    const r = this.rect();
    const inWork = Boolean(r) && this.phase !== "back" && this.phase !== "out" && (this.zone || this.phase !== "drag");
    const zone = this.slab.zone;
    const plan = zone ? this.plan(zone) : null;
    const fits = Boolean(plan?.steps);
    const slabAt = r && zone ? (!this.slab.open ? collapsed(zone, r) : plan.whole ? r : landing(zone, r)) : null;
    const m = roster().all.get(p.terminal);
    const from = p.from;
    // The ghost: the row's rect when it appears, then at the pointer (where it was pressed in the row),
    // then the slab once dropped, or home again on a cancel.
    const ghost = this.phase === "back" ? from
      : this.phase === "drag" ? (this.popped ? { x: this.pt.x - p.grip.x, y: this.pt.y - p.grip.y, w: from.w, h: from.h } : { x: from.x + from.w * 0.03, y: from.y + from.h * 0.03, w: from.w * 0.94, h: from.h * 0.94 })
      : slabAt ?? from;
    const motion = this.phase === "drag" ? MOTION.dock.ghost : this.phase === "back" ? MOTION.dock.home : MOTION.dock.fly;
    const ghostShown = this.popped && this.phase !== "back" && this.phase !== "out";
    // The work area's outline and its centre, faint, once the pointer is over it.
    const zones = r && box(div().id("dock-zones"), r).rounded(4).border_1().border_color(C.hairStrong)
      .opacity(inWork ? 1 : 0).transition("opacity", MOTION.dock.zones)
      .child(box(div(), { x: r.w / 4, y: r.h / 4, w: r.w / 2, h: r.h / 2 }).rounded(3).border_1().border_color(C.hair));
    // The slab: where the chat lands, yellow-edged; a zone it can't land in is grey and says why.
    const slab = slabAt && box(div().id("dock-slab"), slabAt).overflow_hidden().rounded(4)
      .bg(`${C.text}14`).border_2().border_color(fits ? C.signal : C.hairStrong)
      .opacity(this.phase === "out" || this.phase === "back" ? 0 : 1)
      .transition("left", MOTION.dock.slab).transition("top", MOTION.dock.slab).transition("width", MOTION.dock.slab).transition("height", MOTION.dock.slab)
      .transition("opacity", MOTION.dock.out)
      .child(div().absolute().left(12).top(10).child(micro(fits ? plan.label : plan?.problem ?? "", C.text)));
    return root(C, div().id("dock-root").size_full().relative()
      .on_size_change((size, cx) => { this.size = size; cx.notify(); })
      .on_mouse_move((e, cx) => this.move(e, cx))
      .on_mouse_up("left", (_e, cx) => this.drop(cx))
      // The drag arrives with the button already down, so a press here means its release was missed: cancel.
      .on_mouse_down("left", (_e, cx) => { if (this.phase === "drag") this.back(cx); })
      .on_mouse_down("right", (_e, cx) => { if (this.phase === "drag") this.back(cx); })
      .track_focus(this.keys)
      .on_key_down((e, cx) => { if (e.key === "escape") this.back(cx); })
      .when(Boolean(zones), (el) => el.child(zones))
      .when(Boolean(slab), (el) => el.child(slab))
      .child(box(h_flex().id("dock-ghost"), ghost).overflow_hidden().px(10).gap(10).items_start().pt(10)
        .rounded(3).bg(C.raised).border_1().border_color(C.hairStrong).shadow_lg()
        .opacity(ghostShown ? 1 : 0)
        .spring("left", motion).spring("top", motion).spring("width", motion).spring("height", motion)
        .transition("opacity", this.phase === "back" ? MOTION.dock.gone : this.phase === "out" ? MOTION.dock.out : MOTION.dock.pop)
        .when(Boolean(m), (el) => el.child(chip(C, m.ident, m.status, { size: 28 })))
        .child(v_flex().flex_1().min_w(0).gap(4)
          .child(wide(m?.label ?? p.terminal, C.text, 10).truncate())
          .child(div().min_w(0).truncate().text_size(11.5).text_color(C.muted).child(p.title ?? "")))));
  }
}
