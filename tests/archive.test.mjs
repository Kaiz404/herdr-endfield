import { test } from "node:test";
import assert from "node:assert/strict";
import {
  archiveRecord, parseArchive, withChat, withoutChat, withEnded, updateFile, resumeArgv, resumePlan, resumeState,
  canArchive, lifeKey, exitState, hideOf, withoutHide, isLeftover, keptHides, recordThenEnd, PICK_NOTE, squadPlan, squadEnd,
  spaceTerminals, unconfirmed, confirmedOf, killPhrase, exitSeen,
} from "../skin/mods/endfield/archive.js";

const ID = "session-a";
const claude = { key: "claude", name: "Claude Code", agent: true };
const shell = { key: "shell", name: "pwsh", agent: false, shell: true };

test("a Claude chat comes back by its session id, after the program's own command", () => {
  const chat = archiveRecord({ sessionId: ID, program: "claude", cwd: "/w", title: "fix login", terminal: "t3", created: 5, now: 100 });
  assert.equal(chat.pick, "exact");
  assert.equal(chat.ended, null, "a new record is archiving until the program is seen to end");
  assert.deepEqual(resumeArgv(chat, ["claude"]), ["claude", "--resume", ID]);
  assert.deepEqual(resumeArgv(chat, null), ["claude", "--resume", ID]);
  assert.equal(resumeState(chat, false).note, null);
});

test("a session id matched by folder is marked a guess, and Resume says so", () => {
  const chat = archiveRecord({ sessionId: ID, approx: true, program: "claude", terminal: "t3", now: 1 });
  assert.equal(chat.pick, "guess");
  assert.deepEqual(chat.resume, ["--resume", ID]);
  assert.match(resumeState(chat, false).note, /different chat/);
});

test("without a session id, or for Codex and Cursor, Resume says it takes the newest chat", () => {
  const bare = archiveRecord({ program: "claude", terminal: "t3", now: 1 });
  assert.deepEqual(bare.resume, ["--continue"]);
  assert.equal(resumeState(bare, false).note, PICK_NOTE.newest);
  const codex = archiveRecord({ program: "codex", terminal: "t4", now: 1 });
  assert.equal(codex.pick, "newest");
  assert.deepEqual(resumeArgv(codex, ["codex", "--no-daemon"]), ["codex", "--no-daemon", "resume", "--last"]);
  assert.deepEqual(resumeArgv(archiveRecord({ program: "cursor", terminal: "t5", now: 1 }), []), ["agent", "resume"]);
  assert.equal(canArchive("nvim"), false);
});

test("Resume runs exactly the argv the row draws, with the program's run argv from programs.json", () => {
  const chat = archiveRecord({ sessionId: ID, program: "claude", cwd: "/w", title: "fix login", space: "s1", terminal: "t3", now: 1 });
  const run = ["claude", "--dangerously-skip-permissions"];
  const plan = resumePlan(chat, run, [{ id: "s1", name: "auth" }]);
  assert.deepEqual(plan, {
    herdr: "tab.new", args: { name: "fix login", space: "s1", folder: "/w", argv: ["claude", "--dangerously-skip-permissions", "--resume", ID] }, where: "Into squad auth",
  });
});

test("a chat whose space was closed reopens in a new space of its squad's name, in its own folder", () => {
  const chat = archiveRecord({ sessionId: ID, program: "claude", cwd: "/w", title: "fix login", space: "s1", squad: "auth", terminal: "t3", now: 1 });
  const plan = resumePlan(chat, ["claude"], [{ id: "s2", name: "other" }], "/base");
  assert.equal(plan.herdr, "space.new");
  assert.deepEqual(plan.args, { name: "auth", tab: "fix login", folder: "/w", argv: ["claude", "--resume", ID], machine: "" });
  assert.equal(plan.where, "Into a new space, auth");
  // The second chat of that squad joins the space the first Resume made, not a second one.
  const later = resumePlan(chat, ["claude"], [{ id: "s2", name: "other" }, { id: "s9", name: "auth" }]);
  assert.deepEqual([later.herdr, later.args.space], ["tab.new", "s9"]);
  assert.equal(resumePlan(chat, ["claude"], [{ id: "s9", name: "auth", machine: "box" }]).herdr, "space.new", "a space of that name on another machine is not its squad");
});

