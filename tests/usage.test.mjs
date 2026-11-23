import { test } from "node:test";
import assert from "node:assert/strict";
import { usage, untilReset, tail, fit, usageWidth, TIERS } from "../skin/mods/endfield/usage.js";

const NOW = 1_800_000_000_000;
const at = (s) => NOW / 1000 + s;
const M = { gaugeW: 54 };
const [FULL, PLAIN, TIGHT] = TIERS;
const line = (u, tier) => u.map((w) => `${w.hot ? "▲ " : ""}${w.label.toUpperCase()}${tier.bars && w.gauge ? ` ${"▰".repeat(w.gauge.lit)}${"▱".repeat(8 - w.gauge.lit)}` : ""}${w.reset ? "" : ` ${w.pct}%`} ${tail(w, tier)}`).join("   ");

test("both windows read as percent used and time to reset", () => {
  const u = usage({ five_hour: { used_percentage: 54.4, resets_at: at(6000) }, seven_day: { used_percentage: 73, resets_at: at(20400) } }, NOW, 8);
  assert.deepEqual(u, [
    { label: "5-hour", pct: 54, left: "1h 40m", hot: false, reset: false, gauge: { lit: 4, hot: false, tip: "54% of the 5-hour limit used" } },
    { label: "Weekly", pct: 73, left: "5h 40m", hot: false, reset: false, gauge: { lit: 6, hot: false, tip: "73% of the weekly limit used" } },
  ]);
});

test("the footer says what the percent and the time mean, at every width", () => {
  const u = usage({ five_hour: { used_percentage: 80, resets_at: at(4140) }, seven_day: { used_percentage: 76, resets_at: at(18540) } }, NOW, 8);
  assert.equal(line(u, FULL), "▲ 5-HOUR ▰▰▰▰▰▰▱▱ 80% used · resets in 1h 09m   WEEKLY ▰▰▰▰▰▰▱▱ 76% used · resets in 5h 09m");
  assert.equal(line(u, PLAIN), "▲ 5-HOUR 80% used · resets in 1h 09m   WEEKLY 76% used · resets in 5h 09m");
  assert.equal(line(u, TIGHT), "▲ 5-HOUR 80% used · ↻ 1h 09m   WEEKLY 76% used · ↻ 5h 09m");
});

test("a narrower footer drops the bars first, then the words", () => {
  const u = usage({ five_hour: { used_percentage: 80, resets_at: at(4140) }, seven_day: { used_percentage: 76, resets_at: at(18540) } }, NOW, 8);
  const [full, plain, tight] = TIERS.map((t) => usageWidth(u, t, M));
  assert.ok(full > plain && plain > tight);
  assert.equal(fit(u, Infinity, M), FULL);
  assert.equal(fit(u, full, M), FULL);
  assert.equal(fit(u, full - 1, M), PLAIN);
  assert.equal(fit(u, plain - 1, M), TIGHT);
  assert.equal(fit(u, 0, M), TIGHT);
});

test("no limits, or no window with a percent, shows nothing rather than zeros", () => {
  assert.equal(usage(null, NOW, 8), null);
  assert.equal(usage(undefined, NOW, 8), null);
  assert.equal(usage({}, NOW, 8), null);
  assert.equal(usage({ five_hour: null, seven_day: { resets_at: at(60) } }, NOW, 8), null);
});

test("a window whose reset time has passed shows as reset, not its old numbers", () => {
  const u = usage({ five_hour: { used_percentage: 97, resets_at: at(-1) }, seven_day: { used_percentage: 40, resets_at: at(90000) } }, NOW, 8);
  assert.deepEqual(u[0], { label: "5-hour", pct: null, left: null, hot: false, reset: true, gauge: null });
  assert.equal(line(u, FULL), "5-HOUR reset   WEEKLY ▰▰▰▱▱▱▱▱ 40% used · resets in 1d 1h");
});

test("a window reported alone keeps its own label", () => {
  assert.deepEqual(usage({ seven_day: { used_percentage: 12, resets_at: at(600) } }, NOW, 8).map((w) => w.label), ["Weekly"]);
});

test("from 80% a window is urgent, and its bar with it", () => {
  const u = usage({ five_hour: { used_percentage: 79.4, resets_at: at(60) }, seven_day: { used_percentage: 80, resets_at: at(60) } }, NOW, 8);
  assert.deepEqual(u.map((w) => [w.hot, w.gauge.hot]), [[false, false], [true, true]]);
});

test("the bar fills by percent used and stays inside its blocks", () => {
  const lit = (p) => usage({ five_hour: { used_percentage: p, resets_at: at(60) } }, NOW, 8)[0].gauge.lit;
  assert.deepEqual([0, 6, 50, 100, 130].map(lit), [0, 0, 4, 8, 8]);
});

test("a window without a reset time still shows its percent", () => {
  const u = usage({ five_hour: { used_percentage: 5 } }, NOW, 8);
  assert.equal(u[0].left, null);
  assert.equal(line(u, PLAIN), "5-HOUR 5% used");
});

test("time to reset counts down in days, hours and minutes", () => {
  assert.equal(untilReset(2 * 86400 + 5 * 3600 + 59), "2d 5h");
  assert.equal(untilReset(3600 + 9 * 60), "1h 09m");
  assert.equal(untilReset(42 * 60 + 30), "42m");
  assert.equal(untilReset(59), "<1m");
});
