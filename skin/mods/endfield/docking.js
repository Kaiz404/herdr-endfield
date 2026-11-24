// docking: a chat dragged into the work area, and the move that follows a drop (dock.js holds the
// rules). The layout floats the `dock` role over work-body, in the main window: a popup is a
// window of its own, and a held drag's pointer never reaches one. The board draws nothing until a
// drag is handed to it in the shared key `endfield.dock.drag` (startDock): the agents list does
// that when a held agent row leaves the list by its right edge, the tab strip when a held tab is
// carried out under it. From then the board watches the pointer in the whole window
// (on_window_mouse_move, on_window_mouse_up), and draws the chat's ghost at it and the slab where
// it would land. On a drop it asks the list through `endfield.dock.ask` ({terminal, zone, anchor,
// at}), since a move must not stop halfway and the list is always there; the list runs moveChat
// and answers in `endfield.dock.done` ({at, ok}). The board holds the slab over Herdr's re-layout
// a beat, then fades and draws nothing again.
//   endfield.dock.drag  {terminal, anchor (the pane focused when the drag began), grip (the press
//         inside the held row) and size (the row's, {w, h}), both in the px a mod lays out in, title, at}
// A pane plate's Hide and Pop out, and a click on a hidden agent in Squads, ask the list the same
// way (askPane), so a move outlives the plate whose pane it takes away:
//   endfield.pane.ask  {kind: "hide" | "popout" | "show", terminal, at}

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, panes, spaces, focused, shared, setShared, notify, layout, settings } from "herdr";
import { palette, root, micro, wide, chip, MOTION } from "./kit.js";
import { roster } from "./roster.js";
import { zoneAt, landing, collapsed, boardRect, dockPlan, applied, machineOf, homeOf, whereIs, moveToast } from "./dock.js";

// How long each step may take to show in panes(): park took about 1.5s on a local machine.
const WAIT = { ms: 4000, poll: 100 };

/** A chat as dock.js plans it, from its roster member and Herdr's panes. Null when it is gone. */
export function chatOf(address, m = roster().all.get(address)) {
  if (!m) return null;
  return { terminal: m.address, label: m.label, pane: panes().find((p) => p.terminal === address)?.pane ?? null, tab: m.tab, space: m.space,
    machine: machineOf(m.address), linked: m.linked ?? m.helpers?.[0] ?? null };
}

/** A terminal's pane as a chat, for one the roster doesn't list (a shell). Null when it has no pane. */
export function paneChat(terminal) {
  const p = panes().find((x) => x.terminal === terminal);
  if (!p) return null;
  return { terminal, label: p.program?.name ?? null, pane: p.pane, tab: p.tab, space: anchorOf(p.pane)?.space ?? null, machine: machineOf(terminal), linked: null };
}

export const PANE_ASK = "endfield.pane.ask";
export const askPane = (kind, terminal) => { if (terminal) setShared(PANE_ASK, { kind, terminal, at: Date.now() }); };

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
  // Only a chat whose pane the park took goes back: a child that never had one (fleet.js) stays paneless.
  if (chat.pane && !shown() && home && panes().some((p) => p.pane === home)) {
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
  // A keep with no pane to land beside makes its own tab: wherever it shows is where it was sent.
  const tab = !keep ? chat.tab : keep.beside ? panes().find((p) => p.pane === keep.beside)?.tab ?? null : whereIs(chat.terminal, panes(), spaces())?.tab ?? null;
  told(chat, tab);
  return whereIs(chat.terminal, panes(), spaces())?.tab === tab;
}

const DRAG = "endfield.dock.drag";

/** Hands a held chat to the dock board. d: {terminal, anchor, grip, size, title} (above). */
export const startDock = (d) => setShared(DRAG, { ...d, at: Date.now() });

const zoom = () => Number(settings().zoom) || 1;

// The window's size in window px. Null with no window (herdr-app check).
function view() {
  try { return window.viewport_size(); } catch { return null; }
}

const box = (el, r) => el.absolute().left(r.x).top(r.y).w(r.w).h(r.h);