test("a record with no folder opens in the home base on this computer, never on another machine", () => {
  const here = archiveRecord({ program: "codex", terminal: "t4", now: 1 });
  assert.equal(resumePlan(here, ["codex"], [], "/base").args.folder, "/base");
  const remote = archiveRecord({ program: "codex", machine: "box", terminal: "t4", now: 1 });
  const plan = resumePlan(remote, ["codex"], [], "/base");
  assert.equal(plan.args.folder, undefined);
  assert.equal(plan.args.machine, "box");
});

// A squad's space s1 with tabs a and b, and a second space s2. Fixture terminals as terminals() lists them.
const nvim = { key: "nvim", name: "Neovim", agent: true };
const node = { key: "node", name: "node", agent: false };
const SPACES = [{ id: "s1", tabs: [{ id: "a" }, { id: "b" }] }, { id: "s2", tabs: [{ id: "c" }] }];
const term = (address, extra = {}) => ({ address, created_ms: 100, state: "live", parent: null, program: claude, ...extra });
const squad = ({ terms, panes = [], listed = [] }) => spaceTerminals("s1", { spaces: SPACES, panes, listed, terms });
const pane = (terminal, tab, title = "") => ({ pane: `p-${terminal}`, terminal, tab, title });

test("everything that ends with the space is listed from Herdr's lists: agents, sub-agents, shells, servers, hidden shells", () => {
  const terms = [
    term("lead"),
    term("kid", { parent: "lead" }),
    term("grandkid", { parent: "kid", program: node }),
    term("srv", { program: node }),
    term("pwsh", { program: shell }),
    term("leftover", { program: shell }),
    term("tagged", { labels: { "herdr.space": "s1" } }),
    term("tabbed", { labels: ["herdr.tab=b"], program: shell }),
    term("other"),
    term("done", { state: "finished" }),
    term("moved", { labels: { "herdr.space": "s1" } }),
  ];
  const panes = [pane("lead", "a"), pane("srv", "a", "npm run dev"), pane("pwsh", "b"), pane("leftover", "b"), pane("other", "c"), pane("done", "a"), pane("moved", "c")];
  const got = squad({ terms, panes, listed: [{ address: "lead", space: "s1", program: claude, status: "idle" }] });
  assert.deepEqual(got.map((e) => [e.terminal, e.kind]), [
    ["lead", "agent"], ["kid", "sub-agent"], ["grandkid", "shell"], ["srv", "shell"], ["pwsh", "shell"], ["leftover", "shell"], ["tagged", "agent"], ["tabbed", "shell"],
  ], "a pane decides its space over a label, and a finished terminal ends nothing");
  assert.deepEqual(got.find((e) => e.terminal === "grandkid").depth, 2);
  assert.equal(got.find((e) => e.terminal === "srv").title, "npm run dev");
  assert.equal(got[0].life, "lead@100");
});

test("a remote space's labels name it without its machine", () => {
  const spaces = [{ id: "box/s1", tabs: [{ id: "box/a" }] }];
  const terms = [term("box/t1", { labels: { "herdr.space": "s1" } }), term("box/t2", { labels: { "herdr.tab": "a" } }), term("box/t3", { labels: { "herdr.space": "s9" } })];
  assert.deepEqual(spaceTerminals("box/s1", { spaces, panes: [], listed: [], terms }).map((e) => e.terminal), ["box/t1", "box/t2"]);
});

const member = (address, status, extra = {}) => ({ address, agent: { address }, program: claude, herdrStatus: status, title: `task ${address}`, label: "CLAUDE", ident: { callsign: address.toUpperCase() }, depth: 0, ...extra });

