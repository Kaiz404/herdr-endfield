import { test } from "node:test";
import assert from "node:assert/strict";
import { toModPx } from "../skin/mods/endfield/units.js";
import { usage, fit, usageWidth, TIERS } from "../skin/mods/endfield/usage.js";

// Herdr draws a mod's px times the zoom, and on_size_change and event positions report what it drew.
const measured = (modPx, zoom) => modPx * zoom;
const near = (got, want, what) => assert.ok(Math.abs(got - want) < 1e-9, `${what}: ${got} is not ${want}`);

const NOW = 1_800_000_000_000;
const at = (s) => NOW / 1000 + s;
const M = { gaugeW: 54, colGap: 10, between: 25 };
const LIMITS = usage({ five_hour: { used_percentage: 87, resets_at: at(3600) }, seven_day: { used_percentage: 77, resets_at: at(18000) } }, NOW, 8);
// The status bar's limits slot pads 20px each side; its usable width is what the windows may use.
const slotFor = (outer, zoom) => toModPx(measured(outer, zoom), zoom) - 40;

for (const zoom of [0.8, 1, 1.25]) {
  test(`zoom ${zoom}: a laid-out length comes back as the length the mod wrote`, () => {
    for (const w of [0, 1, 248, 900, 1440]) near(toModPx(measured(w, zoom), zoom), w, `width ${w}`);
  });

  test(`zoom ${zoom}: a pointer moved over a row moves the held row by as many mod px`, () => {
    const rowTop = 120, grip = 9, moved = 37;
    const y0 = measured(rowTop + grip, zoom), y = measured(rowTop + grip + moved, zoom);
    near(rowTop + toModPx(measured(grip, zoom), zoom) + toModPx(y - y0, zoom), rowTop + grip + moved, "pointer in list px");
  });

  test(`zoom ${zoom}: the usage slot picks the tier its laid-out width fits`, () => {
    for (const t of TIERS) {
      const outer = usageWidth(LIMITS, t, M) + 40;
      assert.equal(fit(LIMITS, slotFor(outer + 0.5, zoom), M), t, `tier ${TIERS.indexOf(t)} at its own width`);
      if (t !== TIERS[TIERS.length - 1]) assert.notEqual(fit(LIMITS, slotFor(outer - 1, zoom), M), t, "one px narrower drops a tier");
    }
  });
}

test("at zoom 0.8 the raw window px would have dropped to a narrower tier than fits", () => {
  const outer = usageWidth(LIMITS, TIERS[0], M) + 40.5;
  assert.equal(fit(LIMITS, measured(outer, 0.8) - 40, M), TIERS[1]);
  assert.equal(fit(LIMITS, slotFor(outer, 0.8), M), TIERS[0]);
});

test("a zoom Herdr has not reported yet counts as 1", () => {
  for (const zoom of [undefined, null, 0, NaN, -1]) assert.equal(toModPx(248, zoom), 248);
});
