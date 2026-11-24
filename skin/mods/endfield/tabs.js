// tabs: the tab strip (window drag). Behaviour ported from the shipped `tabs` mod: drag reorder,
// wheel switching, the + menu, Files/Changes with per-space memory, and window buttons where the
// system draws none. A tab acts like a VS Code tab (tabplate.js says what it offers): double-click
// zooms its focused pane, middle-click and its ✕ close it without ending an agent (the Squads list
// runs the close, docking.js askTab), right-click opens
// the `tabmenu` popup. Rename is in that menu and on F2 (Herdr's tab.rename).
// Ours: a held tab carried out under the strip docks its lead agent in the work area (docking.js).

import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { spaces, focused, run, openOverlay, closeOverlay, props, window as appWindow, shared, layout, settings } from "herdr";
import { palette, root, find, stop, glyph, freshDot, micro, icon, pad2, telling, growDisc, pill, cue, binding, Entrance, MOTION } from "./kit.js";
import { statusOf } from "./fleet.js";
import { REPORT, toggleReport } from "./report.js";
import { commsPane, openComms } from "./comms.js";
import { underStrip } from "./dock.js";
import { startDock, askTab, chatOf, paneChat } from "./docking.js";
import { markAt } from "./tabmark.js";
import { world, perform, menuRow, MENU } from "./pane.js";
import { tipOf } from "./plate.js";
import { closePlan, closeAction, tabActions, paneOfTab } from "./tabplate.js";

// The plate a tab's agent is carried on, as the dock board draws it: its size, and where the pointer holds it.
const CARRIED = { size: { w: 228, h: 52 }, grip: { x: 24, y: 16 } };

// A tab Herdr named follows its agent's live title, as the agents list does; a name the person gave stays.
function label(tab, lead) {
  const prog = lead?.program?.name;
  const base = tab.named ? tab.name : prog ?? "Terminal";
  if (!lead?.program?.agent) return base;
  const live = telling(lead);
  return (tab.name === prog || !tab.named) && live ? live : base;
}

const leadOf = (id, ps) => ps.find((p) => p.tab === id && p.program?.agent) ?? ps.find((p) => p.tab === id);

/** Tab `id`'s menu (tabplate.js tabActions) on Herdr's lists now, with its space and tab. */
function menuOf(id) {
  const all = spaces(), w = world(), ps = w.panes;
  const space = all.find((s) => s.tabs.some((t) => t.id === id));
  const lead = leadOf(id, ps);
  const focus = paneOfTab(id, ps);
  const chat = focus?.terminal ? chatOf(focus.terminal) ?? paneChat(focus.terminal) : null;
  return { tab: space?.tabs.find((t) => t.id === id) ?? null, lead, ...tabActions({ id, space: space?.id }, w, { spaces: all, chat }) };
}

/** Runs a tab menu action: Close through the list, which plans it then; a pane action on the tab's focused pane, shown first. */
function act(m, a) {
  if (a.id === "close") return askTab(m.tab.id);
  if (a.select && !m.tab?.active) run("tab.select", { id: m.tab.id });
  perform(a, m.pane);
}

const openTabMenu = (id) => {
  const m = menuOf(id);
  const rows = m.actions.length + m.moves.length + 1, titles = m.moves.length ? 2 : 1;
  openOverlay({ mod: "endfield", kind: "popup", width: MENU.w, height: titles * MENU.title + rows * MENU.row + 2 * MENU.pad, props: { role: "tabmenu", tab: id } });
};

/** A tab's right-click menu: Rename, its focused pane's actions, Move to squad, Close. props {role: "tabmenu", tab}. */
export class TabMenu {
  pick(p, m, a) {
    closeOverlay(p.overlay);
    act(m, a);
  }

  render() {
    const C = palette();
    const p = props();
    const m = menuOf(p.tab);
    const heading = (text) => div().h(MENU.title).px(8).flex().items_center().child(micro(text, C.muted).truncate());
    if (!m.tab || !m.pane) return root(C, v_flex().w_full().p(MENU.pad).bg(C.raised).child(heading("Gone")));
    const row = (a) => menuRow(C, `tm-${a.id}`, a, () => this.pick(p, m, a));
    return root(C, v_flex().w_full().p(MENU.pad).bg(C.raised)
      .child(heading(label(m.tab, m.lead)))
      .children(m.actions.map(row))
      .when(m.moves.length > 0, (el) => el.child(heading("Move to squad")).children(m.moves.map(row)))
      .child(row(m.close)));
  }
}

const PANELS = [
  { id: "files", label: "Files" },
  { id: "changes", label: "Changes" },
];

export default class Tabs {
  init(_props, cx) {
    this.pressed = null;
    // The agent of the tab being held, {terminal, title}: carried out under the strip, it docks.
    this.held = null;
    this.scroll = ScrollHandle.new();
    try { this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}"); } catch { this.panels = {}; }
    if (!this.panels || typeof this.panels !== "object" || Array.isArray(this.panels)) this.panels = {};
    this.swipe = { acc: 0, steps: 0, at: 0, last: 0 };
    this.widths = {};
    this.hot = null;
    this.entrance = new Entrance(1);
    this.entrance.start(cx);
  }