test("Archive squad takes every chat in tree order, pinned ones too, and starts only when all are idle", () => {
  const enders = squad({ terms: [term("pin"), term("lead"), term("kid", { parent: "lead" })], panes: [pane("pin", "a"), pane("lead", "a")] });
  const plan = squadPlan(enders, [member("lead", "idle"), member("kid", "idle", { agent: null, depth: 1 }), member("pin", "idle", { pinned: true })]);
  assert.deepEqual(plan.chats.map((c) => [c.terminal, c.depth, c.pinned]), [["lead", 0, false], ["kid", 1, false], ["pin", 0, true]]);
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual([plan.groups.agents.map((c) => c.name), plan.groups.subs.map((c) => c.name)], [["LEAD", "PIN"], ["KID"]]);
});

test("Archive squad refuses up front, naming each agent that isn't idle or can't be resumed", () => {
  const enders = squad({ terms: ["a", "b", "c", "d"].map((x) => term(x, x === "d" ? { program: nvim } : {})), panes: ["a", "b", "c", "d"].map((x) => pane(x, "a")) });
  const plan = squadPlan(enders, [member("a", "idle"), member("b", "working"), member("c", "done"), member("d", "idle", { program: nvim })]);
  assert.deepEqual(plan.blockers.map((b) => b.name), ["B", "C", "D"]);
  assert.match(plan.blockers[0].why, /Working/);
  assert.match(plan.blockers[1].why, /Finished/);
  assert.match(plan.blockers[2].why, /Neovim/);
  assert.ok(!plan.chats.some((c) => c.terminal === "d"), "a program nothing resumes is never archived");
});

test("a shell or server never blocks Archive squad: it is listed under what ends, never archived", () => {
  const enders = squad({ terms: [term("lead"), term("srv", { program: node }), term("old", { program: shell })], panes: [pane("lead", "a"), pane("srv", "a", "vite"), pane("old", "b")] });
  const plan = squadPlan(enders, [member("lead", "idle")]);
  assert.deepEqual(plan.chats.map((c) => c.terminal), ["lead"]);
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.groups.shells.map((c) => [c.name, c.title]), [["node srv", "vite"], ["pwsh old", ""]]);
});

test("an agent the roster doesn't show is still listed, and gated on Herdr's status", () => {
  const enders = squad({ terms: [term("orphan", { status: "working", labels: { "herdr.space": "s1" } })] });
  const plan = squadPlan(enders, []);
  assert.deepEqual(plan.groups.agents.map((c) => c.name), ["Claude Code"]);
  assert.match(plan.blockers[0].why, /Working/);
});

test("the Kills line counts and names every group that ends", () => {
  const who = (name) => ({ name });
  assert.equal(killPhrase({ agents: [who("A"), who("B")], subs: [who("C")], shells: [who("pwsh t9")] }), "2 agents (A, B), 1 sub-agent (C) and 1 shell or server (pwsh t9)");
  assert.equal(killPhrase({ agents: [], subs: [], shells: [who("x"), who("y")] }), "2 shells or servers (x, y)");
  assert.equal(killPhrase({ agents: [], subs: [], shells: [] }), "");
});

test("space.close waits for a fresh read that holds only what the person confirmed", () => {
  const terms = [term("lead"), term("srv", { program: node })];
  const panes = [pane("lead", "a"), pane("srv", "a")];
  const seen = squadPlan(squad({ terms, panes }), [member("lead", "idle")]);
  const confirmed = confirmedOf([...seen.groups.agents, ...seen.groups.subs, ...seen.groups.shells]);
  assert.deepEqual(unconfirmed(squad({ terms, panes }), confirmed), [], "nothing new: it closes");
  assert.deepEqual(unconfirmed(squad({ terms: [terms[0]], panes }), confirmed), [], "one that ended on its own is fine");

  const opened = unconfirmed(squad({ terms: [...terms, term("new")], panes: [...panes, pane("new", "b")] }), confirmed);
  assert.deepEqual(opened.map((e) => e.terminal), ["new"], "a new agent tab keeps the space");
  const kid = unconfirmed(squad({ terms: [...terms, term("kid", { parent: "lead", program: node })], panes }), confirmed);
  assert.deepEqual(kid.map((e) => e.terminal), ["kid"], "a server an agent started since keeps it too");
  const reborn = unconfirmed(squad({ terms: [term("lead", { created_ms: 900 }), terms[1]], panes }), confirmed);
  assert.deepEqual(reborn.map((e) => e.terminal), ["lead"], "a new terminal at a confirmed address is another life");
  const agentInShell = unconfirmed(squad({ terms: [terms[0], term("srv", { program: claude })], panes }), confirmed);
  assert.deepEqual(agentInShell.map((e) => e.terminal), ["srv"], "an agent started in a listed shell was never shown");
});

