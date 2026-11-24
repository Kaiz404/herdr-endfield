import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLinks, withLink, withoutLink, withNoted, untold, lifeOf, byLife, linkProblem, linkedWith, linkNotes, linkSteps, linkThenTell, tell, outcome } from "../skin/mods/endfield/links.js";
import { buildRoster, BY } from "../skin/mods/endfield/fleet.js";
import { identityOf } from "./identity.mjs";

const identity = identityOf({ defaults: { claude: "perlica" }, operators: ["perlica"], spares: [] });
const claude = { key: "claude", name: "Claude Code", agent: true };
const codex = { key: "codex", name: "Codex", agent: true };
const spaces = [{ id: "s1", name: "one" }, { id: "s2", name: "two" }];
const agent = (address, space, status = "idle", extra = {}) => ({ address, program: claude, status, title: `task of ${address}`, space, space_name: space, tab: `${space}-${address}`, tab_index: 1, pane: `p-${address}`, seq: 1, pinned: false, focused: false, ...extra });
const term = (address, created, parent = null, extra = {}) => ({ address, created_ms: created, parent, state: "live", program: claude, ...extra });
const SESSIONS = { t1: "S1", t2: "S2", t3: "S3", t5: "S5", "box/t6": "S6" };
const build = (listed, terms, links = [], sessions = SESSIONS) => buildRoster({ listed, terms, spaces, identity, sort: BY.order, links, sessions });

const LISTED = [agent("t1", "s1"), agent("t2", "s1", "blocked"), agent("t3", "s1"), agent("t5", "s2")];
const TERMS = [term("t1", 10), term("t2", 20), term("t3", 30), term("t5", 50), term("t9", 90, "t1")];
const SID = { "t1@10": "S1", "t2@20": "S2", "t3@30": "S3", "t5@50": "S5", "t9@90": null };
const link = (a, b, extra = {}) => ({ a, b, sa: SID[a], sb: SID[b], at: 1, ...extra });

test("linked agents show as peers: both top-level, the helper right after its lead's block", () => {
  const R = build(LISTED, TERMS, [link("t1@10", "t3@30")]);
  const s1 = R.squads.find((q) => q.id === "s1");
  assert.deepEqual(s1.members.map((m) => [m.address, m.depth, m.group]), [["t1", 0, "t1"], ["t9", 1, null], ["t3", 0, "t1"], ["t2", 0, null]],
    "the lead keeps its own sub-agent, and t2 (tab order before t3) waits until the group ends");
  const b = R.all.get("t3");
  assert.equal(b.linked, "t1");
  assert.equal(b.parent, null, "the hc parent is hc's");
  assert.deepEqual(R.all.get("t1").kids, ["t9"], "kids are hc children only");
  assert.deepEqual(R.all.get("t1").helpers, ["t3"]);
  assert.deepEqual(linkedWith(R.all.get("t1")), ["t3"]);
  assert.deepEqual(linkedWith(b), ["t1"]);
});

test("in Priority a linked group sorts as urgent as its most urgent member, and stays together", () => {
  const R = buildRoster({ listed: LISTED, terms: TERMS, spaces, identity, sort: BY.priority, links: [link("t1@10", "t3@30")], sessions: SESSIONS });
  const blocked = buildRoster({ listed: LISTED.map((a) => (a.address === "t3" ? { ...a, status: "blocked" } : a)), terms: TERMS, spaces, identity, sort: BY.priority, links: [link("t1@10", "t3@30")], sessions: SESSIONS });
  const tops = (X) => X.squads.find((q) => q.id === "s1").members.filter((m) => m.depth === 0).map((m) => m.address);
  assert.deepEqual(tops(R), ["t2", "t1", "t3"], "t2 needs input, so it leads");
  assert.deepEqual(tops(blocked), ["t1", "t3", "t2"], "the helper needs input: its group leads, lead first");
});

test("a lead's helpers follow it in one group, a helper's own helper right after it", () => {
  const R = build(LISTED, TERMS, [link("t1@10", "t3@30"), link("t3@30", "t2@20")]);
  const s1 = R.squads.find((q) => q.id === "s1");
  assert.deepEqual(s1.members.map((m) => [m.address, m.group]), [["t1", "t1"], ["t9", null], ["t3", "t1"], ["t2", "t1"]]);
});

