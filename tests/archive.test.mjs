import { test } from "node:test";
import assert from "node:assert/strict";
import {
  archiveRecord, parseArchive, withChat, withoutChat, withEnded, updateFile, resumeArgv, resumeTab, resumeState,
  canArchive, lifeKey, exitState, hideOf, withoutHide, isLeftover, keptHides, recordThenEnd, PICK_NOTE,
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
  assert.deepEqual(resumeTab(chat, run, ["s1"]), { name: "fix login", space: "s1", folder: "/w", argv: ["claude", "--dangerously-skip-permissions", "--resume", ID] });
  assert.equal(resumeTab(chat, run, ["s2"]).space, undefined, "a space that is gone opens in the shown one");
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

test("hc send exiting 0 is not the end: the chat is running until Herdr stops listing it", () => {
  const chat = archiveRecord({ sessionId: ID, program: "claude", terminal: "t3", created: 100, now: 1 });
  const terms = (program) => [{ address: "t3", created_ms: 100, state: "live", program }];
  assert.equal(exitState(chat, [{ address: "t3", program: claude }], terms(claude)), "running", "typed, still listed");
  assert.equal(exitState(chat, [], terms(shell)), "ended", "agents() no longer has it");
  assert.equal(exitState(chat, [{ address: "t3", program: shell }], terms(shell)), "ended", "its program is a shell now");
  assert.equal(exitState(chat, [], []), "ended", "its terminal is gone");
  assert.equal(exitState(chat, [{ address: "t3", program: claude }], [{ address: "t3", created_ms: 900, state: "live", program: claude }]), "ended", "a new terminal took the address");
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