test("after Archive squad, an archived chat's terminal may only be a shell when the space closes", () => {
  const confirmed = [{ life: "lead@100", agent: null }];
  assert.deepEqual(unconfirmed(squad({ terms: [term("lead", { program: shell })], panes: [pane("lead", "a")] }), confirmed), []);
  assert.deepEqual(unconfirmed(squad({ terms: [term("lead")], panes: [pane("lead", "a")] }), confirmed).map((e) => e.terminal), ["lead"], "Claude Code started again in it");
});

test("the space closes only once every chat was seen to end", () => {
  assert.equal(squadEnd(["ended", "ended"]), "close");
  assert.equal(squadEnd(["ended", "watching"]), "wait");
  assert.equal(squadEnd(["ended", "sending", "queued"]), "wait");
  assert.equal(squadEnd(["ended", "running"]), "keep", "one still running after the wait keeps the space");
  assert.equal(squadEnd(["refused", "skipped"]), "keep", "a refusal stops the rest and keeps the space");
  assert.equal(squadEnd([]), "keep");
});

test("a chat still running can't be resumed: it would be opened twice", () => {
  const chat = archiveRecord({ sessionId: ID, program: "claude", terminal: "t3", now: 1 });
  const st = resumeState(chat, true);
  assert.equal(st.can, false);
  assert.match(st.note, /Still running in t3/);
});

test("the file keeps newest first, one record per session, and survives garbage", () => {
  let text = null;
  text = withChat(text, archiveRecord({ sessionId: ID, program: "claude", terminal: "t3", now: 1 }));
  text = withChat(text, archiveRecord({ sessionId: "session-b", program: "claude", terminal: "t4", now: 2 }));
  text = withChat(text, archiveRecord({ sessionId: ID, program: "claude", terminal: "t9", now: 3 }));
  assert.deepEqual(parseArchive(text).map((c) => [c.sessionId, c.archivedAt]), [[ID, 3], ["session-b", 2]]);
  assert.deepEqual(parseArchive(withoutChat(text, 3)).map((c) => c.archivedAt), [2]);
  assert.deepEqual(parseArchive(withEnded(text, 2, 50)).map((c) => c.ended), [null, 50]);
  assert.deepEqual(parseArchive("not json"), []);
  assert.deepEqual(parseArchive('{"chats":[{"archivedAt":"x"}]}'), []);
});

test("chats without a session id are never merged", () => {
  let text = withChat(null, archiveRecord({ program: "codex", terminal: "t3", now: 1 }));
  text = withChat(text, archiveRecord({ program: "codex", terminal: "t4", now: 2 }));
  assert.equal(parseArchive(text).length, 2);
});

// A file whose writes check the expected snapshot, like writeTextFile.
function file(initial) {
  const f = { text: initial, writes: 0, failNext: 0 };
  f.read = async () => f.text;
  f.write = async (text, expected) => {
    if (f.failNext > 0) { f.failNext--; f.text = withChat(f.text, archiveRecord({ sessionId: "other", program: "claude", terminal: "t8", now: 7 })); throw new Error("stale snapshot"); }
    if (expected !== f.text) throw new Error("stale snapshot");
    f.text = text;
    f.writes++;
    return null;
  };
  return f;
}

