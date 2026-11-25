import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD, PANEL, cardPlace, cardHeight, windowHeight, resized } from "../skin/mods/endfield/hovercard.js";

// A lead agent's full Dossier: four tools ranked, five recent calls, one task running.
const WANT = cardHeight({
  toolCounts: { Bash: 23, Read: 16, Edit: 11, Grep: 7 },
  recent: Array.from({ length: 5 }, () => ({ at: 0, tool: "Bash", arg: "npm test" })),
  tasks: [{ id: "b1", kind: "shell", description: "npm test", startedAt: 0, endedAt: null, state: "running" }],
}, "working", "agent", 1000);
const ZOOMS = [0.5, 0.8, 0.9, 1, 1.25, 1.5, 2, 3];
const VIEWPORTS = [240, 300, 360, 480, 600, 800, 1080, 1440];
const row = (y) => ({ x: 0, y, width: 340, height: 44 });
const middle = (fit) => fit - PANEL.head - PANEL.foot;

test("a card that fits opens at its own height, its top 12px above the row's", () => {
  const { at: { y }, tall, fit } = cardPlace({ want: WANT, row: row(200), winH: 900 });
  assert.equal(fit, WANT);
  assert.equal(tall, WANT + 2 * CARD.pad);
  assert.equal(y, 200 - 12 - CARD.pad);
});

test("the middle keeps its least height at every window height and zoom", () => {
  for (const zoom of ZOOMS) for (const px of VIEWPORTS) {
    const { fit } = cardPlace({ want: WANT, row: row(100), winH: windowHeight(px, zoom) });
    assert.ok(middle(fit) >= PANEL.mid, `viewport ${px} at zoom ${zoom}: the middle gets ${middle(fit)}`);
  }
});

test("zoomed out, the window is taller in the card's px, so a tall card is not capped", () => {
  assert.equal(windowHeight(800, 0.8), 1000);
  assert.equal(cardPlace({ want: 900, row: row(20), winH: windowHeight(800, 0.8) }).fit, 900);
});

test("zoomed in, the window is shorter in the card's px, so the card is capped inside it", () => {
  const winH = windowHeight(800, 1.25);
  const { at: { y }, tall } = cardPlace({ want: 900, row: row(20 * 1.25), winH, zoom: 1.25 });
  assert.equal(winH, 640);
  assert.ok(y + tall * 1.25 <= 800, `the card ends at ${y + tall * 1.25} in a window 800 tall`);
});

test("a window height that can't be read caps nothing", () => {
  for (const bad of [NaN, undefined, 0, -1717986944]) {
    const winH = windowHeight(bad, 1);
    assert.equal(winH, null);
    assert.equal(cardPlace({ want: WANT, row: row(100), winH }).fit, WANT);
  }
});

test("a card no taller than the window stays inside it, wherever its row is", () => {
  for (const winH of [600, 800, 1080]) for (let y = 0; y + 44 <= winH; y += 4) {
    const { at: { y: top }, tall } = cardPlace({ want: WANT, row: row(y), winH });
    assert.ok(top >= 0 && top + tall <= winH, `row at ${y} in ${winH}: the card spans ${top} to ${top + tall}`);
  }
});

test("the open card is placed again when the window height it was placed for changes", () => {
  const open = { id: "o1", address: "t1", winH: 900 };
  assert.equal(resized(open, 900), false);
  assert.equal(resized(open, 600), true);
  assert.equal(resized(open, null), true);
  assert.equal(resized(null, 600), false);
});
