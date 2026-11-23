import { test } from "node:test";
import assert from "node:assert/strict";
import { wantedCard } from "../skin/mods/endfield/hovercard.js";

const open = { id: "o1", address: "t1" };

test("the hovered agent row gets the card", () => {
  assert.equal(wantedCard({ row: "t1" }), "t1");
  assert.equal(wantedCard({ row: "t2", hot: "o1", open }), "t2");
});

test("the open card stays while the pointer is on it, and only on it", () => {
  assert.equal(wantedCard({ hot: "o1", open }), "t1");
  assert.equal(wantedCard({ hot: "o0", open }), null);
  assert.equal(wantedCard({ open }), null);
});

test("nothing hovered, no card", () => {
  assert.equal(wantedCard({}), null);
  assert.equal(wantedCard({ hot: "o1" }), null);
});
