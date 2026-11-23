import { test } from "node:test";
import assert from "node:assert/strict";
import { usage, untilReset, block, fit, usageWidth, TIERS } from "../skin/mods/endfield/usage.js";

const NOW = 1_800_000_000_000;
const at = (s) => NOW / 1000 + s;
const M = { gaugeW: 54, colGap: 10, between: 25 };
const [FULL, PLAIN, TIGHT] = TIERS;

// The footer's two rows as text: a block per window, its rows on one left edge, blocks 3 apart.
const rows = (u, tier) => {
  const blocks = u.map((w, i) => {
    const b = block(w, i, tier);
    const head = `${b.hot ? "▲ " : ""}${b.label}`;
    const bar = b.bar ? "▮".repeat(b.bar.lit) + "▯".repeat(8 - b.bar.lit) : "";
    const col = b.bar ? Math.max(head.length, bar.length) + 2 : head.length + 2;
    const top = (head.padEnd(col) + [b.pct, b.word].filter(Boolean).join(" ")).toUpperCase();
    const bottom = ((bar ? bar.padEnd(col) : "") + (b.resets ?? "")).toUpperCase();
    return [top, bottom];
  });
  return [0, 1].map((r) => blocks.map((b) => b[r].padEnd(Math.max(...b.map((s) => s.length)))).join("   ").trimEnd());
};

const HOT_PAIR = { five_hour: { used_percentage: 87, resets_at: at(3600) }, seven_day: { used_percentage: 77, resets_at: at(18000) } };

test("both windows read as percent used and time to reset", () => {
  const u = usage({ five_hour: { used_percentage: 54.4, resets_at: at(6000) }, seven_day: { used_percentage: 73, resets_at: at(20400) } }, NOW, 8);
  assert.deepEqual(u, [
    { label: "5-hour", pct: 54, left: "1h 40m", hot: false, reset: false, gauge: { lit: 4, hot: false, tip: "54% of the 5-hour limit used" } },
    { label: "Weekly", pct: 73, left: "5h 40m", hot: false, reset: false, gauge: { lit: 6, hot: false, tip: "73% of the weekly limit used" } },
  ]);
});

test("each window is two rows: label and percent over bar and countdown, with no separators", () => {
  const u = usage(HOT_PAIR, NOW, 8);
  assert.deepEqual(rows(u, FULL), [
    "▲ 5-HOUR  87% USED        WEEKLY    77% USED",
    "▮▮▮▮▮▮▮▯  RESETS 1H 00M   ▮▮▮▮▮▮▯▯  RESETS 5H 00M",
  ]);
  for (const t of TIERS) for (const r of rows(u, t)) assert.doesNotMatch(r, /[·|•↻]/);
});

test("a narrower footer drops the bars, then the second window's \"used\"", () => {
  const u = usage(HOT_PAIR, NOW, 8);
  assert.deepEqual(rows(u, PLAIN), [
    "▲ 5-HOUR  87% USED   WEEKLY  77% USED",
    "RESETS 1H 00M        RESETS 5H 00M",
  ]);
  assert.deepEqual(rows(u, TIGHT), [
    "▲ 5-HOUR  87% USED   WEEKLY  77%",
    "RESETS 1H 00M        RESETS 5H 00M",
  ]);
});

test("fit picks the widest tier that fits, each narrower than the last", () => {
  const u = usage(HOT_PAIR, NOW, 8);
  const [full, plain, tight] = TIERS.map((t) => usageWidth(u, t, M));
  assert.ok(full > plain && plain > tight, `${full} > ${plain} > ${tight}`);
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

test("a window whose reset time has passed reads reset over an empty bar, not its old numbers", () => {
  const u = usage({ five_hour: { used_percentage: 97, resets_at: at(-1) }, seven_day: { used_percentage: 40, resets_at: at(90000) } }, NOW, 8);
  assert.deepEqual(u[0], { label: "5-hour", pct: null, left: null, hot: false, reset: true, gauge: { lit: 0, hot: false, tip: "The 5-hour limit has reset" } });
  assert.deepEqual(rows(u, FULL), [
    "5-HOUR    RESET   WEEKLY    40% USED",
    "▯▯▯▯▯▯▯▯          ▮▮▮▯▯▯▯▯  RESETS 1D 1H",
  ]);
  assert.deepEqual(rows(u, TIGHT), [
    "5-HOUR  RESET   WEEKLY  40%",
    "                RESETS 1D 1H",
  ]);
});

test("a window reported alone keeps its own label and its \"used\"", () => {
  const u = usage({ seven_day: { used_percentage: 12, resets_at: at(600) } }, NOW, 8);
  assert.deepEqual(rows(u, TIGHT), ["WEEKLY  12% USED", "RESETS 10M"]);
});

test("from 80% a window is urgent, and its bar with it", () => {
  const u = usage({ five_hour: { used_percentage: 79.4, resets_at: at(60) }, seven_day: { used_percentage: 80, resets_at: at(60) } }, NOW, 8);
  assert.deepEqual(u.map((w) => [w.hot, w.gauge.hot]), [[false, false], [true, true]]);
});

test("the bar fills by percent used and stays inside its blocks", () => {
  const lit = (p) => usage({ five_hour: { used_percentage: p, resets_at: at(60) } }, NOW, 8)[0].gauge.lit;
  assert.deepEqual([0, 6, 50, 100, 130].map(lit), [0, 0, 4, 8, 8]);
});

test("a window without a reset time still shows its percent, with an empty second row", () => {
  const u = usage({ five_hour: { used_percentage: 5 } }, NOW, 8);
  assert.equal(u[0].left, null);
  assert.deepEqual(rows(u, PLAIN), ["5-HOUR  5% USED", ""]);
});

test("time to reset always shows minutes under a day", () => {
  assert.equal(untilReset(2 * 86400 + 5 * 3600 + 59), "2d 5h");
  assert.equal(untilReset(5 * 3600), "5h 00m");
  assert.equal(untilReset(3600 + 9 * 60), "1h 09m");
  assert.equal(untilReset(42 * 60 + 30), "42m");
  assert.equal(untilReset(59), "<1m");
});
