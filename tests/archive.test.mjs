import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveRecord, parseArchive, withChat, withoutChat, resumeArgv, canArchive, lifeKey } from "../skin/mods/endfield/archive.js";

const ID = "session-a";

test("a Claude chat comes back by its session id, after the program's own command", () => {
  const chat = archiveRecord({ sessionId: ID, program: "claude", cwd: "/w", title: "fix login", terminal: "t3", created: 5, now: 100 });
  assert.equal(chat.approx, false);
  assert.deepEqual(resumeArgv(chat, ["claude"]), ["claude", "--resume", ID]);
  assert.deepEqual(resumeArgv(chat, null), ["claude", "--resume", ID]);
});

test("without a session id, or for Codex and Cursor, Resume says it takes the newest chat", () => {
  assert.deepEqual(archiveRecord({ program: "claude", terminal: "t3", now: 1 }).resume, ["--continue"]);
  const codex = archiveRecord({ program: "codex", terminal: "t4", now: 1 });
  assert.equal(codex.approx, true);
  assert.deepEqual(resumeArgv(codex, ["codex", "--no-daemon"]), ["codex", "--no-daemon", "resume", "--last"]);
  assert.deepEqual(resumeArgv(archiveRecord({ program: "cursor", terminal: "t5", now: 1 }), []), ["agent", "resume"]);
  assert.equal(canArchive("nvim"), false);
});

test("the file keeps newest first, one record per session, and survives garbage", () => {
  let text = null;
  text = withChat(text, archiveRecord({ sessionId: ID, program: "claude", terminal: "t3", now: 1 }));
  text = withChat(text, archiveRecord({ sessionId: "session-b", program: "claude", terminal: "t4", now: 2 }));
  text = withChat(text, archiveRecord({ sessionId: ID, program: "claude", terminal: "t9", now: 3 }));
  assert.deepEqual(parseArchive(text).map((c) => [c.sessionId, c.archivedAt]), [[ID, 3], ["session-b", 2]]);
  assert.deepEqual(parseArchive(withoutChat(text, 3)).map((c) => c.archivedAt), [2]);
  assert.deepEqual(parseArchive("not json"), []);
  assert.deepEqual(parseArchive('{"chats":[{"archivedAt":"x"}]}'), []);
});

test("chats without a session id are never merged", () => {
  let text = withChat(null, archiveRecord({ program: "codex", terminal: "t3", now: 1 }));
  text = withChat(text, archiveRecord({ program: "codex", terminal: "t4", now: 2 }));
  assert.equal(parseArchive(text).length, 2);
});

test("a terminal's life is its address and start time", () => {
  assert.notEqual(lifeKey("t3", 1), lifeKey("t3", 2));
});
