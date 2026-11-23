import { test } from "node:test";
import assert from "node:assert/strict";
import { wantedCard, dismissed } from "../skin/mods/endfield/hovercard.js";

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

test("a press beside the open card takes it away, whatever hover says", () => {
  assert.equal(dismissed({ closed: "o1", open }), true);
  assert.equal(dismissed({ closed: "o1", open, kept: "o0" }), true);
});

test("a press on the card's own row keeps it", () => {
  assert.equal(dismissed({ closed: "o1", open, kept: "o1" }), false);
});

test("a report about another card, or none, takes nothing away", () => {
  assert.equal(dismissed({ closed: "o0", open }), false);
  assert.equal(dismissed({ open }), false);
  assert.equal(dismissed({ closed: "o1" }), false);
  assert.equal(dismissed({}), false);
});
