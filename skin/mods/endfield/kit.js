// Endfield's drawing kit: the palette and status registries every role reads,
// plus the few shapes they share (chips, pills, hatch, status marks, the geometric layer).

import { div, svg, image, PathBuilder, Background } from "gpui-kit";
import { h_flex } from "gpui-base";
import { settings, layout, shared, setShared, run, keys, home, appHome, readTextFile, fonts, checking, playSound, window as appWindow } from "herdr";
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
    // The geometric layer: rings, crosses, tick rulers, dot fields, the blueprint grid.
    geo: "#1919192E",
    cross: "#8F8F8F",
    tick: "#A9A9A9",
    dot: "#19191929",
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
    geo: "#FFFFFF29",
    cross: "#5A5A5A",
    tick: "#4A4A4A",
    dot: "#FFFFFF1F",
  },
};

const variant = () => (settings()?.dark ? "night" : "paper");
export const palette = () => ({ ...SIGNAL, ...PALETTE[variant()] });

// ---- status: every role reads a status through these two tables

const STATUS = {
  blocked: { word: "Needs input", kind: "pill", bar: "signal", edge: "hazard", rank: 4 },
  error: { word: "Error", kind: "text", glyph: "×", hue: "error", bar: "red", rank: 4 },
  done: { word: "Claimed", kind: "disc", glyph: "✓", bar: "lime", fresh: true, enter: ["flash", "pop"], rank: 3 },
  working: { word: "Generating", kind: "march", hue: "flow", bar: "flowInv", conveyor: true, rank: 2 },
  idle: { word: "Idle", kind: "mono", glyph: "zZ", bar: "hairStrong", quiet: true, rank: 1 },
};
export const statusOf = (s) => STATUS[s] ?? null;
export const rank = (s) => STATUS[s]?.rank ?? 0;

// Two triangles stepping through on the shared frame clock (each slot frames its own lit beat).
// still: the same two triangles unlit, for a place that names the state while nothing is in it.
const BEATS = [["▶", " ", " "], [" ", "▶", " "]];
function march(color, size, still) {
  const slot = (beat) => div().relative().w(size * 0.8).h(size + 2).flex_none().font_family(FONT.ui).text_size(size).line_height(1)
    .child(div().absolute().top(0).left(0).opacity(0.25).text_color(color).child("▶"))
    .when(!still, (el) => el.child(div().absolute().top(0).left(0).text_color(color).frames(beat, MOTION.status.march.period)));
  return h_flex().flex_none().items_center().child(slot(BEATS[0])).child(slot(BEATS[1]));
}

// How each kind draws its glyph. ctx: { C, inv (on an inverted row), size }.
const GLYPH = {
  march: (st, { C, inv, size, still }) => march(C[inv ? `${st.hue}Inv` : st.hue], size - 2, still),
  // The disc pops: its size grows from 0 when an effect marks it new (needs a stable id).
  disc: (st, { C, size, id, pop }) => h_flex().w(size + 2).h(size + 2).flex_none().items_center().justify_center()
    .child(div().when(Boolean(id), (el) => el.id(id)).w(pop ? 0 : size + 2).h(pop ? 0 : size + 2)
      .transition("width", MOTION.done.check).transition("height", MOTION.done.check)
      .flex_none().rounded_full().bg(C.lime).flex().items_center().justify_center().overflow_hidden()
      .text_size(size - 3).font_weight(700).text_color(C.ink).child(st.glyph)),
  mono: (st, { C, inv, size }) => div().flex_none().font_family(FONT.mono).text_size(size - 1.5).text_color(inv ? C.selMuted : C.muted).child(st.glyph),
  text: (st, { C, inv, size }) => div().flex_none().text_size(size + 1).font_medium().text_color(C[inv ? `${st.hue}Inv` : st.hue]).child(st.glyph),
  pill: (st, { C, size }) => div().flex_none().w(size + 5).h(size).flex().items_center().justify_center().bg(C.signal).text_color(C.ink)
    .text_size(size - 2).font_weight(700).child("!"),
};