export class Dock {
  init(_p, cx) {
    // The drag on the board, from the shared key; null while it draws nothing.
    this.d = null;
    // The `at` of the last drag seen in the key, taken or not.
    this.at = null;
    this.keys = cx.focus_handle();
    setShared(DRAG, null);
  }

  // A drag newly handed over: the board comes up for it. Every timer it starts is for that drag only.
  take(cx) {
    const d = shared(DRAG);
    if (!d || d.at === this.at) return;
    this.at = d.at;
    // No room for a board (or no window): the drag ends here, once this render is over.
    if (!this.rect()) { cx.timer.after(0, () => { if (shared(DRAG)?.at === d.at) setShared(DRAG, null); }); return; }
    this.d = d;
    // The pointer against the board, in the px it lays out in: null until it first moves.
    this.pt = null;
    // drag -> landing (asked the list) -> held (landed: the slab's beat) -> out (fading); back: cancelled, fading.
    this.phase = "drag";
    this.zone = null;
    // The zone the slab belongs to, and whether it has grown out of its edge.
    this.slab = { zone: null, open: false };
    // When the pointer last moved: a drag nobody steers is cancelled (idle).
    this.movedAt = Date.now();
    this.idle(cx, d, MOTION.dock.idle.delay);
  }

  // A drag nobody steers is cancelled: the release was missed, so the next click must not drop it.
  idle(cx, d, ms) {
    cx.timer.after(ms, (cx) => {
      if (this.d !== d || this.phase !== "drag") return;
      const left = MOTION.dock.idle.delay - (Date.now() - this.movedAt);
      if (left <= 0) this.back(cx); else this.idle(cx, d, left);
    });
  }

  // The board draws nothing again, and the next drag may come.
  end(d) {
    if (this.d !== d) return;
    this.d = null;
    setShared(DRAG, null);
  }

  // The keyboard goes back to the pane that had it: the board took it for Esc.
  unfocus() {
    if (this.d.anchor && this.keys.is_focused()) run("pane.focus", { pane: this.d.anchor });
  }

  rect() { return boardRect(view(), zoom(), layout()); }

  plan(zone) {
    const chat = chatOf(this.d.terminal);
    return chat ? { chat, ...dockPlan(chat, anchorOf(this.d.anchor), zone) } : { chat: null, problem: "It has ended" };
  }

  move(e, cx) {
    if (!this.d || this.phase !== "drag") return;
    this.movedAt = Date.now();
    // Esc must reach the board, not the agent in the focused pane. The list hands the keyboard
    // back to that pane as it lets go, so the board takes it on a move, not once when it comes up.
    if (!this.keys.is_focused()) this.keys.focus();
    const z = zoom();
    this.pt = { x: e.local_position.x / z, y: e.local_position.y / z };
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
    const d = this.d;
    if (!d || this.phase !== "drag") return;
    // Only a pointer move on the board sets a zone, so a release off it, or before any move, drops nothing.
    const plan = this.zone ? this.plan(this.zone) : null;
    if (!plan?.steps) return this.back(cx);
    this.unfocus();
    this.phase = "landing";
    setShared("endfield.dock.ask", { terminal: d.terminal, zone: this.zone, anchor: d.anchor, at: d.at });
    cx.timer.after(MOTION.dock.wait.delay, (cx) => { if (this.d === d && this.phase === "landing") this.back(cx); });
    cx.notify();
  }

  back(cx) {
    const d = this.d;
    if (!d || this.phase === "back" || this.phase === "out") return;
    if (this.phase === "drag") this.unfocus();
    this.phase = "back";
    this.slab = { ...this.slab, open: false };
    cx.timer.after(MOTION.dock.gone.delay + MOTION.dock.gone.duration, () => this.end(d));
    cx.notify();
  }

  // The list's answer: landed, so hold the slab a beat over Herdr's re-layout, then fade and go.
  landed(cx) {
    const d = this.d, done = shared("endfield.dock.done");
    if (!d || this.phase !== "landing" || done?.at !== d.at) return;
    if (!done.ok) { cx.timer.after(0, (cx) => { if (this.d === d) this.back(cx); }); return; }
    this.phase = "held";
    cx.timer.after(MOTION.dock.beat.delay, (cx) => {
      if (this.d !== d) return;
      this.phase = "out";
      cx.timer.after(MOTION.dock.out.duration, () => this.end(d));
      cx.notify();
    });
  }

