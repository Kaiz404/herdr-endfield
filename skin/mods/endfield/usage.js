// usage: the account's Claude usage limits for the HUD footer, with no Herdr in it
// (tests/usage.test.mjs runs it in node). The statusline sidecar carries Claude Code's
// rate_limits: {five_hour, seven_day: {used_percentage, resets_at (epoch seconds)}}.

const WINDOWS = [
  { key: "five_hour", label: "5-hour", long: "5-hour" },
  { key: "seven_day", label: "Weekly", long: "weekly" },
];
// From this percent a window reads as urgent, as the statusline's own yellow does.
export const HOT_PCT = 80;
// The time to reset counts down in minutes, so the footer repaints once a minute while it shows.
export const USAGE_TICK_MS = 60000;

/** Seconds to "2d 5h", "1h 09m", "42m" or "<1m". */
export function untilReset(s) {
  const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d) return `${d}d ${h % 24}h`;
  if (h) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return m ? `${m}m` : "<1m";
}

/**
 * rate_limits -> [{label, pct, left, hot, reset, gauge}] in WINDOWS order, or null when there is
 * nothing to show. A window whose resets_at has passed has reset since it was written: its numbers
 * are old, so it shows as reset (pct, left and gauge null) rather than as current.
 * gauge is kit gauge()'s {lit, hot, tip}, lit out of `segments`.
 */
export function usage(limits, nowMs, segments) {
  const out = [];
  for (const { key, label, long } of WINDOWS) {
    const w = limits?.[key];
    if (typeof w?.used_percentage !== "number") continue;
    const at = typeof w.resets_at === "number" ? w.resets_at : null;
    if (at != null && at * 1000 <= nowMs) { out.push({ label, pct: null, left: null, hot: false, reset: true, gauge: null }); continue; }
    const pct = Math.round(w.used_percentage);
    const hot = pct >= HOT_PCT;
    const lit = Math.round(Math.min(100, Math.max(0, pct)) / 100 * segments);
    out.push({ label, pct, left: at == null ? null : untilReset(at - nowMs / 1000), hot, reset: false, gauge: { lit, hot, tip: `${pct}% of the ${long} limit used` } });
  }
  return out.length ? out : null;
}

// Narrowest last: the footer drops the bars first, then shortens "resets in" to "↻".
export const TIERS = [
  { bars: true, words: true },
  { bars: false, words: true },
  { bars: false, words: false },
];

/** A window's text after its percent: "used · resets in 1h 09m", "used · ↻ 1h 09m", "used" or "reset". */
export function tail(w, tier) {
  if (w.reset) return "reset";
  if (!w.left) return "used";
  return `used · ${tier.words ? "resets in " : "↻ "}${w.left}`;
}

// Estimated pixel widths of the footer's pieces: 10px Geist Mono runs 6px a character, the 13px
// semibold percent about 8, and m.gaugeW is kit GAUGE's 8 blocks with their gaps.
const MONO = 6, PCT = 8, GAP = 5, HOT = 7;
// Between two windows: wide enough that each reads as its own.
export const BETWEEN = 24;

/** How wide the windows draw in a tier; m: {gaugeW}. */
export function usageWidth(windows, tier, m) {
  const one = (w) => (w.hot ? HOT + GAP : 0) + w.label.length * MONO + GAP
    + (tier.bars && w.gauge ? m.gaugeW + GAP : 0)
    + (w.reset ? 0 : `${w.pct}%`.length * PCT + GAP)
    + tail(w, tier).length * MONO;
  return windows.reduce((sum, w) => sum + one(w), 0) + BETWEEN * (windows.length - 1);
}

/** The widest tier whose windows fit in `slotW` pixels; the narrowest when none does. */
export function fit(windows, slotW, m) {
  return TIERS.find((t) => usageWidth(windows, t, m) <= slotW) ?? TIERS[TIERS.length - 1];
}
