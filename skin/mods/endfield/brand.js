// brand: the sidebar's top (window drag); it also starts the boot when the layout starts.
// footer: the sidebar's bottom entry points. boot: the start-up screen, an overlay.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, updates, setShared, openOverlay, closeOverlay, props, checking, window as appWindow } from "herdr";
import { palette, root, narrow, toggleSidebar, stop, icon, micro, wide, freshDot, binding, rings, cross, growDisc, Entrance, MOTION } from "./kit.js";

// The mark: an ink tile whose bars rise in turn (height, 80ms apart), the last a ramp at half strength.
const BARS = [
  { left: 7, w: 3, h: 8 },
  { left: 12, w: 3, h: 12 },
  { left: 17, w: 3, h: 16 },
  { left: 22, w: 4, h: 14, faint: true },
];

function mark(C, size, risen, id = "mark") {
  const k = size / 30;
  return div().relative().size(size).flex_none().rounded(3).bg(C.selBg)
    .children(BARS.map((b, i) => div().id(`${id}-bar-${i}`).absolute().left(b.left * k).bottom(7 * k).w(b.w * k)
      .h(risen ? b.h * k : 0).bg(C.selText).when(Boolean(b.faint), (el) => el.opacity(0.45))
      .transition("height", { ...MOTION.select.edge, delay: MOTION.brand.rise.delay * i })));
}

export class Brand {
  init(_props, cx) {
    this.entrance = new Entrance(0);
    this.entrance.start(cx);
    if (checking()) return;
    setShared("endfield.boot", Date.now());
    openOverlay({ mod: "endfield", kind: "window", frame: "none", width: 1, height: 1, at: { x: 0, y: 0 }, props: { role: "boot" } });
  }

  render() {
    const C = palette();
    const collapsed = narrow();
    const w = appWindow();
    const mac = w?.platform === "macos" && !w?.fullscreen;
    const key = binding("app.palette");
    const shown = this.entrance.shown;
    const button = div().id("brand-mark").flex_none().cursor_pointer().on_mouse_down("left", stop)
      .on_click(() => run("app.palette")).tooltip(key ? `Commands · ${key}` : "Commands")
      .hover((s) => s.opacity(0.85))
      .child(mark(C, collapsed ? 26 : 30, shown));
    if (collapsed) return root(C, this.entrance.apply(h_flex().size_full().bg(C.ground).border_b(1).border_color(C.hair).justify_center().items_center().when(mac, (el) => el.items_end().pb(8)).child(button)));
    const version = updates()?.app?.version;
    return root(C, this.entrance.apply(h_flex().relative().size_full().bg(C.ground).border_b(1).border_color(C.hair).pl(mac ? 80 : 16).pr(16).pt(14).gap(10).items_start()
      .child(button)
      .child(v_flex().flex_1().min_w(0).pt(2).gap(7)
        .child(wide("Herdr", C.text, 15))
        .child(micro(`Field ops · local${version ? ` · v${version}` : ""}`, C.muted).truncate()))
      // The window's single tri-colour mark: hard stops, right-aligned, wiping in after the bars.
      .child(h_flex().absolute().right(16).bottom(10).h(3).w(28).justify_end()
        .child(h_flex().id("tri-bar").h_full().w(shown ? 28 : 0).overflow_hidden()
          .transition("width", MOTION.brand.tri)
          .child(div().w(5).h_full().flex_none().bg(C.magenta)).child(div().w(5).h_full().flex_none().bg(C.mint)).child(div().w(18).h_full().flex_none().bg(C.signal))))));
  }
}

export class Footer {
  init(_props, cx) {
    this.entrance = new Entrance(2);
    this.entrance.start(cx);
  }