test("a link between a pinned and an unpinned agent groups nothing: each stays in its squad", () => {
  const R = build(LISTED.map((a) => (a.address === "t3" ? { ...a, pinned: true } : a)), TERMS, [link("t1@10", "t3@30")]);
  assert.deepEqual(R.squads.map((q) => [q.id, q.members.map((m) => [m.address, m.group])]),
    [["pinned", [["t3", null]]], ["s1", [["t1", null], ["t9", null], ["t2", null]]], ["s2", [["t5", null]]]]);
  assert.equal(R.all.get("t3").linked, "t1", "still linked: its glyph and card say so");
});

test("a link drops when either terminal ends, or when its address comes back in a new life", () => {
  assert.equal(build(LISTED.filter((a) => a.address !== "t1"), TERMS, [link("t1@10", "t2@20")]).all.get("t2").linked, null);
  const reborn = [term("t1", 11), term("t2", 20), term("t3", 30)];
  assert.equal(build(LISTED, reborn, [link("t1@10", "t2@20")]).all.get("t2").linked, null);
});

test("a link drops when a new session, or another program, starts in either shell", () => {
  const L = [link("t1@10", "t2@20")];
  assert.equal(build(LISTED, TERMS, L, { ...SESSIONS, t2: "S2-new" }).all.get("t2").linked, null, "a new Claude Code session in the helper's shell");
  assert.equal(build(LISTED, TERMS, L, { ...SESSIONS, t1: "S1-new" }).all.get("t2").linked, null, "a new Claude Code session in the lead's shell");
  const codexLead = LISTED.map((a) => (a.address === "t1" ? { ...a, program: codex } : a));
  assert.equal(build(codexLead, TERMS, L, { t2: "S2" }).all.get("t2").linked, null, "Codex in the lead's shell");
  assert.equal(build(LISTED, TERMS, L, {}).all.get("t2").linked, "t1", "a session not read yet keeps it");
});

test("a link across spaces is left out, so the helper stays in its own squad and Report", () => {
  const R = build(LISTED, TERMS, [link("t1@10", "t5@50")]);
  assert.equal(R.all.get("t5").linked, null);
  assert.deepEqual(R.squads.find((q) => q.id === "s2").members.map((m) => m.address), ["t5"]);
});

test("a link that would nest an agent inside its own tree, or give an hc child a second parent, is left out", () => {
  const R = build(LISTED, TERMS, [link("t1@10", "t3@30"), link("t3@30", "t1@10"), link("t3@30", "t9@90")]);
  assert.equal(R.all.get("t3").linked, "t1");
  assert.equal(R.all.get("t1").linked, null);
  assert.equal(R.all.get("t9").linked, null);
  assert.equal(R.all.get("t9").parent, "t1");
});

test("a drop links only two Claude Code sessions in one squad on one machine, and only a helper with no lead yet", () => {
  const R = build(
    [...LISTED, agent("t4", "s1", "idle", { program: codex }), agent("box/t6", "s1"), agent("t7", "s1")],
    [...TERMS, term("t4", 40), term("box/t6", 60), term("t7", 70)],
    [link("t1@10", "t3@30")],
  );
  assert.equal(linkProblem(R.all, "t2", "t1"), null);
  assert.equal(linkProblem(R.all, "t1", "t2"), null);
  assert.match(linkProblem(R.all, "t2", "t2"), /another agent/);
  assert.match(linkProblem(R.all, "t4", "t1"), /Claude Code/);
  assert.match(linkProblem(R.all, "box/t6", "t1"), /same machine/);
  assert.equal(linkProblem(R.all, "t5", "t1"), "Link agents in the same squad. Drag one onto the other's squad first.");
  assert.match(linkProblem(R.all, "t7", "t1"), /sessions show/, "a link is keyed to a session, so one not read yet can't be linked");
  assert.match(linkProblem(R.all, "t9", "t2"), /sub-agent of t1/);
  assert.match(linkProblem(R.all, "t3", "t1"), /already linked/);
  assert.match(linkProblem(R.all, "t3", "t2"), /helper of t1/);
  assert.match(linkProblem(R.all, "t1", "t3"), /already joined/, "a lead can't become its own helper's helper");
  assert.equal(linkProblem(R.all, "t1", "gone") != null, true);
});

const LIVES = byLife(build(LISTED, TERMS).all.values());