test("a stale snapshot is read again and the record merged with what the other window wrote", async () => {
  const f = file(null);
  f.failNext = 1;
  const chat = archiveRecord({ sessionId: ID, program: "claude", terminal: "t3", now: 9 });
  const r = await updateFile({ read: f.read, write: f.write, change: (t) => withChat(t, chat) });
  assert.deepEqual(r, { ok: true, error: null });
  assert.deepEqual(parseArchive(f.text).map((c) => c.sessionId), [ID, "other"], "the other window's record survives");
});

test("a second stale snapshot is reported, not retried forever", async () => {
  const f = file(null);
  f.failNext = 2;
  const r = await updateFile({ read: f.read, write: f.write, change: (t) => withChat(t, archiveRecord({ program: "codex", terminal: "t3", now: 1 })) });
  assert.equal(r.ok, false);
  assert.match(r.error, /stale/);
  assert.equal(f.writes, 0);
});

test("Archive writes the record, taken before anything is typed, then sends the end command", async () => {
  const f = file(null);
  const chat = archiveRecord({ sessionId: ID, program: "claude", cwd: "/w", title: "fix login", space: "s1", terminal: "t3", created: 100, now: 9 });
  const seen = [];
  const r = await recordThenEnd({
    chat,
    update: (change) => updateFile({ read: f.read, write: async (t, e) => { seen.push("write"); return f.write(t, e); }, change }),
    // The card's agent is gone by the time /exit lands; the record already holds what it knew.
    send: async () => { seen.push(["send", parseArchive(f.text)[0]]); return { phase: "sent" }; },
  });
  assert.equal(r.phase, "sent");
  assert.deepEqual(seen, ["write", ["send", chat]], "the full record is on disk before the send");
});

test("no record, no end: a failed write sends nothing", async () => {
  const f = file(null);
  f.failNext = 2;
  let sent = false;
  const r = await recordThenEnd({
    chat: archiveRecord({ sessionId: ID, program: "claude", terminal: "t3", now: 9 }),
    update: (change) => updateFile({ read: f.read, write: f.write, change }),
    send: async () => { sent = true; return { phase: "sent" }; },
  });
  assert.equal(sent, false);
  assert.equal(r.phase, "refused");
  assert.match(r.error, /Nothing was typed/);
});

test("a refused /exit typed nothing, so its record comes back out", async () => {
  const f = file(withChat(null, archiveRecord({ sessionId: "kept", program: "claude", terminal: "t1", now: 1 })));
  const r = await recordThenEnd({
    chat: archiveRecord({ sessionId: ID, program: "claude", terminal: "t3", now: 9 }),
    update: (change) => updateFile({ read: f.read, write: f.write, change }),
    send: async () => ({ phase: "refused", error: "t3 is done, not idle" }),
  });
  assert.equal(r.phase, "refused");
  assert.deepEqual(parseArchive(f.text).map((c) => c.sessionId), ["kept"]);
});

test("an uncertain send keeps the record: it may have been typed", async () => {
  const f = file(null);
  const r = await recordThenEnd({
    chat: archiveRecord({ sessionId: ID, program: "claude", terminal: "t3", now: 9 }),
    update: (change) => updateFile({ read: f.read, write: f.write, change }),
    send: async () => ({ phase: "uncertain", error: "hc did not answer" }),
  });
  assert.equal(r.phase, "uncertain");
  assert.equal(parseArchive(f.text).length, 1);
});