export function glyph(C, s, { inv = false, size = 11, id = null, pop = false, still = false } = {}) {
  const st = statusOf(s);
  return st ? GLYPH[st.kind](st, { C, inv, size, id, pop, still }) : null;
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

/** Hazard stripes (yellow on ink, 45°): a blocked row's edge, the Needs-input strip, the pulse rule. Still: blocked waits. */
export function hazard(C, w, h) {
  return div().relative().w(w).h(h).flex_none().overflow_hidden().bg(C.ink).child(hatch(C.signal, 3, 6));
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
const PREFS = "data/endfield/settings.json";
// The person's skin settings (data/endfield/settings.json, schema in README).
let prefs = { sounds: { alerts: true, ticks: false } };
const AVATAR = { 32: "avatar32", 64: "avatar64", 128: "avatar128", round: "avatar64round", bust: "bust480", signal: "signal" };
// The class badge on a chip: the program, in one or two letters.
const BADGE = { claude: "C", codex: "X", cursor: "Cu", opencode: "O", gemini: "G" };
let cast = { text: null, programs: {}, terminals: {}, operators: {}, spares: [] };
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
      const [[mText, manifest], [oText, overrides], [, own]] = await Promise.all([readJson(MANIFEST), readJson(OVERRIDES), readJson(PREFS)]);
      prefs = { sounds: { ...prefs.sounds, ...(own?.sounds ?? {}) } };
      const text = JSON.stringify([mText, oText]);
      if (text !== cast.text) {
        const operators = {};
        for (const op of manifest?.operators ?? []) {
          const avatar = Object.fromEntries(Object.entries(AVATAR).map(([size, file]) => [size, op.files?.[file] ?? ""]));
          if (await present(Object.values(avatar))) operators[op.slug] = { operator: op.slug, name: op.name, accent: op.accent ?? null, avatar };
        }
        const defaults = Object.fromEntries(Object.entries(manifest?.default_assignment ?? {}).map(([k, v]) => [k, v?.operator ?? null]));
        const spares = (overrides?.spares ?? manifest?.unassigned ?? []).filter((slug) => operators[slug]);
        cast = { text, operators, spares, programs: { ...defaults, ...(overrides?.programs ?? {}) }, terminals: { ...(overrides?.terminals ?? {}) } };
        if (!checking()) setShared("endfield.identity", Date.now());
      }
      reading = null;
    })();
    return reading;
  },

  /**
   * An agent's identity: { operator, name, accent, avatar: {32, 64, 128, round, bust, signal}, badge,
   * fallbackIcon, pinned }. First listed wins: the terminal's override, "sub-agent" for a child of the
   * same program (a cross-vendor child keeps its own program's operator), the program's, "shell".
   * A null there means "no operator": operator, accent and avatar come back null, and fallbackIcon
   * (the program) is what the surface draws. `pinned` says the terminal override chose it.
   */
  resolve(program, terminal = null, { parent = null } = {}) {
    const pinned = cast.terminals[terminal];
    const slug = [pinned, parent && parent.key === program?.key ? cast.programs["sub-agent"] : undefined, cast.programs[program?.key], cast.programs.shell]
      .find((v) => v !== undefined);
    return this.as(slug, program, pinned !== undefined);
  },

  /** The identity of a given operator slug (null: none), drawn for `program`. */
  as(slug, program, pinned = false) {
    const op = cast.operators[slug] ?? null;
    const badge = BADGE[program?.key] ?? (program?.name ?? "?").slice(0, 1).toUpperCase();
    return { operator: op?.operator ?? null, name: op?.name ?? program?.name ?? "", accent: op?.accent ?? null, avatar: op?.avatar ?? null, badge, fallbackIcon: program ?? null, pinned };
  },

  /** Operators held back for repeats (data/endfield/operators.json "spares", else the manifest's unassigned). */
  spares() { return cast.spares; },
};

// ---- sound: original cues, synthesised by tools/make_sounds.py.
// The two alerts play only when Herdr's own attention sounds are off, so one event never sounds
// twice; to hear these with Herdr's on, point settings.json sounds.done / sounds.blocked at them.

const SOUND = {
  needs: { file: "mods/endfield/sounds/needs-input.mp3", alert: true },
  claimed: { file: "mods/endfield/sounds/claimed.mp3", alert: true },
  tick: { file: "mods/endfield/sounds/tick.mp3", alert: false },
};

export function cue(name) {
  const s = SOUND[name];
  if (!s || checking()) return;
  if (s.alert ? !prefs.sounds.alerts || settings()?.sounds?.enabled !== false : !prefs.sounds.ticks) return;
  playSound(s.file);
}

// ---- type

export function micro(text, color, size = 10) {
  return div().font_family(FONT.mono).text_size(size).line_height(1).text_color(color).child(String(text ?? "").toUpperCase());
}

