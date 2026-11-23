// Endfield's drawing kit: the palette and status registries every role reads,
// plus the few shapes they share (tiles, brackets, hatch, status marks).

import { div, svg, image, PathBuilder, Background } from "gpui-kit";
import { h_flex } from "gpui-base";
import { settings, layout, shared, setShared, run, keys, home, appHome, readTextFile, fonts, checking, window as appWindow } from "herdr";
import * as fs from "fs/promises";

export const ASSETS = "mods/endfield/art";
export const FONT = { ui: "Geist", mono: "Geist Mono" };

// The bundled face is named "Endfield Wide"; Windows files it under "Endfield" (it reads
// "Wide" as a width), so ask the system which name it took, once.
let wideFamily = null;
function wideFont() {
  wideFamily ??= fonts().find((f) => /^Endfield( Wide)?$/.test(f)) ?? "Endfield Wide";
  return wideFamily;
}

// ---- palette: one table per appearance, the same names in both

const SIGNAL = {
  signal: "#FFFA00",
  signalHover: "#EFE701",
  signalPress: "#E6DE01",
  ink: "#191919",
  lime: "#BBCC2B",
  red: "#FF3F43",
  fresh: "#FF7A1A",
  stage: "#191919",
  // The status bar is an ink slab in both appearances.
  barText: "#F2F2F2",
  barMuted: "#A9A9A3",
  barSlash: "#8F8F8F",
  barRule: "#3A3A3A",
  magenta: "#FF1AAC",
  mint: "#00FFA2",
};

const PALETTE = {
  paper: {
    ground: "#EEEDEC",
    raised: "#FFFFFF",
    sunken: "#E5E5E5",
    hair: "#D9D9D9",
    hairStrong: "#BDBDBD",
    text: "#191919",
    muted: "#666666",
    dim: "#8C8C8C",
    // Inversion is selection: ink row, paper text.
    selBg: "#191919",
    selText: "#F2F2F2",
    selMuted: "#A9A9A3",
    pillBg: "#191919",
    pillText: "#F2F2F2",
    focusEdge: "#191919",
    bar: "#191919",
    barHatch: "#FFFFFF0E",
    // Hues as glyphs: one shade on the row's ground, another on an inverted row.
    flow: "#1D8FD0",
    flowInv: "#31ACF0",
    error: "#C42126",
    errorInv: "#FF5A5E",
    glow: "#00000024",
  },
  night: {
    ground: "#141414",
    raised: "#1F1F1F",
    sunken: "#0E0E0E",
    hair: "#2C2C2C",
    hairStrong: "#3D3D3D",
    text: "#EDEDED",
    muted: "#A0A0A0",
    dim: "#6E6E6E",
    selBg: "#EDEDED",
    selText: "#191919",
    selMuted: "#555555",
    pillBg: "#EDEDED",
    pillText: "#191919",
    focusEdge: "#EDEDED",
    bar: "#0A0A0A",
    barHatch: "#FFFFFF0B",
    flow: "#31ACF0",
    flowInv: "#0F6FA8",
    error: "#FF5A5E",
    errorInv: "#C42126",
    glow: "#00000080",
  },
};

const variant = () => (settings()?.dark ? "night" : "paper");
export const palette = () => ({ ...SIGNAL, ...PALETTE[variant()] });

// ---- status: every role reads a status through these two tables

const STATUS = {
  blocked: { word: "Needs input", short: "Input", kind: "pill", bar: "signal", edge: "hazard", enter: ["flicker"], rank: 4 },
  error: { word: "Error", kind: "text", glyph: "×", hue: "error", bar: "red", rank: 4 },
  done: { word: "Done", kind: "disc", glyph: "✓", bar: "lime", fresh: true, enter: ["flicker", "pop"], rank: 3 },
  working: { word: "Working", kind: "march", hue: "flow", bar: "flowInv", conveyor: true, rank: 2 },
  idle: { word: "Idle", kind: "mono", glyph: "zZ", bar: "hairStrong", quiet: true, rank: 1 },
};
export const statusOf = (s) => STATUS[s] ?? null;
export const rank = (s) => STATUS[s]?.rank ?? 0;