  render(cx) {
    this.take(cx);
    this.landed(cx);
    const d = this.d, r = d ? this.rect() : null;
    // Herdr hides a floating block that draws nothing.
    if (!d || !r) return div();
    const C = palette();
    const leaving = this.phase === "back" || this.phase === "out";
    const zone = this.slab.zone;
    const plan = zone ? this.plan(zone) : null;
    const fits = Boolean(plan?.steps);
    const slabAt = zone ? (!this.slab.open ? collapsed(zone, r) : plan.whole ? r : landing(zone, r)) : null;
    const m = roster().all.get(d.terminal);
    // The ghost hangs from the pointer where the row was taken, then flies into the slab once dropped.
    const ghost = this.phase === "landing" || this.phase === "held" ? slabAt
      : this.pt ? { x: this.pt.x - d.grip.x, y: this.pt.y - d.grip.y, w: d.size.w, h: d.size.h } : null;
    // The work area's outline and its centre, faint.
    const zones = box(div().id("dock-zones"), r).rounded(4).border_1().border_color(C.hairStrong)
      .opacity(leaving ? 0 : 1).transition("opacity", MOTION.dock.zones)
      .child(box(div(), { x: r.w / 4, y: r.h / 4, w: r.w / 2, h: r.h / 2 }).rounded(3).border_1().border_color(C.hair));
    // The slab: where the chat lands, yellow-edged; a zone it can't land in is grey and says why.
    const slab = slabAt && box(div().id("dock-slab"), slabAt).overflow_hidden().rounded(4)
      .bg(`${C.text}14`).border_2().border_color(fits ? C.signal : C.hairStrong)
      .opacity(leaving ? 0 : 1)
      .transition("left", MOTION.dock.slab).transition("top", MOTION.dock.slab).transition("width", MOTION.dock.slab).transition("height", MOTION.dock.slab)
      .transition("opacity", MOTION.dock.out)
      .child(div().absolute().left(12).top(10).child(micro(fits ? plan.label : plan?.problem ?? "", C.text)));
    const motion = this.phase === "drag" ? MOTION.dock.ghost : MOTION.dock.fly;
    return root(C, div().id("dock-root").relative().overflow_hidden().w(r.w).h(r.h)
      // The press began in another block, so only the window's moves and release say where it is.
      .on_window_mouse_move((e, cx) => this.move(e, cx))
      .on_window_mouse_up("left", (_e, cx) => this.drop(cx))
      // The drag arrives with the button already down, so a press here means its release was missed:
      // cancel, and stop the press, which would otherwise drag the floating block.
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); if (this.phase === "drag") this.back(cx); })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); if (this.phase === "drag") this.back(cx); })
      .track_focus(this.keys)
      .on_key_down((e, cx) => { if (e.key === "escape") this.back(cx); })
      .child(zones)
      .when(Boolean(slab), (el) => el.child(slab))
      .when(Boolean(ghost), (el) => el.child(box(h_flex().id("dock-ghost"), ghost).overflow_hidden().px(10).gap(10).items_start().pt(10)
        .rounded(3).bg(C.raised).border_1().border_color(C.hairStrong).shadow_lg()
        .opacity(leaving ? 0 : 1)
        .spring("left", motion).spring("top", motion).spring("width", motion).spring("height", motion)
        .transition("opacity", this.phase === "back" ? MOTION.dock.gone : this.phase === "out" ? MOTION.dock.out : MOTION.dock.pop)
        .when(Boolean(m), (el) => el.child(chip(C, m.ident, m.status, { size: 28 })))
        .child(v_flex().flex_1().min_w(0).gap(4)
          .child(wide(m?.label ?? d.terminal, C.text, 10).truncate())
          .child(div().min_w(0).truncate().text_size(11.5).text_color(C.muted).child(d.title ?? ""))))));
  }
}