test("hc send exiting 0 is not the end: the chat is running until Herdr shows it stopped", () => {
  const chat = archiveRecord({ sessionId: ID, program: "claude", terminal: "t3", created: 100, now: 1 });
  const terms = (program) => [{ address: "t3", created_ms: 100, state: "live", program }];
  assert.equal(exitState(chat, [{ address: "t3", program: claude }], terms(claude)), "running", "typed, still listed");
  assert.equal(exitState(chat, [], terms(claude)), "running", "agents() missed it, but its terminal still runs Claude Code");
  assert.equal(exitState(chat, [{ address: "t3", program: claude }], terms(shell)), "running", "agents() still lists it");
  assert.equal(exitState(chat, [], terms(shell)), "ended", "its terminal runs a shell now");
  assert.equal(exitState(chat, [{ address: "t3", program: shell }], terms(shell)), "ended");
  assert.equal(exitState(chat, [], [{ address: "t3", created_ms: 100, state: "finished", program: claude }]), "ended", "its terminal finished");
  assert.equal(exitState(chat, [{ address: "t3", program: claude }], [{ address: "t3", created_ms: 900, state: "live", program: claude }]), "ended", "a new terminal took the address");
  assert.equal(exitState(chat, [], []), "gone", "missing from one read is not an end");
  assert.equal(exitState(chat, [], [{ address: "t3", created_ms: 100, state: "live" }]), "gone", "listed with no program yet says nothing");
});

test("a watcher calls it ended on a positive sign, or once it is missing from two reads in a row", () => {
  assert.equal(exitSeen(null, "ended"), true);
  assert.equal(exitSeen("running", "ended"), true);
  assert.equal(exitSeen(null, "gone"), false, "the first read without it");
  assert.equal(exitSeen("running", "gone"), false, "a list caught mid-update");
  assert.equal(exitSeen("gone", "gone"), true, "the second read in a row");
  assert.equal(exitSeen("gone", "running"), false, "it came back");
  // A watcher's reads, one per second: a single gap never ends it.
  const watch = (reads) => { let prev = null; for (const [i, r] of reads.entries()) { if (exitSeen(prev, r)) return i; prev = r; } return -1; };
  assert.equal(watch(["running", "gone", "running", "gone", "running"]), -1);
  assert.equal(watch(["running", "gone", "gone"]), 2);
});

test("a pane-less child is running while its live terminal runs the program", () => {
  const chat = archiveRecord({ sessionId: ID, program: "claude", terminal: "t5", created: 100, now: 1 });
  assert.equal(exitState(chat, [], [{ address: "t5", created_ms: 100, state: "live", parent: "t1", program: claude }]), "running");
  assert.equal(exitState(chat, [], [{ address: "t5", created_ms: 100, state: "finished", parent: "t1", program: claude }]), "ended");
});

test("a hide covers only the leftover shell of that terminal's life, and goes once an agent starts there", () => {
  const chat = archiveRecord({ sessionId: ID, program: "claude", terminal: "t3", created: 100, now: 1 });
  const hides = [hideOf(chat)];
  assert.equal(isLeftover(hides, "t3", 100, shell), true);
  assert.equal(isLeftover(hides, "t3", 100, claude), false, "a new agent in the same shell tab shows");
  assert.equal(isLeftover(hides, "t3", 900, shell), false, "a new terminal at the address shows");
  assert.deepEqual(keptHides(hides, [{ address: "t3", created_ms: 100, program: shell }]), hides);
  assert.deepEqual(keptHides(hides, [{ address: "t3", created_ms: 100, program: { key: "codex", agent: true } }]), [], "dropped once an agent runs there");
  assert.deepEqual(keptHides(hides, []), [], "dropped once the terminal is gone");
  assert.deepEqual(keptHides(["t3@100", null], [{ address: "t3", created_ms: 100, program: shell }]), [], "the old string form is ignored");
});

test("Resume clears the chat's hide and no other", () => {
  const a = archiveRecord({ sessionId: ID, program: "claude", terminal: "t3", created: 100, now: 1 });
  const b = archiveRecord({ sessionId: "b", program: "claude", terminal: "t4", created: 200, now: 2 });
  assert.deepEqual(withoutHide([hideOf(a), hideOf(b)], a), [hideOf(b)]);
});

test("a terminal's life is its address and start time", () => {
  assert.notEqual(lifeKey("t3", 1), lifeKey("t3", 2));
});
