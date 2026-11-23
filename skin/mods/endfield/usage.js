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

/** Seconds to "2d 5h", "5h 00m", "42m" or "<1m". */
export function untilReset(s) {
  const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d) return `${d}d ${h % 24}h`;
  if (h) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return m ? `${m}m` : "<1m";
}

/**
 * rate_limits -> [{label, pct, left, hot, reset, gauge}] in WINDOWS order, or null when there is
 * nothing to show. A window whose resets_at has passed has reset since it was written: its numbers
 * are old, so it shows as reset (pct and left null, gauge empty) rather than as current.
 * gauge is kit gauge()'s {lit, hot, tip}, lit out of `segments`.
 */
export function usage(limits, nowMs, segments) {
  const out = [];
  for (const { key, label, long } of WINDOWS) {
    const w = limits?.[key];
    if (typeof w?.used_percentage !== "number") continue;
    const at = typeof w.resets_at === "number" ? w.resets_at : null;
    if (at != null && at * 1000 <= nowMs) {
      out.push({ label, pct: null, left: null, hot: false, reset: true, gauge: { lit: 0, hot: false, tip: `The ${long} limit has reset` } });
      continue;
    }
    const pct = Math.round(w.used_percentage);
    const hot = pct >= HOT_PCT;
    const lit = Math.round(Math.min(100, Math.max(0, pct)) / 100 * segments);
    out.push({ label, pct, left: at == null ? null : untilReset(at - nowMs / 1000), hot, reset: false, gauge: { lit, hot, tip: `${pct}% of the ${long} limit used` } });
  }
  return out.length ? out : null;
}

// Widest first. Narrower drops the bars, then "used" after the first window, which already says it.
export const TIERS = [
  { bars: true, used: true },
  { bars: false, used: true },
  { bars: false, used: false },
];

/**
 * Window `i` as the footer sets it, two rows on one left edge:
 *   top     [▲] label  pct word     "▲ 5-HOUR  87% USED"  or  "5-HOUR  RESET"
 *   bottom  bar        resets       "▮▮▮▮▮▮▮▯  RESETS 1H 00M"
 * With bars the label holds the bar's width, so pct and resets start in one column.
 */
export function block(w, i, tier) {
  return {
    hot: w.hot,
    label: w.label,
    bar: tier.bars ? w.gauge : null,
    pct: w.reset ? null : `${w.pct}%`,
    word: w.reset ? "reset" : tier.used || i === 0 ? "used" : null,
    resets: w.left ? `resets ${w.left}` : null,
  };
}

// Estimated pixel widths: 10px Geist Mono runs 6px a character, the 13px bold percent about 8,
// the ▲ 7. m: {gaugeW, colGap, between}, from kit GAUGE and QUOTA.
const MONO = 6, PCT = 8, GAP = 5, HOT = 7;

/** How wide a block() draws: the wider of its two rows. */
export function blockWidth(b, m) {
  const head = Math.max((b.hot ? HOT + GAP : 0) + b.label.length * MONO, b.bar ? m.gaugeW : 0);
  const value = (b.pct ? b.pct.length * PCT : 0) + (b.pct && b.word ? GAP : 0) + (b.word ? b.word.length * MONO : 0);
  const bottom = (b.bar ? m.gaugeW : 0) + (b.bar && b.resets ? m.colGap : 0) + (b.resets ? b.resets.length * MONO : 0);
  return Math.max(head + m.colGap + value, bottom);
}

/** How wide the windows draw in a tier, `between` apart. */
export function usageWidth(windows, tier, m) {
  return windows.reduce((sum, w, i) => sum + blockWidth(block(w, i, tier), m), 0) + m.between * (windows.length - 1);
}

/** The widest tier whose windows fit in `slotW` pixels; the narrowest when none does. */
export function fit(windows, slotW, m) {
  return TIERS.find((t) => usageWidth(windows, t, m) <= slotW) ?? TIERS[TIERS.length - 1];
}