test("links.json drops at each write the links that no longer stand", () => {
  const text = withLink(JSON.stringify({ links: [link("t8@80", "t1@10"), link("t1@10", "t5@50"), { ...link("t3@30", "t2@20"), sb: "old" }] }), link("t1@10", "t3@30"), LIVES);
  assert.deepEqual(parseLinks(text), [link("t1@10", "t3@30")], "an ended lead's, a cross-space and a past session's link went at the write");
  assert.deepEqual(parseLinks(withoutLink(text, "t3@30", LIVES)), []);
  assert.deepEqual(parseLinks("not json"), []);
  assert.equal(lifeOf({ address: "t1", created: 10 }), "t1@10");
});

test("a helper another window already linked is refused, never moved to a second lead", () => {
  const theirs = withLink(null, link("t1@10", "t2@20"), LIVES);
  assert.throws(() => withLink(theirs, link("t3@30", "t2@20"), LIVES), /already a helper of t1.*Unlink it first/);
  assert.deepEqual(parseLinks(withLink(theirs, link("t1@10", "t2@20", { at: 2 }), LIVES)).map((l) => l.at), [2], "linking it to the same lead again is the same link");
  const ended = JSON.stringify({ links: [link("t8@80", "t2@20")] });
  assert.deepEqual(parseLinks(withLink(ended, link("t3@30", "t2@20"), LIVES)).map((l) => l.a), ["t3@30"], "a lead whose terminal ended doesn't hold it");
});

test("each note sent is noted on the link, and each untold side, lead or helper, is offered Send note on its own card", () => {
  let text = withLink(null, link("t1@10", "t2@20", { noted: { lead: false, helper: false } }), LIVES);
  assert.deepEqual(untold(parseLinks(text), "t1@10"), [{ side: "lead", lead: "t1", helper: "t2" }]);
  assert.deepEqual(untold(parseLinks(text), "t2@20"), [{ side: "helper", lead: "t1", helper: "t2" }]);
  text = withNoted(text, "t2@20", "lead", LIVES);
  assert.deepEqual(parseLinks(text)[0].noted, { lead: true, helper: false });
  assert.deepEqual(untold(parseLinks(text), "t1@10"), [], "a told lead is offered nothing");
  assert.equal(untold(parseLinks(text), "t2@20").length, 1);
  assert.deepEqual(untold(parseLinks(withNoted(text, "t2@20", "helper", LIVES)), "t2@20"), []);
  assert.deepEqual(untold([link("t1@10", "t2@20")], "t2@20"), [], "a link with no notes recorded offers nothing");
  assert.deepEqual(untold([link("t1@10", "t2@20", { noted: { lead: false, helper: true } }), link("t1@10", "t3@30", { noted: { lead: false, helper: true } })], "t1@10").map((n) => n.helper), ["t2", "t3"], "a lead owed two notes gets one per helper");
});

const LEAD = { address: "t1", label: "CLAUDE", title: "fix the\nlogin flow", cwd: "C:/work/app" };
const HELPER = { address: "t2", label: "CLAUDE", title: "write tests", cwd: "C:/work/app-tests" };

test("each note names the other by folder and task, points at SendMessage, and agrees on files", () => {
  const n = linkNotes(LEAD, HELPER);
  for (const [text, other] of [[n.lead, HELPER], [n.helper, LEAD]]) {
    assert.ok(!/[\r\n]/.test(text), "one line, so hc's enter sends all of it");
    assert.ok(text.includes(other.cwd) && text.includes(oneLine(other.title)), "ListAgents can find it by folder or task");
    assert.match(text, /ListAgents/);
    assert.match(text, /SendMessage/);
    assert.match(text, /notify_when_idle/);
    assert.match(text, /owns which files|worktrees/);
    assert.ok(!/hc send|hc wait/.test(text), "hc is not the channel");
    assert.ok(text.includes(`hc read ${other.address}`), "hc read stays as a fallback to watch the other's screen");
  }
  assert.match(n.lead, /as your helper/);
  assert.match(n.helper, /as a helper of/);
});

const oneLine = (s) => s.replace(/\s+/g, " ").trim();

test("each note is one hc send --if idle line, never --force", () => {
  const steps = linkSteps(LEAD, HELPER);
  assert.deepEqual(steps.map((s) => s.hc.slice(0, 5)), [["send", "t1", "--if", "idle", "--"], ["send", "t2", "--if", "idle", "--"]]);
  assert.ok(steps.every((s) => !s.hc.includes("--force")));
});

