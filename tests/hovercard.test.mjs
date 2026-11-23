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

// A 248px sidebar row, its card beside it (over the row's last 26px), and the tab strip's pills.
const rowRect = { x: 0, y: 300, width: 248, height: 56 };
const up = { id: "o1", address: "t1", rect: { x: 222, y: 274, width: 410, height: 480 } };
const onRow = { x: 120, y: 320 }, onCard = { x: 400, y: 400 }, onPills = { x: 1100, y: 20 };

test("a row whose hover-out never arrived loses the card once the pointer is off it", () => {
  assert.equal(wantedCard({ row: "t1", rowRect, open: up, pointer: onPills }), null);
  assert.equal(wantedCard({ row: "t1", rowRect, hot: "o1", open: up, pointer: onCard }), "t1");
});

test("a card whose hover-out never arrived closes once the pointer is off it", () => {
  assert.equal(wantedCard({ hot: "o1", open: up, pointer: onPills }), null);
  assert.equal(wantedCard({ hot: "o1", open: up, pointer: onCard }), "t1");
});

test("no card while the window is not the active one", () => {
  assert.equal(wantedCard({ row: "t1", rowRect, open: up, pointer: onRow, active: false }), null);
  assert.equal(wantedCard({ hot: "o1", open: up, pointer: onCard, active: false }), null);
});

test("where the pointer is can only take a card away: unknown, it changes nothing", () => {
  assert.equal(wantedCard({ row: "t1", rowRect, pointer: onRow }), "t1");
  assert.equal(wantedCard({ row: "t1", pointer: onPills }), "t1");
  assert.equal(wantedCard({ row: "t1", rowRect }), "t1");
  assert.equal(wantedCard({ rowRect, open: up, pointer: onCard }), null);
});