// Two triangles stepping through on the shared frame clock (each slot frames its own lit beat).
const BEATS = [["▶", " ", " "], [" ", "▶", " "]];
function march(color, size) {
  const slot = (beat) => div().relative().w(size * 0.8).h(size + 2).flex_none().font_family(FONT.ui).text_size(size).line_height(1)
    .child(div().absolute().top(0).left(0).opacity(0.25).text_color(color).child("▶"))
    .child(div().absolute().top(0).left(0).text_color(color).frames(beat, MOTION.march.period));
  return h_flex().flex_none().items_center().child(slot(BEATS[0])).child(slot(BEATS[1]));
}

// How each kind draws its glyph. ctx: { C, inv (on an inverted row), size }.
const GLYPH = {
  march: (st, { C, inv, size }) => march(C[inv ? `${st.hue}Inv` : st.hue], size - 2),
  // The disc pops: its size grows from 0 when an effect marks it new (needs a stable id).
  disc: (st, { C, size, id, pop }) => h_flex().w(size + 2).h(size + 2).flex_none().items_center().justify_center()
    .child(div().when(Boolean(id), (el) => el.id(id)).w(pop ? 0 : size + 2).h(pop ? 0 : size + 2)
      .transition("width", MOTION.move).transition("height", MOTION.move)
      .flex_none().rounded_full().bg(C.lime).flex().items_center().justify_center().overflow_hidden()
      .text_size(size - 3).font_weight(700).text_color(C.ink).child(st.glyph)),
  mono: (st, { C, inv, size }) => div().flex_none().font_family(FONT.mono).text_size(size - 1.5).text_color(inv ? C.selMuted : C.muted).child(st.glyph),
  text: (st, { C, inv, size }) => div().flex_none().text_size(size + 1).font_medium().text_color(C[inv ? `${st.hue}Inv` : st.hue]).child(st.glyph),
  pill: (st, { C }) => div().flex_none().h(16).px(7).flex().items_center().rounded_full().bg(C.signal).text_color(C.ink)
    .text_size(10).font_semibold().child(st.short),
};

export function glyph(C, s, { inv = false, size = 11, id = null, pop = false } = {}) {
  const st = statusOf(s);
  return st ? GLYPH[st.kind](st, { C, inv, size, id, pop }) : null;
}

/** Word plus glyph, never colour alone. The word keeps the row's text colour; only the glyph carries the hue. */
export function statusMark(C, s, { inv = false, size = 11, id = null, pop = false } = {}) {
  const st = statusOf(s);
  if (!st) return null;
  if (st.kind === "pill") {
    return div().flex_none().h(18).px(8).flex().items_center().rounded_full().bg(C.signal).text_color(C.ink)
      .text_size(10.5).font_semibold().child(st.word);
  }
  const fg = st.quiet ? (inv ? C.selMuted : C.muted) : st.kind === "text" ? C[inv ? `${st.hue}Inv` : st.hue] : inv ? C.selText : C.text;
  return h_flex().flex_none().gap(5).items_center().child(glyph(C, s, { inv, size, id, pop })).child(div().text_size(size).font_medium().text_color(fg).child(st.word));
}

/** The blocked row's hazard tick: the one thing that breathes. */
export function hazardTick(h = 34) {
  return image(`${ASSETS}/hazard.svg`).w(3).h(h).flex_none().loop("opacity", { from: 0.55, to: 1, period: MOTION.breathe.period });
}

/** Unseen done: a small rotated-square dot. */
export function freshDot(C, size = 8) {
  return svg(`${ASSETS}/diamond.svg`).size(size).flex_none().text_color(C.fresh);
}

