// tabs: the tab strip (window drag). Behaviour ported from the shipped `tabs` mod:
// double-click rename, drag reorder, right-click menu, wheel switching, the + menu,
// Files/Changes with per-space memory, and window buttons where the system draws none.

import { div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, window as appWindow, shared, layout, settings } from "herdr";
import { palette, root, find, stop, glyph, freshDot, micro, icon, pad2, telling, growDisc, pill, cue, Entrance, MOTION } from "./kit.js";
import { statusOf } from "./fleet.js";
import { REPORT, toggleReport } from "./report.js";
import { commsPane, openComms } from "./comms.js";

// A tab Herdr named follows its agent's live title, as the agents list does; a name the person gave stays.
function label(tab, lead) {
  const prog = lead?.program?.name;
  const base = tab.named ? tab.name : prog ?? "Terminal";
  if (!lead?.program?.agent) return base;
  const live = telling(lead);
  return (tab.name === prog || !tab.named) && live ? live : base;
}

const PANELS = [
  { id: "files", label: "Files" },
  { id: "changes", label: "Changes" },
];

export default class Tabs {
  init(_props, cx) {
    this.pressed = null;
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

  // What a tab says after its label: unseen gets the new-dot, quiet says nothing.
  signal(C, s) {
    const st = statusOf(s);
    if (!st || st.quiet) return null;
    return st.fresh ? freshDot(C, 7) : glyph(C, s, { size: 10 });
  }

  item(C, space, shown, active, c, i) {
    const ps = panes();
    const lead = ps.find((p) => p.tab === c.id && p.program?.agent) ?? ps.find((p) => p.tab === c.id);
    const name = label(c, lead);
    const on = c.active;
    // On the signal block, hues would vanish: its glyphs go ink.
    const K = on ? { ...C, flow: C.ink, signal: C.ink, ink: C.signal } : C;
    const program = lead?.program;
    const hover = (key) => this.hover(key);
    return h_flex().id(`tab-${c.id}`).relative().h_full().pl(14).pr(on ? 8 : 14).gap(8).items_center().flex_none()
      .border_r(1).border_color(on ? C.signal : C.hair)
      .text_color(on ? C.ink : C.text)
      .on_hover(hover(`tab-${c.id}`))
      .on_size_change((size, cx) => {
        this.widths[c.id] = size.width;
        if (i <= active) this.scroll.scroll_to_item(active + 1);
        cx.notify();
      })
      .child(div().id(`tab-under-${c.id}`).absolute().left(14).bottom(5).h(2).bg(C.text).w(this.hot === `tab-${c.id}` && !on ? 24 : 0)
        .transition("width", MOTION.row.wipe))
      .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
      .on_mouse_up("left", () => {
        const from = this.pressed;
        this.pressed = null;
        if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex((x) => x.id === c.id) + 1 });
        else run("tab.select", { id: c.id });
      })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
      .child(micro(pad2(i + 1), on ? C.ink : C.muted).relative())
      .when(Boolean(program?.icon) && Boolean(program?.agent), (el) => el.child(program.tint ? svg(program.icon).relative().size(13).flex_none().text_color(on ? C.ink : C.muted) : image(program.icon).relative().size(13).flex_none()))
      .child(div().relative().max_w(180).truncate().text_size(12.5).font_medium().child(name))
      .when(c.zoomed, (el) => el.child(micro("Zoom", on ? C.ink : C.muted, 9).relative()))
      .child(div().relative().flex_none().child(this.signal(K, c.status) ?? div()))
      .when(on, (el) => el.child(div().id(`close-${c.id}`).relative().size(18).flex().items_center().justify_center()
        .text_color(C.ink).on_hover(hover(`close-${c.id}`))
        .tooltip("Close tab").on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); })
        .child(growDisc(`close-disc-${c.id}`, 18, 18, 18, this.hot === `close-${c.id}`, C.red))
        .child(icon("close", 10).relative())));
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
      if (active >= 0) this.scroll.scroll_to_item(active + 1);
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
    // The active tab's yellow block slides between tabs over their measured widths.
    const lefts = shown.reduce((xs, c) => [...xs, xs.at(-1) + (this.widths[c.id] ?? 0)], [0]);
    const at = lefts[Math.max(0, active)], width = active >= 0 ? this.widths[shown[active].id] ?? 0 : 0;
    const block = div().absolute().top(0).bottom(0).bg(C.signal).left(at).w(width);
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
      .on_scroll_wheel((e) => this.wheel(e))
      .child(h_flex().id("tab-scroll").flex_shrink(1).min_w(0).h_full().items_center().overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) this.scroll.scroll_to_item(active + 1); cx.notify(); })
        // Child 0 is the sliding block (scroll indexes above are +1 for it).
        .child(block)
        .children(shown.map((c, i) => this.item(C, space, shown, active, c, i)))
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
