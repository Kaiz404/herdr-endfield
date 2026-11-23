// usage: the account's Claude usage limits for the HUD footer, with no Herdr in it
// (tests/usage.test.mjs runs it in node). The statusline sidecar carries Claude Code's
// rate_limits: {five_hour, seven_day: {used_percentage, resets_at (epoch seconds)}}.

const WINDOWS = [
  { key: "five_hour", label: "5H" },
  { key: "seven_day", label: "7D" },
];
// From this percent a window reads as urgent, as the statusline's own yellow does.
export const HOT_PCT = 80;
// The time to reset counts down in minutes, so the footer repaints once a minute while it shows.
export const USAGE_TICK_MS = 60000;

const pad2 = (n) => String(n).padStart(2, "0");

/** Seconds to "2D04H", "1H40M", "12M" or "<1M". */
export function untilReset(s) {
  const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d) return `${d}D${pad2(h % 24)}H`;
  if (h) return `${h}H${pad2(m % 60)}M`;
  return m ? `${m}M` : "<1M";
}

/**
 * rate_limits -> [{label, pct, left, hot, reset}] in WINDOWS order, or null when there is nothing
 * to show. A window whose resets_at has passed has reset since it was written: its numbers are
 * old, so it shows as reset (pct and left null) rather than as current.
 */
export function usage(limits, nowMs) {
  const out = [];
  for (const { key, label } of WINDOWS) {
    const w = limits?.[key];
    if (typeof w?.used_percentage !== "number") continue;
    const at = typeof w.resets_at === "number" ? w.resets_at : null;
    if (at != null && at * 1000 <= nowMs) { out.push({ label, pct: null, left: null, hot: false, reset: true }); continue; }
    const pct = Math.round(w.used_percentage);
    out.push({ label, pct, left: at == null ? null : untilReset(at - nowMs / 1000), hot: pct >= HOT_PCT, reset: false });
  }
  return out.length ? out : null;
}
