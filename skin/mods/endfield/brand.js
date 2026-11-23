// brand: the sidebar's top (window drag); it also starts the boot when the layout starts.
// footer: the sidebar's bottom entry points. boot: the start-up screen, an overlay.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, updates, setShared, openOverlay, closeOverlay, props, checking, window as appWindow } from "herdr";
import { palette, root, narrow, toggleSidebar, stop, icon, micro, wide, glyph, freshDot, binding, contour, growDisc, Entrance, MOTION } from "./kit.js";

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
      .child(div().flex_1())
      .child(div().id("ef-palette").cursor_pointer().tooltip("Commands").on_click(() => run("app.palette"))
        .child(micro(key ?? "Palette", C.muted)))));
  }
}

// The boot: ink over faint contour lines, a 10px yellow gauge filling up the left edge,
// a yellow wipe across, then a fade. Click skips it.
export class Boot {
  init() {
    this.size = null;
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
    return h_flex().id("boot").relative().size_full().bg("#141414").items_center().justify_center().overflow_hidden().cursor_pointer()
      .on_size_change((size, cx) => {
        if (this.size) return;
        this.size = size;
        cx.notify();
        cx.timer.after(MOTION.boot.total + MOTION.settle.delay, () => this.close());
      })
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.close(); })
      .opacity(go ? 0 : 1)
      .transition("opacity", MOTION.boot.exit)
      .when(go, (el) => el.child(contour(s.width, s.height, "#FFFFFF")))
      .child(v_flex().gap(18).items_center()
        .child(wide("Herdr", "#F2F2F2", 22))
        .child(h_flex().gap(6).items_center()
          .child(micro("// Field ops · establishing link", "#A9A9A3"))
          .child(glyph({ ...C, flow: C.signal }, "working", { size: 10 }))))
      .child(div().absolute().left(0).top(0).bottom(0).w(10).bg("#2C2C2C")
        .child(div().id("boot-gauge").absolute().left(0).right(0).bottom(0).h(go ? s.height : 0).bg(C.signal)
          .transition("height", MOTION.boot.bar)))
      // The wipe: slow start, slam finish (ease-in is the nearest native curve to the site's cubic-bezier(1,0,.7,1)).
      .child(div().id("boot-wipe").absolute().left(0).top(0).bottom(0).w(go ? s.width : 0).bg(C.signal)
        .transition("width", MOTION.boot.rule));
  }
}