  // One tab per wheel notch; a touchpad swipe switches one tab per 60px, at most every 100ms so each shows.
  wheel(e) {
    if (e.delta_lines) {
      if (e.delta_lines.y) run(e.delta_lines.y > 0 ? "tab.prev" : "tab.next");
      return;
    }
    const s = this.swipe, now = Date.now();
    if (e.touch_phase === "started" || now - s.at > 250 || e.delta.y * s.acc < 0) Object.assign(s, { acc: 0, steps: 0 });
    s.at = now;
    s.acc += e.delta.y;
    const need = s.steps ? 60 : 20;
    if (Math.abs(s.acc) < need || now - s.last < 100) return;
    s.acc -= Math.sign(s.acc) * need;
    s.steps++;
    s.last = now;
    run(e.delta.y > 0 ? "tab.prev" : "tab.next");
  }

  // The side panel is remembered per space: switching restores that space's choice, opening or closing records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id;
      this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else wins), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  // A move anywhere in the window while a tab's agent is held. Under the strip the dock board takes it, so no tab is selected or moved.
  carry(e, cx) {
    if (!this.held) return;
    // No button: the release was missed (it happened outside the window), so nothing is held.
    if (e.pressed_button !== "left") this.held = null;
    else if (underStrip(e.local_position, e.bounds)) {
      startDock({ terminal: this.held.terminal, anchor: focused()?.pane ?? null, title: this.held.title, ...CARRIED });
      this.held = null;
      this.pressed = null;
    } else return;
    cx.notify();
  }

  // What a tab says after its label: unseen gets the new-dot, quiet says nothing.
  signal(C, s) {
    const st = statusOf(s);
    if (!st || st.quiet) return null;
    return st.fresh ? freshDot(C, 7) : glyph(C, s, { size: 10 });
  }

  item(C, space, shown, active, c, i, w) {
    const ps = w.panes;
    const lead = leadOf(c.id, ps);
    const name = label(c, lead);
    const on = c.active;
    // VS Code: the ✕ shows on the active tab and the hovered one. Its slot is always there, so a hover never shifts the strip.
    const shut = on || this.over === c.id;
    const close = closeAction(closePlan(c.id, w));
    // The selected tab is its own yellow plate, so the plate is the tab's box at any zoom and its
    // ink text always has yellow behind it. On yellow, hues would vanish: its glyphs go ink.
    const K = on ? { ...C, flow: C.ink, signal: C.ink, ink: C.signal } : C;
    const program = lead?.program;
    const hover = (key) => this.hover(key);
    return h_flex().id(`tab-${c.id}`).relative().h_full().pl(14).pr(8).gap(8).items_center().flex_none()
      .border_r(1).border_color(on ? C.signal : C.hair).when(on, (el) => el.bg(C.signal))
      .text_color(on ? C.ink : C.text)
      .on_hover((over, cx) => {
        if (over) this.over = c.id;
        else if (this.over === c.id) this.over = null;
        hover(`tab-${c.id}`)(over, cx);
      })
      .on_size_change((size, cx) => {
        this.widths[c.id] = size.width;
        if (i <= active) this.scroll.scroll_to_item(active);
        cx.notify();
      })
      .child(div().id(`tab-under-${c.id}`).absolute().left(14).bottom(5).h(2).bg(C.text).w(this.hot === `tab-${c.id}` && !on ? 24 : 0)
        .transition("width", MOTION.row.wipe))
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        // A double-click zooms and holds nothing: its release only selects this tab.
        const twice = e.click_count === 2;
        this.pressed = twice ? null : i;
        this.held = lead?.program?.agent && e.click_count === 1 ? { terminal: lead.terminal, title: name } : null;
        if (twice) {
          const m = menuOf(c.id), zoom = m.actions.find((a) => a.id === "zoom" && !a.why);
          if (zoom) act(m, zoom);
        }
        cx.notify();
      })
      // Middle-click closes this tab where it is: no select first, so no other tab is shown or closed.
      .on_mouse_down("middle", (_e, cx) => { cx.stop_propagation(); askTab(c.id); })
      .on_mouse_up("left", () => {
        const from = this.pressed;
        this.pressed = null;
        if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex((x) => x.id === c.id) + 1 });
        else run("tab.select", { id: c.id });
      })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openTabMenu(c.id); })
      .child(micro(pad2(i + 1), on ? C.ink : C.muted).relative())
      .when(Boolean(program?.icon) && Boolean(program?.agent), (el) => el.child(program.tint ? svg(program.icon).relative().size(13).flex_none().text_color(on ? C.ink : C.muted) : image(program.icon).relative().size(13).flex_none()))
      .child(div().relative().max_w(180).truncate().text_size(12.5).font_medium().child(name))
      .when(c.zoomed, (el) => el.child(micro("Zoom", on ? C.ink : C.muted, 9).relative()))
      .child(div().relative().flex_none().child(this.signal(K, c.status) ?? div()))
      .child(div().id(`close-${c.id}`).relative().size(18).flex().items_center().justify_center().opacity(shut ? 1 : 0)
        .text_color(on || this.hot === `close-${c.id}` ? C.ink : C.text).on_hover(hover(`close-${c.id}`))
        .tooltip(tipOf(close, binding)).on_mouse_down("left", stop).on_mouse_down("middle", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); askTab(c.id); })
        .child(growDisc(`close-disc-${c.id}`, 18, 18, 18, this.hot === `close-${c.id}`, C.red))
        .child(icon("close", 10).relative()));
  }

  hover(key) {
    return (over, cx) => {
      if (over) this.hot = key;
      else if (this.hot === key) this.hot = null;
      cx.notify();
    };
  }

  render() {
    const C = palette();
    const space = spaces().find((p) => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex((tab) => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const rootNode = layout(), sidebar = find(rootNode, "sidebar"), w = appWindow();
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && rootNode?.traffic_lights
      ? Math.max(0, (rootNode.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 0;
    const panel = find(rootNode, "panel"), body = find(rootNode, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    // Game pills: an open panel's pill is ink, a closed one an outline.
    const toggle = (id, label, on, action) => pill(C, id, label, { kind: on ? "ink" : "ghost", knob: null, action: () => { if (!on) cue("tick"); action(); } });
    // The ink marker slides between tabs over their measured widths.
    const { left: at, width } = markAt({ ids: shown.map((c) => c.id), widths: this.widths, active, zoom: settings().zoom });
    const mark = div().id("tab-mark").absolute().bottom(0).h(3).bg(C.ink).left(at).w(width)
      .transition("left", MOTION.select.edge).transition("width", MOTION.select.edge);
    const winButton = (id, name, tip, action, danger) => div().id(id).relative().w(44).h_full().flex().items_center().justify_center()
      .text_color(C.text).when(!danger, (el) => el.hover((s) => s.bg(C.sunken)))
      .on_hover((over, cx) => { if (over) this.hot = id; else if (this.hot === id) this.hot = null; cx.notify(); })
      .tooltip(tip).on_mouse_down("left", stop).on_click(action)
      .when(Boolean(danger), (el) => el.child(growDisc(`${id}-disc`, 44, 35, 26, this.hot === id, C.red)))
      .child(icon(name, 10).relative().when(Boolean(danger) && this.hot === id, (el) => el.text_color(C.ink)));
    return root(C, this.entrance.apply(h_flex().size_full().min_w(0).pl(lightsPadding).items_center().bg(C.ground).border_b(1).border_color(C.hair)
      .on_mouse_up("left", () => { this.pressed = null; })
      // A held tab's agent is followed out of the strip, where an element's own handlers hear nothing.
      .when(Boolean(this.held), (el) => el.on_window_mouse_move((e, cx) => this.carry(e, cx))
        .on_window_mouse_up("left", (_e, cx) => { this.held = null; cx.notify(); }))
      .on_scroll_wheel((e) => this.wheel(e))
      .child(h_flex().id("tab-scroll").flex_shrink(1).min_w(0).h_full().items_center().overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) this.scroll.scroll_to_item(active); cx.notify(); })
        .children((() => { const w = world(); return shown.map((c, i) => this.item(C, space, shown, active, c, i, w)); })())
        .child(mark))
      .child(h_flex().h_full().px(10).flex_none().items_center()
        .child(pill(C, "tab-new", "New tab", { knob: "+", hot: this.hot === "tab-new", on_hover: this.hover("tab-new"),
          action: () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }) })))
      .child(div().flex_1().h_full())
      .child(h_flex().h_full().px(12).gap(6).flex_none().items_center()
        .children(PANELS.filter((p) => enabled.includes(p.id)).map((p) => {
          const on = Boolean(panel) && !panel.hidden && body?.active === p.id;
          return toggle(`panel-${p.id}`, p.label, on, () => {
            if (on) run("layout.hide", { id: "panel" });
            else { run("layout.select", { stack: "panel-body", child: p.id }); run("layout.show", { id: "panel" }); }
          });
        }))
        .child((() => {
          const open = Boolean(commsPane());
          return pill(C, "tab-comms", "Comms", { kind: open ? "ink" : "ghost", knob: null, tip: open ? "Close the Comms pane" : "Who sent what to whom",
            action: () => { if (!open) cue("tick"); openComms(); } });
        })())
        .child((() => {
          const open = find(rootNode, REPORT.stack)?.active === REPORT.report;
          return pill(C, "tab-report", "Report", { kind: "ink", knob: open ? "×" : "▶", hot: this.hot === "tab-report", on_hover: this.hover("tab-report"),
            tip: open ? "Back to the panes" : "Every squad on one screen", action: () => { if (!open) cue("tick"); toggleReport(!open); } });
        })()))
      .when(Boolean(w?.buttons), (el) => el.child(h_flex().h_full().flex_none().border_l(1).border_color(C.hair)
        .child(winButton("minimize", "win-min", "Minimize", () => run("window.minimize")))
        .child(winButton("maximize", w.maximized ? "win-restore" : "win-max", w.maximized ? "Restore" : "Maximize", () => run("window.maximize")))
        .child(winButton("close-window", "win-close", "Close", () => run("window.close"), true))))));
  }
}