// The wide face draws "~" as a flat wave at hyphen height, which reads as "-" at UI sizes (a home
// space is named "~"), so a tilde is set in the mono face, as its own run.
export function wide(text, color, size = 13) {
  const s = String(text ?? "").toUpperCase();
  const el = div().font_family(wideFont()).text_size(size).line_height(1).text_color(color);
  if (!s.includes("~")) return el.child(s);
  return el.flex().items_center().children(s.split(/(~)/).filter(Boolean).map((part) => (part === "~"
    ? div().flex_none().font_family(FONT.mono).text_size(size * 1.15).child("~")
    : div().flex_shrink(1).min_w(0).truncate().child(part))));
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

const RECT = () => PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("100%", "100%").line_to("0%", "100%").close().build();

/** Tone-on-tone 45° grain filling a relative parent: material, not pattern. */
export function hatch(color, width = 1.5, interval = 5.66) {
  return window.paint_path(RECT(), Background.pattern_slash(color, width, interval)).absolute().top(0).left(0).size_full();
}

function programGlyph(program, size, color) {
  if (!program?.icon) return div().font_family(FONT.mono).text_size(size * 0.85).font_medium().text_color(color).child((program?.name ?? "?").slice(0, 1).toUpperCase());
  return program.tint ? svg(program.icon).size(size).text_color(color) : image(program.icon).w(size).h(size);
}

/**
 * An agent as a game party chip: a round portrait in a ring (white; yellow when it needs input), a
 * 1px halo in the operator's accent (the selection's ink when selected), and the class badge bottom
 * right. Without art the circle holds the program's own tile, so a missing pack never moves a row.
 * flash: the Claimed beat, a yellow disc drawn at .9 that fades (lit is its first frame).
 */
export function chip(C, ident, status, { size = 36, on = false, id = null, flash = null, ground = null } = {}) {
  const ring = status === "blocked" ? C.signal : "#FFFFFF";
  const ringW = size >= 30 ? 2 : 1.5;
  const inner = size - 2;
  const face = inner - 2 * ringW;
  const program = ident.fallbackIcon;
  const fill = ident.avatar ? ident.accent ?? C.hairStrong : program?.tile ?? C.selBg;
  const badge = Math.round(size * (size >= 30 ? 0.42 : 0.5));
  return div().relative().size(size).flex_none()
    .child(div().absolute().left(0).top(0).size(size).rounded_full().bg(on ? C.selBg : ident.accent ?? C.hairStrong))
    .child(div().absolute().left(1).top(1).size(inner).rounded_full().bg(ring))
    .child(div().absolute().left(1 + ringW).top(1 + ringW).size(face).rounded_full().bg(fill).overflow_hidden().flex().items_center().justify_center()
      .child(ident.avatar ? image(ident.avatar.round).size(face) : programGlyph(program, Math.round(face * 0.55), program?.color ?? C.selText)))
    .when(Boolean(flash) && Boolean(id), (el) => el.child(div().id(`${id}-flash`).absolute().left(0).top(0).size(size).rounded_full().bg(C.signal)
      .opacity(flash.lit ? 0.9 : 0).transition("opacity", MOTION.done.flash)))
    .when(Boolean(ident.badge), (el) => el.child(div().absolute().right(-3).bottom(-3).size(badge).rounded_full().bg(C.ink).border(1.5).border_color(ground ?? (on ? C.selBg : C.ground))
      .flex().items_center().justify_center().font_family(FONT.mono).text_size(Math.max(5.5, badge * 0.48)).text_color("#F2F2F2").child(ident.badge)));
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
// Rows are native policies (TransitionPolicy or LoopPolicy fields), passed as they are. Names follow
// the motion board's table (select.edge, cut.grow, ...). No colour ever transitions: plates snap and
// a marker, a size or an opacity carries the motion.

const ease = (duration, easing = "ease-out", delay) => (delay ? { duration, easing, delay } : { duration, easing });
export const MOTION = {
  settle: { delay: 30 }, // one frame drawn at rest before a one-shot transition starts
  select: { edge: ease(300) }, // the yellow marker travelling to the selected row, tab or space
  row: { wipe: ease(200), nudge: ease(200) },
  card: { reveal: ease(200, "ease-out", 250), slide: ease(300), open: { delay: 250 }, close: { delay: 160 }, segment: { delay: 18 } },
  pane: { bar: ease(300), brackets: ease(300), fade: ease(200), actions: { delay: 40 }, pulse: { from: 0, to: 0.42, period: 1400, easing: "ease-in-out" } },
  status: { march: { period: 300 }, scan: { period: 1600, easing: "linear" } },
  done: { flash: ease(300), check: ease(200), clear: { delay: 300 } },
  toast: { enter: ease(300), fade: ease(200), countdown: { duration: 6000, easing: "linear" } },
  // The skill caption (trailer pattern 5): block grows, holds, retracts to its edge, revealing text.
  cut: { portrait: ease(100, "linear", 83), late: ease(100, "linear", 166), grow: ease(330), retract: ease(350, "ease-in", 630), text: ease(100, "linear", 630) },
  count: { roll: ease(300), needs: ease(300) },
  squad: { fold: ease(300), stack: ease(120, "linear", 180) },
  pin: { content: ease(100, "linear", 83) },
  dispatch: { enter: ease(200) },
  link: { draw: ease(240), land: ease(120, "linear", 240) },
  comms: { enter: ease(200) },
  boot: { total: 1500, bar: ease(650, "ease-out", 100), type: ease(1, "linear", 200), glyph: { delay: 50 }, rule: ease(150, "ease-in", 760), sub: ease(100, "linear", 760), exit: ease(225, "linear", 1275) },
  // Placeholder-first build: regions draw their plates, then their content fades in, 100ms apart.
  build: { in: ease(120, "linear"), stagger: { delay: 100 } },
  brand: { rise: { delay: 80 }, tri: ease(400, "ease-out", 400) },
};

/**
 * A region's build-in: drawn at opacity 0 until its slot after the boot, then fades in.
 * stage: 0 brand, 1 spaces/tabs, 2 squads/panes, 3 status (build.stagger apart).
 * Copies made later (a new pane) fade in at once.
 */
export class Entrance {
  constructor(stage) {
    this.stage = stage;
    this.shown = false;
  }

  start(cx) {
    if (checking()) { this.shown = true; return; }
    // The brand writes the boot time in its own init; give every copy's init a moment to land.
    cx.timer.after(2 * MOTION.settle.delay, (cx) => {
      const boot = Number(shared("endfield.boot")) || 0;
      const now = Date.now();
      const at = now - boot < 4000 ? boot + MOTION.boot.total + this.stage * MOTION.build.stagger.delay : now;
      cx.timer.after(Math.max(MOTION.settle.delay, at - now), (cx) => { this.shown = true; cx.notify(); });
    });
  }

  apply(el) {
    return div().id(`build-${this.stage}`).size_full().opacity(this.shown ? 1 : 0).transition("opacity", MOTION.build.in).child(el);
  }
}

/**
 * One-shot effects on status transitions: keeps each key's previous status and, when one enters a
 * state whose table entry has `enter`, runs those once. A Claimed agent's chip flashes yellow (drawn
 * at .9, then fades) while its check grows from 0.
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
    const fx = { flash: enter.includes("flash"), pop: enter.includes("pop"), lit: true };
    this.live.set(key, fx);
    cx.timer.after(MOTION.settle.delay, (cx) => { fx.pop = false; fx.lit = false; cx.notify(); });
    cx.timer.after(MOTION.settle.delay + MOTION.done.clear.delay, (cx) => {
      if (this.live.get(key) === fx) this.live.delete(key);
      cx.notify();
    });
  }

  of(key) { return this.live.get(key) ?? { flash: false, pop: false, lit: false }; }
}

/** A full-height layer that wipes in from the left: the hover fill of a row. */
export function wipe(id, color, width, on) {
  return div().id(id).absolute().left(0).top(0).bottom(0).w(on ? width : 0).bg(color)
    .transition("width", MOTION.row.wipe);
}

/**
 * A list's selection, in two parts. The plate (first child, under the rows) snaps to the selected
 * row with no transition: text colours swap in one frame, so a sliding ink plate would show paper
 * text on paper. The marker (last child, over the rows) is the 2px yellow edge that travels.
 */
export function plate(C, top, height) {
  return div().absolute().left(0).right(0).top(top).h(height).bg(C.selBg);
}

export function marker(id, C, top, height) {
  return div().id(id).absolute().left(0).top(top).w(2).h(height).bg(C.signal)
    .transition("top", MOTION.select.edge).transition("height", MOTION.select.edge);
}

/** A row's label column slides right by `px` while the row is hot. */
export function nudge(el, id, on, px = 4) {
  return el.id(id).relative().left(on ? px : 0).transition("left", MOTION.row.nudge);
}

/** A number as odometer wheels: each digit a column of 0-9 that rolls to its place. */
export function odometer(id, n, color, size = 13, digits = 2) {
  const line = Math.round(size * 1.25);
  const text = String(Math.min(n, 10 ** digits - 1)).padStart(digits, "0");
  return h_flex().flex_none().children([...text].map((d, i) => div().relative().w(size * 0.78).h(line).overflow_hidden()
    .child(div().id(`${id}-${i}`).absolute().left(0).top(-Number(d) * line).flex().flex_col()
      .transition("top", MOTION.count.roll)
      .children([..."0123456789"].map((k) => div().h(line).flex().items_center().font_family(wideFont()).text_size(size).line_height(1).text_color(color).child(k))))));
}

/** A disc that grows from the centre of a w×h control while it's hot (the red behind a close ×). */
export function growDisc(id, w, h, d, on, color) {
  const size = on ? d : 0;
  return div().id(id).absolute().left((w - size) / 2).top((h - size) / 2).w(size).h(size).rounded_full().bg(color)
    .transition("width", MOTION.done.check).transition("height", MOTION.done.check)
    .transition("left", MOTION.done.check).transition("top", MOTION.done.check);
}

// ---- pills: actions are full-radius pills with a round knob at their right end that nudges 3px
// on hover. primary: yellow (the one action that matters here); paper: raised with a grey left
// edge; ink: an ink pill; ghost: an outline with no knob. The caller owns the hover state.
const PILL = {
  primary: (C) => ({ bg: C.signal, fg: C.ink, knobBg: C.ink, knobFg: C.signal }),
  paper: (C) => ({ bg: C.raised, fg: C.text, knobBg: C.selBg, knobFg: C.selText, edge: C.hairStrong }),
  ink: (C) => ({ bg: C.pillBg, fg: C.pillText, knobBg: C.pillText, knobFg: C.pillBg }),
  dark: (C) => ({ bg: "#FFFFFF", fg: C.ink, knobBg: C.ink, knobFg: "#F2F2F2", edge: "#BDBDBD" }),
};

/** A game pill. opts: { kind, knob (glyph, or null for a ghost), hot, on_hover, action, h, tip, extra } */
export function pill(C, id, label, { kind = "paper", knob = "▶", hot = false, on_hover = null, action = null, h = 26, tip = null, extra = null } = {}) {
  const k = kind === "ghost" ? null : PILL[kind](C);
  return h_flex().id(id).h(h).flex_none().items_center().rounded_full().gap(8).cursor_pointer()
    .pl(12).pr(k && knob ? 3 : 12)
    .when(Boolean(k), (el) => el.bg(k.bg).text_color(k.fg))
    .when(Boolean(k?.edge), (el) => el.border_l(2).border_color(k.edge))
    .when(!k, (el) => el.border_1().border_color(C.hairStrong).text_color(C.text).hover((s) => s.bg(C.raised)))
    .when(Boolean(tip), (el) => el.tooltip(tip))
    .when(Boolean(on_hover), (el) => el.on_hover(on_hover))
    .on_mouse_down("left", stop)
    .when(Boolean(action), (el) => el.on_click(action))
    .child(div().text_size(12).font_semibold().child(label))
    .when(Boolean(extra), (el) => el.child(extra))
    .when(Boolean(k && knob), (el) => el.child(div().id(`${id}-knob`).relative().left(hot ? 3 : 0).transition("left", MOTION.row.nudge)
      .size(h - 6).rounded_full().bg(k.knobBg).text_color(k.knobFg).flex().items_center().justify_center()
      .text_size(knob === "+" ? 11 : 8).child(knob)));
}

// ---- the geometric layer: generated SVGs, tinted, drawn large and clipped by their parent.

/** A field of dots (6px pitch) filling a relative, overflow-hidden parent. */
export const dots = (color) => svg(`${ASSETS}/dots.svg`).absolute().left(0).top(0).w(1440).h(960).text_color(color);

/** A catalogue barcode beside a title: texture, never content. */
export const barcode = (color, w = 30) => div().w(w).h(8).flex_none().overflow_hidden().child(svg(`${ASSETS}/barcode.svg`).w(36).h(8).text_color(color));

/** A 9px registration cross. */
export const cross = (color) => svg(`${ASSETS}/cross.svg`).size(9).flex_none().text_color(color);

/** A tick ruler, major every 20px, minor every 4px. */
export const ticks = (color, w) => div().w(w).h(6).flex_none().overflow_hidden().child(svg(`${ASSETS}/ticks.svg`).w(400).h(6).text_color(color));

/** Range rings framing empty space: a dotted ring, a solid ring, four ticks. */
export const rings = (color, d = 300) => svg(`${ASSETS}/rings.svg`).size(d).flex_none().text_color(color);

/** The skill caption's diagonal band: a yellow parallelogram at its final angle (no element rotation). */
export function band(color, h = 240) {
  const path = PathBuilder.fill().add_polygon([[104, 0], [126, 0], [126 - (112 * h) / 240, h], [104 - (112 * h) / 240, h]], true).build();
  return window.paint_path(path, color).absolute().left(0).top(0).w(140).h(h);
}

