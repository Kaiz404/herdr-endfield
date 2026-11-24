import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CASTING, tierOf, poolFor, buildRoster, castCrew, held } from "../skin/mods/endfield/fleet.js";
import { identityOf } from "./identity.mjs";

const catalogue = JSON.parse(readFileSync(new URL("../art-pack/operators.json", import.meta.url), "utf8"));
const everyone = Object.keys(catalogue.operators);
const claude = { key: "claude", name: "Claude Code" };
const codex = { key: "codex", name: "Codex" };

test("each model family lands in its tier, first match winning", () => {
  const want = {
    fable: ["claude-fable-5", "gpt-5.5-pro", "o3-pro", "gemini-3-deep-think", "gemini-ultra", "grok-4-heavy"],
    opus: ["claude-opus-5-5", "claude-opus-4-5[1m]", "gpt-6", "gpt-5.1-codex", "o3", "gemini-3.8-pro", "gemini-2.5-pro", "grok-4", "deepseek-reasoner", "kimi-k2-pro", "openai/gpt-5"],
    sonnet: ["claude-sonnet-4-5", "gpt-5-mini", "o4-mini", "gpt-5.1-codex-mini", "gemini-3-flash", "gemini-2.5-flash", "composer-2.5", "qwen3-coder", "glm-4.6", "minimax-m2", "kimi-k2", "deepseek-chat", "mistral-large", "devstral-small"],
    haiku: ["claude-haiku-4-5", "claude-3-5-haiku", "gpt-5-nano", "gemini-3-flash-lite", "gemini-2.5-flash-lite", "grok-code-fast-1", "qwen2.5-coder:7b", "llama3.1:70b"],
  };
  for (const [tier, ids] of Object.entries(want)) for (const id of ids) assert.equal(tierOf(id), tier, id);
});

test("gemini is never read as a mini model", () => {
  for (const id of ["gemini-3-pro", "gemini-2.5-pro-preview", "gemini-exp"]) assert.notEqual(tierOf(id), "sonnet", id);
  assert.equal(tierOf("gemini-3-pro"), "opus");
  assert.equal(tierOf("gpt-5-mini"), "sonnet");
});

test("a model no rule knows draws the Endministrator; no model draws nothing", () => {
  assert.equal(tierOf("some-new-model-9"), null);
  assert.deepEqual(poolFor("some-new-model-9"), ["endministrator"]);
  assert.equal(poolFor(null), null);
});

test("every pool names catalogued operators, once across all pools", () => {
  const pooled = Object.values(CASTING.pools).flat();
  assert.deepEqual(pooled.filter((s) => !catalogue.operators[s]), []);
  assert.equal(new Set(pooled).size, pooled.length);
  assert.ok(catalogue.operators[CASTING.fallback]);
});

// Three Opus sessions and an unknown-model codex, with the full pack.
const fleet = (pack, models, extraTerms = []) => {
  const listed = ["t1", "t2", "t3", "t4"].map((address, i) => ({ address, program: i === 3 ? codex : claude, status: "idle", title: address, space: "s1", space_name: "s1", tab: "x", tab_index: 1, pane: address, seq: i, pinned: false, focused: false }));
  const terms = [...listed.map((a, i) => ({ address: a.address, created_ms: i + 1, parent: null, state: "live", program: a.program })), ...extraTerms];
  return buildRoster({ listed, terms, spaces: [{ id: "s1", name: "s1" }], identity: identityOf(pack), models });
};
const full = { operators: everyone, defaults: catalogue.default_assignment };

test("agents with a known model draw distinct operators from their tier, in pool order", () => {
  const R = fleet(full, { t1: "claude-opus-5-5", t2: "claude-opus-5-5", t3: "claude-haiku-4-5" });
  assert.deepEqual(["t1", "t2", "t3", "t4"].map((a) => R.all.get(a).ident.callsign), ["LAEVATAIN", "YVONNE", "AKEKURI", "LAEVATAIN-2"],
    "t4 is codex with no model: its program default, Laevatain, already drawn, so a number");
});

test("a pool is spent before any callsign number", () => {
  const pool = CASTING.pools.haiku;
  const taken = new Set();
  const id = identityOf(full);
  const names = Array.from({ length: pool.length + 2 }, (_, i) => castCrew(id, null, [{ id: `a${i}`, ident: id.resolve(claude, null, { parent: claude, model: "claude-haiku-4-5" }), program: claude }], taken).get(`a${i}`).callsign);
  assert.deepEqual(names, ["AKEKURI", "ANTAL", "CATCHER", "ESTELLA", "FLUORITE", "AKEKURI-2", "ANTAL-2"]);
});

test("a pool draws only the operators the art pack has", () => {
  const R = fleet({ operators: ["perlica", "laevatain", "ember"], defaults: { claude: "perlica", shell: "ember" } }, { t1: "claude-opus-5-5", t2: "claude-opus-5-5", t3: "claude-haiku-4-5" });
  assert.deepEqual(["t1", "t2", "t3"].map((a) => R.all.get(a).ident.callsign), ["LAEVATAIN", "PERLICA", "PERLICA-2"],
    "the old 8-operator pack: Opus draws Laevatain then Perlica; no 4-star in the pack, so Haiku falls to the program default");
});

test("the person's overrides and terminal pins beat the model's tier", () => {
  const pack = { ...full, overrides: { claude: "ember" }, terminals: { t2: "si" } };
  const R = fleet(pack, { t1: "claude-opus-5-5", t2: "claude-opus-5-5" });
  assert.equal(R.all.get("t1").ident.callsign, "EMBER");
  assert.equal(R.all.get("t2").ident.callsign, "SI");
  assert.equal(R.all.get("t2").ident.pinned, true);
});