  render() {
    const C = palette();
    const collapsed = narrow();
    const ready = Boolean(updates()?.app?.ready);
    const key = binding("app.palette");
    // Round icon buttons: on hover a signal-yellow disc grows to fill them and the glyph turns ink.
    const button = (id, name, tip, action, extra) => {
      const hot = this.hot === id;
      return div().id(id).relative().size(28).flex_none().flex().items_center().justify_center().rounded_full()
        .text_color(hot ? C.ink : C.muted).tooltip(tip).on_click(action)
        .on_hover((over, cx) => {
          if (over) this.hot = id;
          else if (this.hot === id) this.hot = null;
          cx.notify();
        })
        .child(growDisc(`${id}-disc`, 28, 28, 28, hot, C.signal))
        .child(icon(name, 15).relative())
        .when(Boolean(extra), (el) => el.child(extra));
    };
    const settings = button("ef-settings", "settings", ready ? "Settings · an update is ready" : "Settings", () => run("app.settings"),
      ready ? freshDot(C, 7).absolute().top(4).right(4) : null);
    if (collapsed) return root(C, this.entrance.apply(h_flex().size_full().bg(C.ground).border_t(1).border_color(C.hair).justify_center().items_center().child(settings)));
    return root(C, this.entrance.apply(h_flex().size_full().bg(C.ground).border_t(1).border_color(C.hair).px(12).gap(6).items_center()
      .child(settings)
      .child(button("ef-machine", "server", "Add machine", () => run("mod.open", { name: "machine-add" })))
      .child(button("ef-fold", "sidebar", "Fold the sidebar", toggleSidebar))
      .child(button("ef-search", "search", "Go to: spaces, tabs and agents", () => run("mod.open", { name: "picker" })))
      .child(div().flex_1())
      .child(div().id("ef-palette").cursor_pointer().tooltip("Commands").on_click(() => run("app.palette"))
        .child(micro(key ?? "Palette", C.muted)))));
  }
}

// The boot, the one loud moment (release PV end card): ink, range rings and registration crosses,
// a 10px yellow bar filling the left edge, HERDR// typed on glyph by glyph (each glyph its own
// opacity transition: .frames would loop), a yellow rule that retracts to the right, the subline,
// then the whole screen fades and the regions build in. Click skips it.
export class Boot {
  // Closes on its own clock, set here rather than at its first size: a copy reloaded mid-life
  // (a skin update) gets init again but never a first size.
  init(_p, cx) {
    this.size = null;
    if (!checking()) cx.timer.after(MOTION.boot.total + MOTION.settle.delay, () => this.close());
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    closeOverlay(props().overlay);
  }

  render() {
    const C = palette();
    const s = this.size;
    const go = Boolean(s);
    const W = 220;
    const corner = (x, y) => cross("#FFFFFF4D").absolute().left(x).top(y);
    return h_flex().id("boot").relative().size_full().bg("#141414").items_center().justify_center().overflow_hidden().cursor_pointer()
      .on_size_change((size, cx) => {
        if (this.size) return;
        this.size = size;
        cx.notify();
      })
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.close(); })
      .opacity(go ? 0 : 1)
      .transition("opacity", MOTION.boot.exit)
      .when(go, (el) => el
        .child(rings("#FFFFFF24", 460).absolute().left(s.width / 2 - 230).top(s.height / 2 - 230))
        .child(corner(60, 53)).child(corner(s.width - 69, 53)).child(corner(60, s.height - 67)).child(corner(s.width - 69, s.height - 67)))
      .child(v_flex().relative().gap(18).items_center()
        .child(h_flex().children([..."HERDR//"].map((g, i) => div().id(`boot-g-${i}`).opacity(go ? 1 : 0)
          .transition("opacity", { ...MOTION.boot.type, delay: MOTION.boot.type.delay + i * MOTION.boot.glyph.delay })
          .child(wide(g, "#F2F2F2", 28)))))
        .child(div().relative().w(W).h(14).flex().justify_center()
          .child(div().id("boot-sub").absolute().top(4).opacity(go ? 1 : 0).transition("opacity", MOTION.boot.sub)
            .child(micro("// Field ops · establishing link", "#A9A9A3")))
          .child(div().id("boot-rule").absolute().top(0).h(2).bg(C.signal).left(go ? W : 0).w(go ? 0 : W)
            .transition("left", MOTION.boot.rule).transition("width", MOTION.boot.rule))))
      .child(div().absolute().left(0).top(0).bottom(0).w(10).bg("#2C2C2C")
        .child(div().id("boot-bar").absolute().left(0).right(0).bottom(0).h(go ? s.height : 0).bg(C.signal)
          .transition("height", MOTION.boot.bar)));
  }
}
