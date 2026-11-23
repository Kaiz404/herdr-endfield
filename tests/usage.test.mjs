import { test } from "node:test";
import assert from "node:assert/strict";
import { usage, untilReset } from "../skin/mods/endfield/usage.js";

const NOW = 1_800_000_000_000;
const at = (s) => NOW / 1000 + s;

test("both windows read as percent used and time to reset", () => {
  const u = usage({ five_hour: { used_percentage: 54.4, resets_at: at(6000) }, seven_day: { used_percentage: 73, resets_at: at(20400) } }, NOW);
  assert.deepEqual(u, [
    { label: "5H", pct: 54, left: "1H40M", hot: false, reset: false },
    { label: "7D", pct: 73, left: "5H40M", hot: false, reset: false },
  ]);
});

test("no limits, or no window with a percent, shows nothing rather than zeros", () => {
  assert.equal(usage(null, NOW), null);
  assert.equal(usage(undefined, NOW), null);
  assert.equal(usage({}, NOW), null);
  assert.equal(usage({ five_hour: null, seven_day: { resets_at: at(60) } }, NOW), null);
});

test("a window whose reset time has passed shows as reset, not its old numbers", () => {
  const u = usage({ five_hour: { used_percentage: 97, resets_at: at(-1) }, seven_day: { used_percentage: 40, resets_at: at(90000) } }, NOW);
  assert.deepEqual(u[0], { label: "5H", pct: null, left: null, hot: false, reset: true });
  assert.deepEqual(u[1], { label: "7D", pct: 40, left: "1D01H", hot: false, reset: false });
});

test("a window reported alone keeps its own label", () => {
  assert.deepEqual(usage({ seven_day: { used_percentage: 12, resets_at: at(600) } }, NOW).map((w) => w.label), ["7D"]);
});

test("from 80% a window is urgent", () => {
  const u = usage({ five_hour: { used_percentage: 79.4, resets_at: at(60) }, seven_day: { used_percentage: 80, resets_at: at(60) } }, NOW);
  assert.deepEqual(u.map((w) => w.hot), [false, true]);
});

test("a window without a reset time still shows its percent", () => {
  assert.deepEqual(usage({ five_hour: { used_percentage: 5 } }, NOW), [{ label: "5H", pct: 5, left: null, hot: false, reset: false }]);
});

test("time to reset counts down in days, hours and minutes", () => {
  assert.equal(untilReset(2 * 86400 + 4 * 3600 + 59), "2D04H");
  assert.equal(untilReset(3600 + 5 * 60), "1H05M");
  assert.equal(untilReset(12 * 60 + 30), "12M");
  assert.equal(untilReset(59), "<1M");
});