// ---- identity: who an agent is drawn as, decided here and nowhere else.
// Fed by the local art pack's manifest (its default_assignment) and the person's overrides in
// data/endfield/operators.json (schema in README). Both are optional: without them, or with any
// avatar file missing, resolve() gives no operator and surfaces draw the program's own tile.

const MANIFEST = "art/operators/manifest.json";
const OVERRIDES = "data/endfield/operators.json";
const AVATAR = { 32: "avatar32", 64: "avatar64", 128: "avatar128", round: "avatar64round", signal: "signal" };
let cast = { text: null, programs: {}, terminals: {}, operators: {} };
let reading = null;

async function readJson(rel) {
  try {
    const text = await readTextFile(`${appHome()}/${rel}`);
    return [text ?? "", text ? JSON.parse(text) : null];
  } catch { return ["", null]; }
}

async function present(paths) {
  try { return (await Promise.all(paths.map((p) => fs.exists(`${appHome()}/${p}`)))).every(Boolean); } catch { return false; }
}

export const IDENTITY = {
  /** Rereads both files; rebuilds the table, and redraws every copy, only when their text changed. */
  refresh() {
    reading ??= (async () => {
      const [[mText, manifest], [oText, overrides]] = await Promise.all([readJson(MANIFEST), readJson(OVERRIDES)]);
      const text = JSON.stringify([mText, oText]);
      if (text !== cast.text) {
        const operators = {};
        for (const op of manifest?.operators ?? []) {
          const avatar = Object.fromEntries(Object.entries(AVATAR).map(([size, file]) => [size, op.files?.[file] ?? ""]));
          if (await present(Object.values(avatar))) operators[op.slug] = { operator: op.slug, name: op.name, accent: op.accent ?? null, avatar };
        }
        const defaults = Object.fromEntries(Object.entries(manifest?.default_assignment ?? {}).map(([k, v]) => [k, v?.operator ?? null]));
        cast = { text, operators, programs: { ...defaults, ...(overrides?.programs ?? {}) }, terminals: { ...(overrides?.terminals ?? {}) } };
        if (!checking()) setShared("endfield.identity", Date.now());
      }
      reading = null;
    })();
    return reading;
  },

  /**
   * An agent's identity: { operator, name, accent, avatar: {32, 64, 128, round, signal}, fallbackIcon }.
   * First listed wins: the terminal's override, "sub-agent" for a sub-agent, the program's, "shell".
   * A null there means "no operator": operator, accent and avatar come back null, and fallbackIcon
   * (the program) is what the surface draws.
   */
  resolve(program, terminal = null, { sub = false } = {}) {
    const slug = [cast.terminals[terminal], sub ? cast.programs["sub-agent"] : undefined, cast.programs[program?.key], cast.programs.shell]
      .find((v) => v !== undefined);
    const op = cast.operators[slug] ?? null;
    return { operator: op?.operator ?? null, name: op?.name ?? program?.name ?? "", accent: op?.accent ?? null, avatar: op?.avatar ?? null, fallbackIcon: program ?? null };
  },
};

// ---- type

export function micro(text, color, size = 10) {
  return div().font_family(FONT.mono).text_size(size).line_height(1).text_color(color).child(String(text ?? "").toUpperCase());
}

export function wide(text, color, size = 13) {
  return div().font_family(wideFont()).text_size(size).line_height(1).text_color(color).child(String(text ?? "").toUpperCase());
}

export const pad2 = (n) => String(n).padStart(2, "0");

/** A `// title`: the path prefix in the muted voice, the words in the row's. */
export function path(text, fg, slash, { size = 13, weight = 500 } = {}) {
  return h_flex().min_w(0).items_center().text_size(size).font_weight(weight)
    .child(div().flex_none().text_color(slash).child("// "))
    .child(div().min_w(0).truncate().text_color(fg).child(text));
}

