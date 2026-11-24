// archive: the chats the person archived from the session card, and how each comes back. No Herdr
// in it (tests/archive.test.mjs runs it in node); actions.js reads and writes the file.
// data/endfield/archive.json = {chats: Chat[]}, newest first, at most CAP.
// Chat = {sessionId | null, program, cwd, title, space, terminal, created, archivedAt, ended, resume: string[], pick}
//   ended: null while the program was told to end and hasn't been seen to (archiving), else when it was.
//   resume: the arguments after the program's own command (programs.json `run`), so Codex keeps --no-daemon.
//   pick: which chat the arguments reopen. "exact" (the session id is known), "guess" (the id was
//   matched by folder, so it may be another chat there), "newest" (the newest chat, not this one).
// Hide = {life, program}: an archived chat's terminal, left behind once its program ended, kept out of Squads.

const CAP = 100;

// Claude Code resumes by session id. Codex and Cursor sessions aren't read by this skin, so their newest chat comes back.
// `bin` starts it when programs.json can't be asked.
const RESUME = {
  claude: { bin: "claude", args: (id, approx) => (id ? { resume: ["--resume", id], pick: approx ? "guess" : "exact" } : { resume: ["--continue"], pick: "newest" }) },
  codex: { bin: "codex", args: () => ({ resume: ["resume", "--last"], pick: "newest" }) },
  cursor: { bin: "agent", args: () => ({ resume: ["resume"], pick: "newest" }) },
};

/** What Resume warns about, per pick; nothing for an exact one. */
export const PICK_NOTE = {
  exact: null,
  guess: "The session id was matched by folder: this may reopen a different chat from there",
  newest: "Resumes the newest chat in that folder, not necessarily this one",
};

export const canArchive = (programKey) => programKey in RESUME;

/** The record, taken from what the card knew before anything was typed. `approx`: the session id is a guess. */
export function archiveRecord({ sessionId = null, approx = false, program, cwd = null, title = null, space = null, terminal, created = 0, now }) {
  return { sessionId, program, cwd, title, space, terminal, created, archivedAt: now, ended: null, ...RESUME[program].args(sessionId, approx) };
}

export function parseArchive(text) {
  try {
    const chats = JSON.parse(text ?? "")?.chats;
    return Array.isArray(chats) ? chats.filter((c) => c && typeof c.archivedAt === "number" && Array.isArray(c.resume)) : [];
  } catch { return []; }
}

const fileOf = (chats) => `${JSON.stringify({ chats: chats.slice(0, CAP) }, null, 1)}\n`;

/** The file with `chat` first; an earlier record of the same session goes, and the oldest past the cap. */
export const withChat = (text, chat) => fileOf([chat, ...parseArchive(text).filter((c) => !(chat.sessionId && c.sessionId === chat.sessionId))]);

/** The file without the chat archived at `archivedAt` (it was resumed, or its /exit was refused). */
export const withoutChat = (text, archivedAt) => fileOf(parseArchive(text).filter((c) => c.archivedAt !== archivedAt));

/** The file with the chat archived at `archivedAt` seen to end at `at`. */
export const withEnded = (text, archivedAt, at) => fileOf(parseArchive(text).map((c) => (c.archivedAt === archivedAt ? { ...c, ended: at } : c)));

/**
 * Applies `change` to the file and writes it only over the text it read. A stale snapshot (another
 * window wrote in between) is read again and `change` applied to the new text, once; a second
 * failure is returned. read() and write(text, expected) are the file's, so tests pass fakes.
 */
export async function updateFile({ read, write, change }) {
  let error = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await read();
      await write(change(text), text);
      return { ok: true, error: null };
    } catch (e) { error = String(e?.message ?? e); }
  }
  return { ok: false, error };
}

/**
 * Archive's order: the record (taken before anything is typed) is written first, so a chat never
 * ends without one; only then is the end command sent. A refusal typed nothing, so the record comes
 * back out. update(change) is updateFile over the archive; send() is deliver() (orders.js).
 */
export async function recordThenEnd({ chat, update, send }) {
  const kept = await update((text) => withChat(text, chat));
  if (!kept.ok) return { phase: "refused", error: `Nothing was typed: the archive could not be written (${kept.error}).` };
  const r = await send();
  if (r.phase !== "refused") return r;
  const back = await update((text) => withoutChat(text, chat.archivedAt));
  return back.ok ? r : { ...r, error: `${r.error} Its archive record could not be taken back: Report > Archived lists it.` };
}

/** The command a Resume opens a tab with: the program as programs.json starts it, then the resume arguments. */
export const resumeArgv = (chat, run) => [...(run?.length ? run : [RESUME[chat.program]?.bin ?? chat.program]), ...chat.resume];

/** Resume's tab.new arguments, in the chat's space while it exists. The row draws these and the click runs them. */
export const resumeTab = (chat, run, spaceIds) => ({
  name: chat.title ?? undefined, space: spaceIds.includes(chat.space) ? chat.space : undefined, folder: chat.cwd ?? undefined, argv: resumeArgv(chat, run),
});

/** Whether Resume may run, and what the row warns. A chat still running would be opened twice. */
export function resumeState(chat, running) {
  if (running) return { can: false, note: `Still running in ${chat.terminal}: /exit was typed but it hasn't ended` };
  return { can: true, note: PICK_NOTE[chat.pick] ?? null };
}

/** One terminal's life: an address can come back after a restart, its start time can't. */
export const lifeKey = (address, created) => `${address}@${created ?? 0}`;

/**
 * Whether the chat's program still runs, from Herdr's live lists: "running" while its terminal, in
 * the same life, is listed with the chat's program (a pane-less child: a live terminal running it),
 * else "ended". hc send exiting 0 only means /exit was typed; this is the evidence it took.
 */
export function exitState(chat, listed, terms) {
  const t = terms.find((x) => x.address === chat.terminal);
  if (!t || (t.created_ms ?? 0) !== chat.created) return "ended";
  const a = listed.find((x) => x.address === chat.terminal);
  const program = a ? a.program : t.state === "live" && t.parent ? t.program : null;
  return program?.key === chat.program ? "running" : "ended";
}

/** The hide for an ended chat's terminal. */
export const hideOf = (chat) => ({ life: lifeKey(chat.terminal, chat.created), program: chat.program });

/**
 * Whether a listed terminal is an archived chat's leftover: same life as a hide, and no agent runs
 * in it now. A new agent started in that shell shows, whatever the hide says.
 */
export const isLeftover = (hides, address, created, program) =>
  !program?.agent && hides.some((h) => h?.life === lifeKey(address, created));

/** The hides without `chat`'s: a resumed chat's old shell shows again. */
export const withoutHide = (hides, chat) => hides.filter((h) => h?.life !== hideOf(chat).life);

/** The hides still worth keeping: their terminal is there in the same life and runs no agent. */
export function keptHides(hides, terms) {
  return hides.filter((h) => typeof h?.life === "string" && terms.some((t) => lifeKey(t.address, t.created_ms) === h.life && !t.program?.agent));
}
