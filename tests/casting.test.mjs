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
  assert.deepEqual(["t1", "t2", "t3", "t4"].map((a) => R.all.get(a).ident.callsign), ["LAEVATAIN", "YVONNE", "AKEKURI", "LAEVATAIN·2"],
    "t4 is codex with no model: its program default, Laevatain, already drawn, so a number");
});

test("a pool is spent before any callsign number", () => {
  const pool = CASTING.pools.haiku;
  const taken = new Set();
  const id = identityOf(full);
  const names = Array.from({ length: pool.length + 2 }, (_, i) => castCrew(id, null, [{ id: `a${i}`, ident: id.resolve(claude, null, { parent: claude, model: "claude-haiku-4-5" }) }], claude, taken).get(`a${i}`).callsign);
  assert.deepEqual(names, ["AKEKURI", "ANTAL", "CATCHER", "ESTELLA", "FLUORITE", "AKEKURI·2", "ANTAL·2"]);
});

test("a pool draws only the operators the art pack has", () => {
  const R = fleet({ operators: ["perlica", "laevatain", "ember"], defaults: { claude: "perlica", shell: "ember" } }, { t1: "claude-opus-5-5", t2: "claude-opus-5-5", t3: "claude-haiku-4-5" });
  assert.deepEqual(["t1", "t2", "t3"].map((a) => R.all.get(a).ident.callsign), ["LAEVATAIN", "PERLICA", "PERLICA·2"],
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
  const crew = (ids) => ids.map((k, i) => ({ id: k, startedAt: i, ident: id.resolve(claude, null, { parent: claude, model: "claude-opus-5-5" }) }));
  const first = castCrew(id, null, crew(["a1", "a2", "a3"]), claude, new Set(R.taken));
  assert.deepEqual(["a1", "a2", "a3"].map((k) => first.get(k).callsign), ["YVONNE", "ARDELIA", "LAST RITE"], "t1 holds Laevatain, so its sub-agents start at Yvonne");
  const next = castCrew(id, first, crew(["a2", "a3", "a4"]), claude, new Set([...R.taken, ...held([...first.values()])]));
  assert.equal(next.get("a2").callsign, "ARDELIA", "a sub-agent still shown keeps its operator");
  assert.equal(next.get("a4").callsign, "TYPHOEUS", "a newcomer skips every operator still held");
});