// ---- shapes

export const icon = (name, size = 14) => svg(`${ASSETS}/${name}.svg`).size(size).flex_none();

const CORNER = {
  tl: (el, i) => el.top(i).left(i).border_t(1.5).border_l(1.5),
  tr: (el, i) => el.top(i).right(i).border_t(1.5).border_r(1.5),
  bl: (el, i) => el.bottom(i).left(i).border_b(1.5).border_l(1.5),
  br: (el, i) => el.bottom(i).right(i).border_b(1.5).border_r(1.5),
};

/** Corner L-brackets (absolute; the parent must be .relative()). Brackets, not boxes. */
export function brackets(color, corners = ["tl", "tr", "bl", "br"], arm = 7, inset = 3) {
  return corners.map((c) => CORNER[c](div().absolute().w(arm).h(arm).border_color(color), inset));
}

const RECT = () => PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("100%", "100%").line_to("0%", "100%").close().build();

/** Tone-on-tone 45° grain filling a relative parent: material, not pattern. */
export function hatch(color, width = 1.5, interval = 5.66) {
  return window.paint_path(RECT(), Background.pattern_slash(color, width, interval)).absolute().top(0).left(0).size_full();
}

function programGlyph(program, size, color) {
  if (!program?.icon) return div().font_family(FONT.mono).text_size(size * 0.85).font_medium().text_color(color).child((program?.name ?? "?").slice(0, 1).toUpperCase());
  return program.tint ? svg(program.icon).size(size).text_color(color) : image(program.icon).w(size).h(size);
}

/** A program as a square thing: on a raised tile, a 2px status bar along its bottom that grows to 4px while its row is hot. */
export function tile(C, program, status, { size = 26, inv = false, id = null, hot = false } = {}) {
  const st = statusOf(status);
  return div().relative().flex_none().size(size).rounded(3).border_1().border_color(inv ? C.selText : C.hair).bg(inv ? C.selText : C.raised)
    .flex().items_center().justify_center().overflow_hidden()
    .child(programGlyph(program, Math.round(size * 0.52), inv ? C.selBg : C.text))
    .child(div().when(Boolean(id), (el) => el.id(`${id}-bar`)).absolute().left(0).right(0).bottom(0).h(hot ? 4 : 2).bg(C[st?.bar ?? "hairStrong"])
      .transition("height", MOTION.colour));
}

/** The pane header's 16px program badge: the program's own tile colour, else ink. */
export function badge(C, program, size = 16) {
  return div().flex_none().size(size).rounded(3).bg(program?.tile ?? C.selBg).flex().items_center().justify_center()
    .child(programGlyph(program, Math.round(size * 0.62), program?.color ?? C.selText));
}

// ---- layout facts the roles share

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The rail goes by the sidebar's width, as the shipped mods do: dragging its edge narrows it too.
export const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

export function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 248) : appWindow()?.platform === "macos" ? 76 : 44 });
}

// A window_drag block: every control stops the press, or it drags the window.
export const stop = (_e, cx) => cx.stop_propagation();

// ---- text the shipped mods agree on

// Drops a status glyph or spinner and Codex's "[ ! ] " mark before an agent's title.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

