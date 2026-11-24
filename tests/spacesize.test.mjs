import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HEAD, spacesSize, openSize } from "../skin/mods/endfield/spacesize.js";

const node = (tree, id) => (tree.id === id ? tree : (tree.children ?? []).map((c) => node(c, id)).find(Boolean));
const layout = JSON.parse(readFileSync(new URL("../skin/layouts/endfield.json", import.meta.url), "utf8"));

test("folded, the block is its header's height, compact fleet or not", () => {
  assert.deepEqual(spacesSize({ folded: true, rail: false, fitted: null, open: { weight: 0.7 } }), { px: HEAD });
  assert.deepEqual(spacesSize({ folded: true, rail: false, fitted: 250, open: null }), { px: HEAD });
});

test("the layout lets the block shrink to its header", () => {
  assert.ok(node(layout, "spaces").min <= HEAD, `spaces min ${node(layout, "spaces").min} holds a folded block taller than ${HEAD}px`);
});

test("unfolded, the block gets back the share it had, else its default share", () => {
  assert.deepEqual(spacesSize({ folded: false, rail: false, fitted: null, open: { weight: 0.7 } }), { weight: 0.7 });
  assert.deepEqual(spacesSize({ folded: false, rail: false, fitted: null, open: null }), { weight: node(layout, "spaces").size.weight });
});

test("unfolded with a compact fleet, the block fits its list", () => {
  assert.deepEqual(spacesSize({ folded: false, rail: false, fitted: 250, open: { weight: 0.7 } }), { px: 250 });
});

test("the rail has no chevron, so it shows the list even when folded", () => {
  assert.deepEqual(spacesSize({ folded: true, rail: true, fitted: null, open: { weight: 0.7 } }), { weight: 0.7 });
});

test("only a share is kept to restore: a px is a fold or the compact fit", () => {
  assert.deepEqual(openSize({ weight: 0.7 }), { weight: 0.7 });
  assert.equal(openSize({ px: HEAD }), null);
  assert.equal(openSize({ px: 250 }), null);
  assert.equal(openSize(undefined), null);
});
