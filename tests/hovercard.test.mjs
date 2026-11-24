import { test } from "node:test";
import assert from "node:assert/strict";
import { wantedCard, dismissed, cardKind, CARD_KINDS, cardHeight } from "../skin/mods/endfield/hovercard.js";

const open = { id: "o1", key: "ag-t1" };
const held = { id: "o1", key: "ag-t1", held: true };

test("the hovered row gets the card", () => {
  assert.equal(wantedCard({ row: "ag-t1" }), "ag-t1");
  assert.equal(wantedCard({ row: "sa-k2", hot: "o1", open }), "sa-k2");
});

test("the open card stays while the pointer is on it, and only on it", () => {
  assert.equal(wantedCard({ hot: "o1", open }), "ag-t1");
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

test("a held card stays when the pointer leaves it or reaches another row", () => {
  assert.equal(wantedCard({ open: held }), "ag-t1");
  assert.equal(wantedCard({ row: "ag-t2", open: held }), "ag-t1");
  assert.equal(wantedCard({ row: "sa-k2", hot: "o0", open: held }), "ag-t1");
});

test("a held card goes when its row is no longer listed", () => {
  assert.equal(wantedCard({ open: held, live: false }), null);
  assert.equal(wantedCard({ row: "ag-t2", open: held, live: false }), null);
});

test("a held card goes on any press beside it, its own row's too: Herdr has closed the popup", () => {
  assert.equal(dismissed({ closed: "o1", open: held }), true);
  assert.equal(dismissed({ closed: "o1", open: held, kept: "o1" }), true);
  assert.equal(dismissed({ closed: "o0", open: held }), false);
});

test("an agent row and a sub-agent row get a card, and no other row does", () => {
  assert.equal(cardKind("ag-t1"), "agent");
  assert.equal(cardKind("ag-box/t1"), "agent");
  assert.equal(cardKind("sa-a1b2"), "sub");
  for (const key of ["sm-t1", "sq-1", "pin-t1", "", null, undefined]) assert.equal(cardKind(key), null);
});

test("a sub-agent's card offers its transcript and a follow-up, and nothing a terminal has", () => {
  assert.deepEqual(CARD_KINDS.sub.acts, ["followup", "transcript"]);
  assert.equal(CARD_KINDS.sub.chat, false);
  assert.equal(CARD_KINDS.sub.comms, false);
  for (const act of ["peek", "pin", "dispatch", "go"]) assert.ok(!CARD_KINDS.sub.acts.includes(act), act);
});

test("an agent's card keeps its chat actions, comms and terminal buttons", () => {
  assert.equal(CARD_KINDS.agent.chat, true);
  assert.equal(CARD_KINDS.agent.comms, true);
  assert.deepEqual(CARD_KINDS.agent.acts, ["peek", "pin", "dispatch", "go"]);
});

test("a sub-agent's card is shorter than an agent's by the sections it lacks, and grows with its tasks", () => {
  const task = { id: "b1", kind: "shell", description: "npm test", startedAt: 1000, endedAt: null, state: "running" };
  assert.ok(cardHeight(null, "working", "sub") < cardHeight(null, "working", "agent"));
  assert.ok(cardHeight({ tasks: [task] }, "working", "sub", 5000) > cardHeight({ tasks: [] }, "working", "sub", 5000));
});