/** An agent's live title when it says more than its program, address or a path; else null. */
export function telling(lead) {
  const prog = lead?.program?.name;
  const live = clean(lead?.title);
  const isPath = /^[~/]|^[A-Za-z]:\\/.test((lead?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const plain = live && live !== (lead?.terminal ?? lead?.address) && live !== prog && !isPath && !live.includes("@") && live.toLowerCase() !== lead?.program?.key;
  return plain ? live : null;
}

export function basename(p) {
  if (!p) return "";
  if (p === home()) return "~";
  return p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;
}

export function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/** The key bound to an action, as the person types it ("Ctrl+Shift+P"), or null. */
export function binding(action) {
  const mac = appWindow()?.platform === "macos";
  const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
  const b = keys().find((k) => k.section === "global" && k.action === action);
  if (!b) return null;
  const parts = b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b.keys.split("-");
  return parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
}

/** Every role's root: the UI face and the variant's text colour. */
export function root(C, el) {
  return el.font_family(FONT.ui).text_size(13).text_color(C.text);
}

// ---- motion: every timing lives in MOTION; surfaces name a row, never a number.
// Rows are native policies (TransitionPolicy or LoopPolicy fields), passed as they are.
// The trailer rows were measured off the official trailers (research/game-ui-2.md, section 4).

export const MOTION = {
  colour: { duration: 200, easing: "ease-out" }, // hover fills, wipes, nudges, fades
  move: { duration: 300, easing: "ease-out" }, // selection blocks, odometers, trays, the pane's yellow tab
  fade: { duration: 200 }, // the default curve: growing discs, the pane bracket and tray fading
  flicker: { period: 200, easing: "linear", count: 3 }, // a CRT powering on: three opacity pulses
  breathe: { period: 1400 }, // the blocked row's hazard tick, the one thing that breathes
  march: { period: 300 }, // the working triangles stepping (.frames)
  conveyor: { period: 3200, easing: "linear" }, // the working row's floor segment
  stagger: { delay: 40 }, // a control after the one before it (pane tray buttons)
  rise: { delay: 80 }, // the brand mark's bars, one after another
  segment: { delay: 18 }, // the card's context blocks lighting up in turn
  settle: { delay: 30 }, // one frame drawn at rest before an entrance transition starts
  stage: { delay: 200 }, // regions entering after the boot, in turn
  cardOpen: { delay: 250 }, // hover rests this long on an agent row before its card opens
  cardClose: { delay: 160 }, // grace after leaving both row and card
  boot: { duration: 1500 }, // the whole start-up screen
  bootGauge: { duration: 650, delay: 100, easing: "ease-out" },
  bootWipe: { duration: 500, delay: 750, easing: "ease-in" }, // slow start, slam finish
  bootFade: { duration: 300, easing: "ease-in" },
  tri: { duration: 400, delay: 400, easing: "ease-out" }, // the brand's tri-colour bar wiping in
  // Trailer pattern 1: per-glyph type-on (release PV end card, about 45 ms a glyph, stepped).
  typeOn: { period: 45 },
  // Trailer pattern 5: a yellow block grows over a caption, holds, retracts to a bar, revealing it.
  revealGrow: { duration: 330, easing: "ease-out" },
  revealHold: { delay: 300 },
  revealRetract: { duration: 350, easing: "ease-in" },
  // Trailer pattern 14: a silhouette flash, up and gone in one beat.
  flash: { duration: 150 },
};
const FLICKER_MS = MOTION.flicker.period * MOTION.flicker.count;

/** Three opacity pulses (a CRT powering on); a one-shot timer removes the loop afterwards. */
export function flicker(el, on) {
  return on ? el.loop("opacity", { from: 0, to: 1, period: MOTION.flicker.period, easing: MOTION.flicker.easing }) : el;
}

/**
 * A region's entrance: hidden until its slot after the boot, then flickers in.
 * stage: 0 brand, 1 spaces/tabs, 2 agents/panes, 3 status (200ms apart).
 * Copies made later (a new pane) flicker in at once.
 */
export class Entrance {
  constructor(stage) {
    this.stage = stage;
    this.state = "hidden";
  }

  start(cx) {
    if (checking()) { this.state = "done"; return; }
    // The brand writes the boot time in its own init; give every copy's init a moment to land.
    cx.timer.after(2 * MOTION.settle.delay, (cx) => {
      const boot = Number(shared("endfield.boot")) || 0;
      const now = Date.now();
      const at = now - boot < 4000 ? boot + MOTION.boot.duration + this.stage * MOTION.stage.delay : now;
      cx.timer.after(Math.max(0, at - now), (cx) => {
        this.state = "flicker";
        cx.notify();
        cx.timer.after(FLICKER_MS, (cx) => { this.state = "done"; cx.notify(); });
      });
    });
  }

  get shown() { return this.state !== "hidden"; }

  apply(el) {
    return this.state === "hidden" ? el.opacity(0) : flicker(el, this.state === "flicker");
  }
}

/**
 * One-shot effects on status transitions: keeps each key's previous status and,
 * when one enters a state whose table entry has `enter`, runs those effects once.
 */
export class StatusFx {
  constructor() {
    this.prev = new Map();
    this.live = new Map();
  }

  track(key, status, cx) {
    const was = this.prev.get(key);
    this.prev.set(key, status);
    if (was === undefined || was === status) return;
    const enter = statusOf(status)?.enter;
    if (!enter) { this.live.delete(key); return; }
    const fx = { flicker: enter.includes("flicker"), pop: enter.includes("pop") };
    this.live.set(key, fx);
    // The disc renders once at size 0, then grows on the next frame.
    if (fx.pop) cx.timer.after(MOTION.settle.delay, (cx) => { fx.pop = false; cx.notify(); });
    cx.timer.after(FLICKER_MS, (cx) => {
      if (this.live.get(key) === fx) this.live.delete(key);
      cx.notify();
    });
  }

  of(key) { return this.live.get(key) ?? { flicker: false, pop: false }; }
}

/** A full-height layer that wipes in from the left: hover, selection, the active tab. */
export function wipe(id, color, width, on) {
  return div().id(id).absolute().left(0).top(0).bottom(0).w(on ? width : 0).bg(color)
    .transition("width", MOTION.colour);
}

/**
 * The one selection block of a list: it slides (top) to the selected row instead of each row
 * filling itself. First child of the list, so it paints under the rows; `edge` adds the 2px yellow edge.
 */
export function slide(id, C, top, height, { edge = false } = {}) {
  return div().id(id).absolute().left(0).right(0).top(top).h(height).bg(C.selBg)
    .transition("top", MOTION.move).transition("height", MOTION.move)
    .when(edge, (el) => el.child(div().absolute().left(0).top(0).bottom(0).w(2).bg(C.signal)));
}

/** A row's label column slides right by `px` while the row is hot. */
export function nudge(el, id, on, px = 4) {
  return el.id(id).relative().left(on ? px : 0).transition("left", MOTION.colour);
}

/** A number as odometer wheels: each digit a column of 0-9 that rolls to its place. */
export function odometer(id, n, color, size = 13, digits = 2) {
  const line = Math.round(size * 1.25);
  const text = String(Math.min(n, 10 ** digits - 1)).padStart(digits, "0");
  return h_flex().flex_none().children([...text].map((d, i) => div().relative().w(size * 0.78).h(line).overflow_hidden()
    .child(div().id(`${id}-${i}`).absolute().left(0).top(-Number(d) * line).flex().flex_col()
      .transition("top", MOTION.move)
      .children([..."0123456789"].map((k) => div().h(line).flex().items_center().font_family(wideFont()).text_size(size).line_height(1).text_color(color).child(k))))));
}

/** A disc that grows from the centre of a w×h control while it's hot (the red behind a close ×). */
export function growDisc(id, w, h, d, on, color) {
  const size = on ? d : 0;
  return div().id(id).absolute().left((w - size) / 2).top((h - size) / 2).w(size).h(size).rounded_full().bg(color)
    .transition("width", MOTION.fade).transition("height", MOTION.fade)
    .transition("left", MOTION.fade).transition("top", MOTION.fade);
}

/** Topographic lines, tinted (6% in the art): the boot's ground, and empty states. */
export function contour(w, h, color) {
  return svg(`${ASSETS}/contour.svg`).absolute().left(0).top(0).w(w).h(h).text_color(color);
}
