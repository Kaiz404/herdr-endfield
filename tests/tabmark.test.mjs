import { test } from "node:test";
import assert from "node:assert/strict";
import { markAt } from "../skin/mods/endfield/tabmark.js";

// Tabs as Herdr laid them out, in the px a mod writes. on_size_change reports each one in window
// px (mod px times the zoom), and Herdr draws what the mod writes times the zoom again.
const measured = (tabs, zoom) => Object.fromEntries(tabs.map((t) => [t.id, t.width * zoom]));
const drawn = (mark, zoom) => ({ left: mark.left * zoom, right: (mark.left + mark.width) * zoom });
const box = (tabs, active, zoom) => {
  const left = tabs.slice(0, active).reduce((x, t) => x + t.width, 0) * zoom;
  return { left, right: left + tabs[active].width * zoom };
};
const near = (got, want, what) => {
  for (const k of Object.keys(want)) assert.ok(Math.abs(got[k] - want[k]) < 0.01, `${what}: ${k} ${got[k]} is not ${want[k]}`);
};
const onTab = (tabs, active, zoom, what) => {
  const mark = markAt({ ids: tabs.map((t) => t.id), widths: measured(tabs, zoom), active, zoom });
  near(drawn(mark, zoom), box(tabs, active, zoom), what);
};

// Three long titles, each cut at the label's 180px cap; the selected one is wider by its close button.
const long = (active) => ["a", "b", "c"].map((id, i) => ({ id, width: i === active ? 263 : 251 }));

for (const zoom of [1, 0.9, 1.25]) {
  for (const [active, where] of [[0, "first"], [1, "middle"], [2, "last"]]) {
    test(`zoom ${zoom}: the marker is drawn on the ${where} tab's box when it is selected`, () => {
      onTab(long(active), active, zoom, `long titles, ${where}`);
    });
  }
  test(`zoom ${zoom}: tabs squeezed narrower than their titles are marked where they were laid out`, () => {
    const squeezed = [{ id: "a", width: 96 }, { id: "b", width: 131 }, { id: "c", width: 96 }];
    onTab(squeezed, 1, zoom, "squeezed");
    onTab(squeezed, 2, zoom, "squeezed, last");
  });
  test(`zoom ${zoom}: a closed tab's width no longer shifts the marker`, () => {
    const tabs = [{ id: "a", width: 251 }, { id: "c", width: 263 }];
    const mark = markAt({ ids: ["a", "c"], widths: { ...measured(tabs, zoom), b: 251 * zoom }, active: 1, zoom });
    near(drawn(mark, zoom), box(tabs, 1, zoom), "after closing b");
  });
  test(`zoom ${zoom}: a new tab moves the marker once it is measured`, () => {
    const before = [{ id: "a", width: 251 }, { id: "c", width: 263 }];
    const ids = ["a", "n", "c"];
    const unmeasured = markAt({ ids, widths: measured(before, zoom), active: 2, zoom });
    near(drawn(unmeasured, zoom), box(before, 1, zoom), "new tab not measured yet");
    const after = [before[0], { id: "n", width: 120 }, before[1]];
    near(drawn(markAt({ ids, widths: measured(after, zoom), active: 2, zoom }), zoom), box(after, 2, zoom), "new tab measured");
  });
}

test("a selected tab not measured yet has no marker, at its place", () => {
  assert.deepEqual(markAt({ ids: ["a", "n"], widths: { a: 200 }, active: 1, zoom: 1 }), { left: 200, width: 0 });
});

test("no selected tab, no marker", () => {
  assert.deepEqual(markAt({ ids: ["a", "b"], widths: { a: 200, b: 100 }, active: -1, zoom: 0.9 }), { left: 0, width: 0 });
  assert.deepEqual(markAt({ ids: [], widths: {}, active: -1, zoom: 1 }), { left: 0, width: 0 });
});

test("a zoom Herdr has not reported yet counts as 1", () => {
  for (const zoom of [undefined, 0, NaN]) {
    assert.deepEqual(markAt({ ids: ["a", "b"], widths: { a: 200, b: 100 }, active: 1, zoom }), { left: 200, width: 100 });
  }
});
