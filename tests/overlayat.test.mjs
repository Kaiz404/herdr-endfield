import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD, cardPlace, cardHeight, windowHeight } from "../skin/mods/endfield/hovercard.js";
import { cornerAt } from "../skin/mods/endfield/units.js";

// Measured in Herdr (#72): openOverlay's `at` is window px and doesn't follow the zoom, while its
// width and height are mod px, drawn times the zoom. So an overlay covers, in window px:
const drawn = (at, width, height, zoom) => ({ top: at.y, right: at.x + width * zoom, bottom: at.y + height * zoom });

const WANT = cardHeight({ toolCounts: { Bash: 3 }, recent: [], tasks: [] }, "working", "agent", 1000);
const VIEW = { width: 1536, height: 816 };
const WIDE = CARD.width + CARD.slide + 2 * CARD.pad;

for (const zoom of [0.5, 0.8, 1, 1.25, 1.5, 2]) {
  test(`zoom ${zoom}: the card's window stays inside the app window, wherever its row is`, () => {
    const winH = windowHeight(VIEW.height, zoom);
    for (let y = 0; y + 44 * zoom <= VIEW.height; y += 8) {
      const { at, tall } = cardPlace({ want: WANT, row: { x: 0, y, width: 340 * zoom, height: 44 * zoom }, winH, zoom });
      const box = drawn(at, WIDE, tall, zoom);
      assert.ok(box.top >= 0 && box.bottom <= VIEW.height + 0.5, `row at ${y}: the card spans ${box.top} to ${box.bottom} in a window ${VIEW.height} tall`);
    }
  });

  test(`zoom ${zoom}: the card sits 12 mod px into its row and 12 above it`, () => {
    const row = { x: 0, y: 200 * zoom, width: 340 * zoom, height: 44 * zoom };
    const { at } = cardPlace({ want: WANT, row, winH: null, zoom });
    assert.equal(at.x, Math.round(row.width - (12 + CARD.pad) * zoom));
    assert.equal(at.y, Math.round((200 - 12 - CARD.pad) * zoom));
  });

  test(`zoom ${zoom}: the cut-in keeps its inset from the window's bottom-right corner`, () => {
    const size = { width: 440, height: 214 }, inset = { x: 16, y: 128 };
    const box = drawn(cornerAt(VIEW, size, inset, zoom), size.width, size.height, zoom);
    assert.ok(Math.abs(VIEW.width - box.right - inset.x * zoom) <= 0.5, `right gap ${VIEW.width - box.right}`);
    assert.ok(Math.abs(VIEW.height - box.bottom - inset.y * zoom) <= 0.5, `bottom gap ${VIEW.height - box.bottom}`);
  });
}
