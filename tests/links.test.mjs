import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLinks, withLink, withoutLink, withNoted, helperUntold, lifeOf, byLife, linkProblem, linkNotes, linkSteps, linkThenTell } from "../skin/mods/endfield/links.js";
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

test("a linked helper shows under its lead, while its hc parent stays unset", () => {
  const R = build(LISTED, TERMS, [link("t1@10", "t2@20")]);
  const s1 = R.squads.find((q) => q.id === "s1");
  assert.deepEqual(s1.members.map((m) => [m.address, m.depth]), [["t1", 0], ["t2", 1], ["t9", 1], ["t3", 0]], "the helper sorts among the lead's children");
  const b = R.all.get("t2");
  assert.equal(b.linked, "t1");
  assert.equal(b.parent, null, "the hc parent is hc's");
  assert.deepEqual(R.all.get("t1").kids, ["t9"], "kids are hc children only");
  assert.deepEqual(R.all.get("t1").helpers, ["t2"]);
  assert.equal(R.all.get("t1").urgency, 4, "a lead whose helper needs input sorts as needing input");
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
  assert.match(linkProblem(R.all, "t1", "t3"), /under it already/, "a lead can't become its own helper's helper");
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

test("each note sent is noted on the link, and only an untold helper is offered its note again", () => {
  let text = withLink(null, link("t1@10", "t2@20", { noted: { lead: false, helper: false } }), LIVES);
  text = withNoted(text, "t2@20", "lead", LIVES);
  const [l] = parseLinks(text);
  assert.deepEqual(l.noted, { lead: true, helper: false });
  assert.equal(helperUntold(l), true);
  assert.equal(helperUntold(parseLinks(withNoted(text, "t2@20", "helper", LIVES))[0]), false);
  assert.equal(helperUntold(link("t1@10", "t2@20")), false, "a link with no notes recorded offers nothing");
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

test("Confirm types the lead's note, then the helper's, each with hc send --if idle and never --force", () => {
  const steps = linkSteps(LEAD, HELPER);
  assert.deepEqual(steps.map((s) => s.hc.slice(0, 5)), [["send", "t1", "--if", "idle", "--"], ["send", "t2", "--if", "idle", "--"]]);
  assert.ok(steps.every((s) => !s.hc.includes("--force")));
});

const fake = (phases) => {
  const log = [];
  return {
    log,
    keep: async () => { log.push("keep"); return { ok: true }; },
    unkeep: async () => { log.push("unkeep"); return { ok: true }; },
    told: async (step) => { log.push(`told ${step.who}`); return { ok: true }; },
    send: async (step) => { log.push(step.hc[1]); return phases.shift(); },
  };
};
const STEPS = linkSteps(LEAD, HELPER);
const sent = { phase: "sent" }, refused = { phase: "refused", error: "not idle" };

test("the link is saved before anything is typed, and taken back when the lead refused", async () => {
  const ok = fake([sent, sent]);
  assert.deepEqual(await linkThenTell({ steps: STEPS, ...ok }), { phase: "sent", error: null, next: 2 });
  assert.deepEqual(ok.log, ["keep", "t1", "told lead", "t2", "told helper"]);
  const busy = fake([refused]);
  const r = await linkThenTell({ steps: STEPS, ...busy });
  assert.equal(r.phase, "refused");
  assert.equal(r.next, 0);
  assert.deepEqual(busy.log, ["keep", "t1", "unkeep"], "the helper is never told about a lead that wasn't");
  const noFile = fake([]);
  noFile.keep = async () => ({ ok: false, error: "disk" });
  assert.match((await linkThenTell({ steps: STEPS, ...noFile })).error, /Nothing was typed/);
  assert.deepEqual(noFile.log, []);
});

test("a helper that refused keeps the link, untold, and the retry types only its note", async () => {
  const first = fake([sent, refused]);
  const r = await linkThenTell({ steps: STEPS, ...first });
  assert.deepEqual([r.phase, r.next], ["refused", 1]);
  assert.deepEqual(first.log, ["keep", "t1", "told lead", "t2"], "the helper is not noted as told");
  const again = fake([sent]);
  assert.equal((await linkThenTell({ steps: STEPS, from: r.next, ...again })).phase, "sent");
  assert.deepEqual(again.log, ["t2", "told helper"], "no second save, no second note to the lead");
});

test("an uncertain helper send counts as told, so Send note again can't type it twice", async () => {
  const told = [];
  const r = await linkThenTell({
    steps: ["lead", "helper"], keep: async () => ({ ok: true }), unkeep: async () => ({ ok: true }),
    told: async (s) => { told.push(s); }, send: async (s) => ({ phase: s === "helper" ? "uncertain" : "sent", error: s === "helper" ? "timed out" : null }),
  });
  assert.equal(r.phase, "uncertain");
  assert.deepEqual(told, ["lead", "helper"]);
});
