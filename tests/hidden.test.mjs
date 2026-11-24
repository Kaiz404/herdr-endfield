import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRoster, BY, HIDDEN } from "../skin/mods/endfield/fleet.js";
import { identityOf } from "./identity.mjs";

const identity = identityOf({ defaults: { claude: "perlica" }, operators: ["perlica", "ember"], spares: [] });
const claude = { key: "claude", name: "Claude Code" };
const spaces = [{ id: "s1", name: "one" }, { id: "s2", name: "two" }];
const agent = (address, space) => ({ address, program: claude, status: "idle", title: address, space, space_name: space, tab: `${space}-tab`, tab_index: 1, pane: `p-${address}`, seq: 1, pinned: false, focused: false });
const term = (address, created, parent = null, extra = {}) => ({ address, created_ms: created, parent, state: "live", program: claude, ...extra });
const build = (listed, terms, parked) => buildRoster({ listed, terms, spaces, identity, sort: BY.priority, parked });

test("an agent hidden from its pane stays in its squad with no pane, and its children stay under it", () => {
  const parked = [{ terminal: "t2", created: 2, space: "s1", tab: "s1-tab", at: 0 }];
  const R = build([agent("t1", "s1")], [term("t1", 1), term("t2", 2, null, { status: "working", title: "fix login" }), term("t3", 3, "t2")], parked);
  const m = R.all.get("t2");
  assert.equal(m.hidden, true);
  assert.equal(m.pane, null);
  assert.equal(m.status, "working");
  assert.ok(R.squads.find((q) => q.id === "s1").members.some((x) => x.address === "t2"));
  assert.equal(R.all.get("t3").parent, "t2", "its sub-agent stays under it");
});

test("without the record, Herdr's lists alone lose a parked agent: that is what the record is for", () => {
  const R = build([agent("t1", "s1")], [term("t1", 1), term("t2", 2)], []);
  assert.ok(!R.all.has("t2"));
});

test("a hidden agent whose squad closed goes to a Hidden squad; one that ended, got a pane again, or is another terminal is not hidden", () => {
  const terms = [term("t2", 2), term("t4", 4), term("t5", 5, null, { state: "finished" }), term("t6", 6)];
  const parked = [
    { terminal: "t2", created: 2, space: "gone", tab: null, at: 0 },
    { terminal: "t4", created: 4, space: "s1", tab: null, at: 0 },
    { terminal: "t5", created: 5, space: "s1", tab: null, at: 0 },
    { terminal: "t6", created: 999, space: "s1", tab: null, at: 0 },
  ];
  const R = build([agent("t4", "s2")], terms, parked);
  assert.deepEqual(R.squads.find((q) => q.id === HIDDEN).members.map((m) => m.address), ["t2"]);
  assert.equal(R.all.get("t4").hidden, undefined, "listed with a pane again: shown where it is");
  assert.equal(R.all.get("t4").space, "s2");
  assert.ok(!R.all.has("t5"), "it ended");
  assert.ok(!R.all.has("t6"), "the address went to another terminal");
});

test("a hidden sub-agent shows under its live parent, not as a top-level hidden agent", () => {
  const parked = [{ terminal: "t2", created: 2, space: "s1", tab: null, at: 0 }];
  const R = build([agent("t1", "s1")], [term("t1", 1), term("t2", 2, "t1")], parked);
  assert.equal(R.all.get("t2").parent, "t1");
  assert.equal(R.all.get("t2").hidden, undefined);
});