const fake = (phases, idle = { lead: true, helper: true }) => {
  const log = [];
  return {
    log,
    idle: (who) => idle[who],
    keep: async () => { log.push("keep"); return { ok: true }; },
    told: async (step) => { log.push(`told ${step.who}`); return { ok: true }; },
    send: async (step) => { log.push(step.hc[1]); return phases.shift(); },
  };
};
const STEPS = linkSteps(LEAD, HELPER);
const sent = { phase: "sent" }, refused = { phase: "refused", error: "not idle" };
const NAMES = { lead: "PERLICA", helper: "TYPHOEUS" };

test("Link saves first, then types both notes when both are idle", async () => {
  const ok = fake([sent, sent]);
  const r = await linkThenTell({ steps: STEPS, ...ok });
  assert.deepEqual(r.out, { lead: "sent", helper: "sent" });
  assert.deepEqual(ok.log, ["keep", "t1", "told lead", "t2", "told helper"]);
  assert.equal(outcome({ ...r, names: NAMES }), "Linked. Both agents have their note.");
});

test("a busy agent doesn't block Link: the link is saved and nothing is typed into a working agent", async () => {
  const both = fake([], { lead: false, helper: false });
  const r = await linkThenTell({ steps: STEPS, ...both });
  assert.equal(r.ok, true);
  assert.deepEqual(both.log, ["keep"], "saved, nothing typed, nothing noted told");
  assert.deepEqual(r.out, { lead: "busy", helper: "busy" });
  assert.equal(outcome({ ...r, names: NAMES }), "Linked. PERLICA and TYPHOEUS are busy. Send each note from its card when it's free.");

  const helperBusy = fake([sent], { lead: true, helper: false });
  const h = await linkThenTell({ steps: STEPS, ...helperBusy });
  assert.deepEqual(helperBusy.log, ["keep", "t1", "told lead"], "only the idle lead is typed into");
  assert.equal(outcome({ ...h, names: NAMES }), "Linked. TYPHOEUS is busy. Send its note from its card when it's free.");

  const leadBusy = fake([sent], { lead: false, helper: true });
  await linkThenTell({ steps: STEPS, ...leadBusy });
  assert.deepEqual(leadBusy.log, ["keep", "t2", "told helper"], "a busy lead doesn't hold back the helper's note");
});

test("an agent hc refuses (it stopped being idle) is left untold, and the link stays", async () => {
  const f = fake([refused, sent]);
  const r = await linkThenTell({ steps: STEPS, ...f });
  assert.deepEqual(f.log, ["keep", "t1", "t2", "told helper"]);
  assert.deepEqual(r.out, { lead: "busy", helper: "sent" });
});

test("a link that can't be saved types nothing", async () => {
  const noFile = fake([]);
  noFile.keep = async () => ({ ok: false, error: "disk" });
  const r = await linkThenTell({ steps: STEPS, ...noFile });
  assert.equal(r.ok, false);
  assert.match(r.error, /Nothing was typed/);
  assert.deepEqual(noFile.log, []);
});

test("an uncertain send counts as told, so Send note can't type it twice", async () => {
  const f = fake([{ phase: "uncertain", error: "timed out" }, sent]);
  const r = await linkThenTell({ steps: STEPS, ...f });
  assert.deepEqual(f.log, ["keep", "t1", "told lead", "t2", "told helper"]);
  assert.match(outcome({ ...r, names: NAMES }), /^Linked\. PERLICA may not have its note \(timed out\)\.$/);
});

test("Send note types only that side's note, only while it is idle, and saves nothing new", async () => {
  const helperOnly = STEPS.filter((s) => s.who === "helper");
  const f = fake([sent]);
  const r = await tell({ steps: helperOnly, ...f });
  assert.deepEqual(f.log, ["t2", "told helper"]);
  assert.equal(outcome({ ...r, names: NAMES, linked: false }), "Sent. TYPHOEUS has its note.");
  const late = fake([], { lead: true, helper: false });
  const l = await tell({ steps: helperOnly, ...late });
  assert.deepEqual(late.log, []);
  assert.match(outcome({ ...l, names: NAMES, linked: false }), /TYPHOEUS isn't idle any more\. Nothing was typed/);
});

test("a note that went in but couldn't be recorded says so, so it isn't sent twice", async () => {
  let calls = 0;
  const r = await tell({ steps: [{ who: "lead" }], idle: () => true, send: async () => ({ phase: "sent" }), told: async () => { calls++; return { ok: false }; } });
  assert.equal(r.out.lead, "sent");
  assert.equal(calls, 2);
  assert.match(r.errors.lead, /don't send it again/);
});
