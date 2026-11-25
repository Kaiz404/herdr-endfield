import { test } from "node:test";
import assert from "node:assert/strict";
import { areaStatus, finishedSlip, pollLanded, buildRoster } from "../skin/mods/endfield/fleet.js";
import { identityOf } from "./identity.mjs";

const claude = { key: "claude", name: "Claude Code", agent: true };
const agent = (address, status, tab, space = "s1") => ({ address, program: claude, status, title: address, space, space_name: space, tab, tab_index: 1, pane: `p-${address}`, seq: Number(address), pinned: false, focused: false });
const roster = (listed, waiting) => buildRoster({
  listed,
  terms: listed.map((a, i) => ({ address: a.address, created_ms: i, parent: null, state: "live", program: claude })),
  spaces: [{ id: "s1", name: "one" }, { id: "s2", name: "two" }],
  identity: identityOf({ defaults: { claude: "perlica" }, operators: ["perlica"], spares: [] }),
  waiting,
});
const tab = (R, id) => [...R.all.values()].filter((m) => m.tab === id);
const space = (R, id) => [...R.all.values()].filter((m) => m.space === id);

test("a tab or space whose lead waits on background work reads waiting, though Herdr says done or idle", () => {
  const R = roster([agent("1", "done", "t1"), agent("2", "idle", "t2"), agent("3", "idle", "t2")], ["1", "2"]);
  assert.equal(areaStatus("done", tab(R, "t1")), "waiting");
  assert.equal(areaStatus("idle", tab(R, "t2")), "waiting");
  assert.equal(areaStatus("done", space(R, "s1")), "waiting");
});

test("an area reads its most urgent agent by STATUS rank", () => {
  const R = roster([agent("1", "done", "t1"), agent("2", "done", "t1"), agent("3", "blocked", "t2"), agent("4", "idle", "t2"), agent("5", "working", "t3"), agent("6", "idle", "t3")], ["1", "6"]);
  assert.equal(areaStatus("done", tab(R, "t1")), "done");
  assert.equal(areaStatus("blocked", tab(R, "t2")), "blocked");
  assert.equal(areaStatus("working", tab(R, "t3")), "waiting");
  assert.equal(areaStatus("blocked", space(R, "s1")), "blocked");
});

test("an area with no listed agent keeps Herdr's status", () => {
  const R = roster([agent("1", "done", "t1")], []);
  assert.equal(areaStatus("idle", tab(R, "t9")), "idle");
  assert.equal(areaStatus(null, space(R, "s2")), null);
  assert.equal(areaStatus("idle", [{ agent: null, status: "blocked", tab: "t1" }]), "idle");
});

test("a done agent waiting on background work gets no Finished slip", () => {
  assert.equal(finishedSlip("waiting", { claude: true, landed: true }), "waiting");
});

test("a waiting read before this turn's poll lands holds: it may be the previous turn's", () => {
  assert.equal(finishedSlip("waiting", { claude: true, landed: false }), null);
});

test("a done Claude Code agent's slip holds until a session poll lands; other agents get it at once", () => {
  assert.equal(finishedSlip("done", { claude: true, landed: false }), null);
  assert.equal(finishedSlip("done", { claude: true, landed: true }), "finished");
  assert.equal(finishedSlip("done", { claude: false, landed: false }), "finished");
});

test("a poll that started before Herdr said done doesn't release the slip, though it changes the session", () => {
  const ARRIVED = 50000;
  const slip = (status, session) => finishedSlip(status, { claude: true, landed: pollLanded(session, ARRIVED) });
  const before = { tokens: 100, turns: 3, polledAs: "working", polledAt: ARRIVED - 4000 };
  const stale = { tokens: 180, turns: 4, polledAs: "working", polledAt: ARRIVED - 500 };
  assert.equal(slip("done", before), null);
  assert.equal(slip("done", stale), null, "read before the turn ended: its waiting isn't the turn's");
  assert.equal(slip("done", { ...stale, polledAs: "done", polledAt: ARRIVED + 1200 }), "finished");
  assert.equal(slip("waiting", { ...stale, polledAs: "done", polledAt: ARRIVED + 1200 }), "waiting");
  assert.equal(slip("done", null), null);
});

test("an earlier turn's done poll doesn't release the slip of a turn too short to be polled", () => {
  const ARRIVED = 50000;
  const earlier = { tokens: 180, turns: 4, polledAs: "done", polledAt: ARRIVED - 2500 };
  assert.equal(finishedSlip("done", { claude: true, landed: pollLanded(earlier, ARRIVED) }), null);
  assert.equal(finishedSlip("done", { claude: true, landed: pollLanded({ ...earlier, polledAt: ARRIVED }, ARRIVED) }), "finished");
});