test("a same-program child with no model of its own draws from its parent's tier", () => {
  const R = fleet(full, { t1: "claude-sonnet-4-5" }, [{ address: "t9", created_ms: 9, parent: "t1", state: "live", program: claude }]);
  assert.equal(R.all.get("t9").model, "claude-sonnet-4-5");
  assert.equal(R.all.get("t9").ident.callsign, "AVYWENNA");
});

test("a session's sub-agents differ from each other and the fleet, and keep their draw while shown", () => {
  const id = identityOf(full);
  const R = fleet(full, { t1: "claude-opus-5-5" });
  const crew = (ids) => ids.map((k, i) => ({ id: k, startedAt: i, ident: id.resolve(claude, null, { parent: claude, model: "claude-opus-5-5" }), program: claude }));
  const first = castCrew(id, null, crew(["a1", "a2", "a3"]), new Set(R.taken));
  assert.deepEqual(["a1", "a2", "a3"].map((k) => first.get(k).callsign), ["YVONNE", "ARDELIA", "LAST RITE"], "t1 holds Laevatain, so its sub-agents start at Yvonne");
  const next = castCrew(id, first, crew(["a2", "a3", "a4"]), new Set([...R.taken, ...held([...first.values()])]));
  assert.equal(next.get("a2").callsign, "ARDELIA", "a sub-agent still shown keeps its operator");
  assert.equal(next.get("a4").callsign, "TYPHOEUS", "a newcomer skips every operator still held");
});

// Pane agents keep their operator across renders: `prev` is the last render's cast.
const panes = (addrs, models, prev, avoid, pack = full) => {
  const listed = addrs.map((address) => ({ address, program: claude, status: "idle", title: address, space: "s1", space_name: "s1", tab: "x", tab_index: 1, pane: address, seq: 0, pinned: false, focused: false }));
  const terms = listed.map((a) => ({ address: a.address, created_ms: Number(a.address.slice(1)), parent: null, state: "live", program: claude }));
  return buildRoster({ listed, terms, spaces: [{ id: "s1", name: "s1" }], identity: identityOf(pack), models, prev, avoid });
};
const callsigns = (R) => Object.fromEntries([...R.all].map(([a, m]) => [a, m.ident.callsign]));
const opus = "claude-opus-5-5";

test("a pane agent keeps its operator when an earlier agent closes", () => {
  const first = panes(["t1", "t2", "t3"], { t1: opus, t2: opus, t3: opus });
  assert.deepEqual(callsigns(first), { t1: "LAEVATAIN", t2: "YVONNE", t3: "ARDELIA" });
  const after = panes(["t2", "t3"], { t2: opus, t3: opus }, first.cast);
  assert.deepEqual(callsigns(after), { t2: "YVONNE", t3: "ARDELIA" });
  const joined = panes(["t2", "t3", "t4"], { t2: opus, t3: opus, t4: opus }, after.cast);
  assert.equal(joined.all.get("t4").ident.callsign, "LAEVATAIN", "a newcomer takes the first operator nobody keeps");
});

test("models arriving in any order move only the agent whose model arrived", () => {
  const none = panes(["t1", "t2"], {});
  assert.deepEqual(callsigns(none), { t1: "PERLICA", t2: "PERLICA-2" }, "no model yet: Claude's default");
  const t2First = panes(["t1", "t2"], { t2: opus }, none.cast);
  assert.deepEqual(callsigns(t2First), { t1: "PERLICA", t2: "LAEVATAIN" });
  const both = panes(["t1", "t2"], { t1: opus, t2: opus }, t2First.cast);
  assert.deepEqual(callsigns(both), { t1: "YVONNE", t2: "LAEVATAIN" });
});

test("a new model tier redraws; the same inputs again give the same cast", () => {
  const first = panes(["t1", "t2"], { t1: opus, t2: opus });
  const again = panes(["t1", "t2"], { t1: opus, t2: opus }, first.cast);
  assert.deepEqual(callsigns(again), callsigns(first), "every surface rebuilds from the shared cast and agrees");
  const moved = panes(["t1", "t2"], { t1: "claude-haiku-4-5", t2: opus }, first.cast);
  assert.deepEqual(callsigns(moved), { t1: "AKEKURI", t2: "YVONNE" });
});

test("a new pane agent avoids operators sub-agents hold; a kept one stays put", () => {
  const first = panes(["t1"], { t1: opus }, undefined, ["yvonne-1"]);
  assert.equal(first.all.get("t1").ident.callsign, "LAEVATAIN");
  const R = panes(["t1", "t2"], { t1: opus, t2: opus }, first.cast, ["laevatain-1", "yvonne-1"]);
  assert.deepEqual(callsigns(R), { t1: "LAEVATAIN", t2: "ARDELIA" });
  assert.ok(R.taken.has("yvonne-1"), "taken carries the avoided slots on to the sub-agents' draw");
});

test("a newly pinned agent takes its operator's bare callsign; only the agent that held it redraws", () => {
  const models = { t1: opus, t2: opus, t3: opus };
  const first = panes(["t1", "t2", "t3"], models);
  assert.deepEqual(callsigns(first), { t1: "LAEVATAIN", t2: "YVONNE", t3: "ARDELIA" });
  const pinned = panes(["t1", "t2", "t3"], models, first.cast, [], { ...full, terminals: { t1: "yvonne" } });
  assert.deepEqual(callsigns(pinned), { t1: "YVONNE", t2: "LAEVATAIN", t3: "ARDELIA" }, "t2 gave Yvonne up and drew the first operator free");
  const override = panes(["t1", "t2", "t3"], models, first.cast, [], { ...full, overrides: { claude: "ardelia" } });
  assert.equal(override.all.get("t1").ident.callsign, "ARDELIA", "an override that names an operator claims it the same way");
});
