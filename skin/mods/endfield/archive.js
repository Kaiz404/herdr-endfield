// archive: the chats the person archived from the session card, and how each comes back. No Herdr
// in it (tests/archive.test.mjs runs it in node); actions.js reads and writes the file.
// data/endfield/archive.json = {chats: Chat[]}, newest first, at most CAP.
// Chat = {sessionId | null, program, cwd, title, space, terminal, created, archivedAt, resume: string[], approx}
//   resume: the arguments after the program's own command (programs.json `run`), so Codex keeps --no-daemon.
//   approx: the arguments pick the newest chat, not this one (no session id is known for it).

const CAP = 100;

// Claude Code resumes by session id. Codex and Cursor sessions aren't read by this skin, so their newest chat comes back.
// `bin` starts it when programs.json can't be asked.
const RESUME = {
  claude: { bin: "claude", args: (id) => (id ? { resume: ["--resume", id], approx: false } : { resume: ["--continue"], approx: true }) },
  codex: { bin: "codex", args: () => ({ resume: ["resume", "--last"], approx: true }) },
  cursor: { bin: "agent", args: () => ({ resume: ["resume"], approx: true }) },
};

export const canArchive = (programKey) => programKey in RESUME;

export function archiveRecord({ sessionId = null, program, cwd = null, title = null, space = null, terminal, created = 0, now }) {
  return { sessionId, program, cwd, title, space, terminal, created, archivedAt: now, ...RESUME[program].args(sessionId) };
}

export function parseArchive(text) {
  try {
    const chats = JSON.parse(text ?? "")?.chats;
    return Array.isArray(chats) ? chats.filter((c) => c && typeof c.archivedAt === "number" && Array.isArray(c.resume)) : [];
  } catch { return []; }
}

/** The file with `chat` first; an earlier record of the same session goes, and the oldest past the cap. */
export function withChat(text, chat) {
  const rest = parseArchive(text).filter((c) => !(chat.sessionId && c.sessionId === chat.sessionId));
  return `${JSON.stringify({ chats: [chat, ...rest].slice(0, CAP) }, null, 1)}\n`;
}

/** The file without the chat archived at `archivedAt` (it was resumed). */
export const withoutChat = (text, archivedAt) => `${JSON.stringify({ chats: parseArchive(text).filter((c) => c.archivedAt !== archivedAt) }, null, 1)}\n`;

/** The command a Resume opens a tab with: the program as programs.json starts it, then the resume arguments. */
export const resumeArgv = (chat, run) => [...(run?.length ? run : [RESUME[chat.program]?.bin ?? chat.program]), ...chat.resume];

/** One terminal's life: an address can come back after a restart, its start time can't. */
export const lifeKey = (address, created) => `${address}@${created ?? 0}`;
