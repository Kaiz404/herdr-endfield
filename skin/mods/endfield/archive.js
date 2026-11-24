// archive: the chats the person archived from the session card or with Archive squad, and how each
// comes back. No Herdr in it (tests/archive.test.mjs runs it in node); actions.js reads and writes
// the file, and squadactions.js archives a whole squad with the same steps.
// data/endfield/archive.json = {chats: Chat[]}, newest first, at most CAP.
// Chat = {sessionId | null, program, cwd, title, space, squad, machine, terminal, created, archivedAt, ended, resume: string[], pick}
//   squad, machine: its space's name and machine (null here), so Resume can make the space again once it is closed.
//   ended: null while the program was told to end and hasn't been seen to (archiving), else when it was.
//   resume: the arguments after the program's own command (programs.json `run`), so Codex keeps --no-daemon.
//   pick: which chat the arguments reopen. "exact" (the session id is known), "guess" (the id was
//   matched by folder, so it may be another chat there), "newest" (the newest chat, not this one).
// Hide = {life, program}: an archived chat's terminal, left behind once its program ended, kept out of Squads.

import { gate } from "./orders.js";

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

/** The command that starts a program when programs.json can't be asked. */
export const programBin = (programKey) => RESUME[programKey]?.bin ?? programKey;

/** The record, taken from what the card knew before anything was typed. `approx`: the session id is a guess. */
export function archiveRecord({ sessionId = null, approx = false, program, cwd = null, title = null, space = null, squad = null, machine = null, terminal, created = 0, now }) {
  return { sessionId, program, cwd, title, space, squad, machine, terminal, created, archivedAt: now, ended: null, ...RESUME[program].args(sessionId, approx) };
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
export const resumeArgv = (chat, run) => [...(run?.length ? run : [programBin(chat.program)]), ...chat.resume];

/**
 * Where Resume reopens a chat and the Herdr command that does it; the row draws it and the click runs
 * it. A tab in the chat's own space while it exists, else in a space of its squad's name on its
 * machine (an earlier Resume from the same squad may have made it), else a new space of that name.
 * Always in the chat's folder, since Claude Code finds a session id from there; `base` (the home
 * base) only when the record has none. spaces: [{id, name, machine}] -> {herdr, args, where}.
 */
export function resumePlan(chat, run, spaces, base = null) {
  const machine = chat.machine ?? null;
  const folder = chat.cwd ?? (machine ? undefined : base ?? undefined);
  const argv = resumeArgv(chat, run);
  const there = spaces.find((s) => s.id === chat.space)
    ?? (chat.squad ? spaces.find((s) => s.name === chat.squad && (s.machine ?? null) === machine) : null);
  if (there) return { herdr: "tab.new", args: { name: chat.title ?? undefined, space: there.id, folder, argv }, where: `Into squad ${there.name || there.id}` };
  return {
    herdr: "space.new", args: { name: chat.squad ?? undefined, tab: chat.title ?? undefined, folder, argv, machine: machine ?? "" },
    where: chat.squad ? `Into a new space, ${chat.squad}` : "Into a new space",
  };
}

/** Whether Resume may run, and what the row warns. A chat still running would be opened twice. */
export function resumeState(chat, running) {
  if (running) return { can: false, note: `Still running in ${chat.terminal}: /exit was typed but it hasn't ended` };
  return { can: true, note: PICK_NOTE[chat.pick] ?? null };
}

/** One terminal's life: an address can come back after a restart, its start time can't. */
export const lifeKey = (address, created) => `${address}@${created ?? 0}`;

/**
 * One read of whether the chat's program still runs, from Herdr's live lists. "running": its
 * terminal, in the same life, runs the chat's program by agents() or by terminals(). "ended": a
 * positive sign it stopped (the terminal finished, a new terminal took the address, or it now runs
 * another program). "gone": terminals() doesn't list it, which one read can't tell from a list
 * caught mid-update (exitSeen). hc send exiting 0 only means /exit was typed; this is the evidence it took.
 */
export function exitState(chat, listed, terms) {
  const t = terms.find((x) => x.address === chat.terminal);
  if (!t) return "gone";
  if ((t.created_ms ?? 0) !== chat.created || (t.state ?? "live") !== "live") return "ended";
  const a = listed.find((x) => x.address === chat.terminal);
  if (a?.program?.key === chat.program || t.program?.key === chat.program) return "running";
  return a?.program || t.program ? "ended" : "gone";
}

/** Whether a watcher may call the chat ended: a positive sign, or its terminal missing from two reads in a row. */
export const exitSeen = (prev, read) => read === "ended" || (read === "gone" && prev === "gone");

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

// A remote space or tab id carries its machine ("box/s3"); labels on that machine leave it out.
const bare = (id) => String(id ?? "").replace(/^.*\//, "");

// A label from hc's labels, as {k: v} or ["k=v"].
function labelOf(t, k) {
  const L = t.labels;
  if (Array.isArray(L)) return L.find((x) => typeof x === "string" && x.startsWith(`${k}=`))?.slice(k.length + 1) ?? null;
  return L?.[k] ?? null;
}

/** A terminal's bare tab id from its herdr.tab label, or null. */
export const tabLabel = (t) => { const tab = labelOf(t, "herdr.tab"); return tab == null ? null : bare(tab); };

/**
 * The live terminals `own` says are in a place, with every live descendant of one. own(t, pane,
 * agent): t's pane (panes()) and agents() entry, either may be undefined. -> Ender[] in terminals() order.
 */
function enders(own, { panes, listed, terms }) {
  const paneOf = new Map(panes.filter((p) => p.terminal).map((p) => [p.terminal, p]));
  const agentOf = new Map(listed.map((a) => [a.address, a]));
  const live = terms.filter((t) => (t.state ?? "live") === "live");
  const inside = new Set(live.filter((t) => own(t, paneOf.get(t.address), agentOf.get(t.address))).map((t) => t.address));
  for (let grew = true; grew;) {
    grew = false;
    for (const t of live) if (!inside.has(t.address) && t.parent && inside.has(t.parent)) { inside.add(t.address); grew = true; }
  }
  const byAddr = new Map(live.map((t) => [t.address, t]));
  const depth = (t) => { let d = 0; for (let up = t; up?.parent && inside.has(up.parent) && d < 64; up = byAddr.get(up.parent)) d++; return d; };
  return live.filter((t) => inside.has(t.address)).map((t) => {
    const a = agentOf.get(t.address), program = a?.program ?? t.program ?? null;
    const parent = t.parent && inside.has(t.parent) ? t.parent : null;
    return {
      terminal: t.address, created: t.created_ms ?? 0, life: lifeKey(t.address, t.created_ms), program, status: a?.status ?? t.status ?? null, parent,
      kind: !program?.agent ? "shell" : parent ? "sub-agent" : "agent", title: paneOf.get(t.address)?.title || a?.title || t.name || "", depth: depth(t),
    };
  });
}

/**
 * Every live terminal that ends with space `id` (space.close: "Close a space and end its
 * terminals"), from Herdr's lists, not the roster: so shells, servers and archived chats' hidden
 * shells are in it too. A terminal with a pane is in the space its tab is in; one without is in it
 * by its herdr.space or herdr.tab label, or as a live descendant of one in it.
 * -> Ender[] in terminals() order: {terminal, created, life, kind: "agent" | "sub-agent" | "shell",
 * program, status, parent, title, depth}. A sub-agent is an agent whose parent ends with it.
 */
export function spaceTerminals(id, { spaces, panes, listed, terms }) {
  const tabIds = (spaces.find((s) => s.id === id)?.tabs ?? []).map((t) => t.id);
  const tabs = new Set(tabIds), labelTabs = new Set(tabIds.map(bare));
  return enders((t, p, a) => {
    if (p) return tabs.has(p.tab);
    if (a?.space === id) return true;
    const sp = labelOf(t, "herdr.space"), tab = tabLabel(t);
    return (sp != null && bare(sp) === bare(id)) || (tab != null && labelTabs.has(tab));
  }, { panes, listed, terms });
}

/**
 * Every live terminal that ends with tab `id` (tab.close, or a pane.close of its parent's pane): one
 * with a pane there, one without a pane that carries its herdr.tab label, and every live descendant.
 */
export const tabTerminals = (id, lists) => enders((t, p) => (p ? p.tab === id : tabLabel(t) === bare(id)), lists);

const GROUP = { agent: "agents", "sub-agent": "subs", shell: "shells" };

/**
 * What Archive squad and Close squad do to a squad: every terminal that ends with its space
 * (spaceTerminals), named and ordered as Squads shows them where the roster has them (`members`:
 * the space's roster members in tree order, pinned ones too). groups: everything that ends, as
 * {agents, subs, shells}. chats: the agents Archive squad archives, each parent before its children.
 * blockers: why Archive squad can't start, naming each agent; shells and servers never block it
 * (nothing resumes them, so they just end with the space).
 * Who: {terminal, life, kind, name, title, program, depth, pinned}, plus why on a blocker.
 */
export function squadPlan(enders, members = []) {
  const at = new Map(members.map((m, i) => [m.address, i]));
  const rank = (e) => at.get(e.terminal) ?? Infinity;
  const ordered = enders.map((e, i) => [e, i]).sort(([a, i], [b, j]) => rank(a) - rank(b) || a.depth - b.depth || i - j).map(([e]) => e);
  const byAddr = new Map(members.map((m) => [m.address, m]));
  const groups = { agents: [], subs: [], shells: [] }, chats = [], blockers = [];
  for (const e of ordered) {
    const m = byAddr.get(e.terminal);
    const who = {
      terminal: e.terminal, life: e.life, kind: e.kind, program: e.program?.key ?? null, depth: m?.depth ?? e.depth, pinned: Boolean(m?.pinned),
      name: m?.ident?.callsign || (e.kind === "shell" ? `${e.program?.name || "Shell"} ${e.terminal}` : m?.label || e.program?.name || e.terminal),
      title: m?.title || e.title || "",
    };
    groups[GROUP[e.kind]].push(who);
    if (e.kind === "shell") continue;
    if (!canArchive(who.program)) { blockers.push({ ...who, why: `Nothing here resumes ${e.program?.name ?? "it"}. End it yourself, or use Close squad.` }); continue; }
    const why = gate(m?.herdrStatus ?? e.status);
    if (why) blockers.push({ ...who, why });
    chats.push(who);
  }
  return { groups, chats, blockers };
}

/**
 * What would end with the space now that the person didn't confirm: a terminal in a life they weren't
 * shown, or one running an agent where they were shown none or another program. confirmed:
 * [{life, agent: program key | null}], null for a shell (or a chat that was archived, so should be one).
 */
export function unconfirmed(now, confirmed) {
  const ok = new Map(confirmed.map((c) => [c.life, c.agent]));
  return now.filter((e) => !ok.has(e.life) || (e.program?.agent && ok.get(e.life) !== e.program.key));
}

/** What the person confirms ending, for unconfirmed: each listed Who's life, and the agent it runs (none for a shell). */
export const confirmedOf = (list) => list.map((c) => ({ life: c.life, agent: c.kind === "shell" ? null : c.program }));

/** squadPlan's groups as the Kills line says them: "2 agents (A, B), 1 sub-agent (C) and 1 shell or server (pwsh t9)". */
export function killPhrase(groups) {
  const parts = [[groups.agents, "agent", "agents"], [groups.subs, "sub-agent", "sub-agents"], [groups.shells, "shell or server", "shells or servers"]]
    .filter(([list]) => list.length)
    .map(([list, one, many]) => `${list.length} ${list.length === 1 ? one : many} (${list.map((c) => c.name).join(", ")})`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "";
}

// Archive squad's chat phases that may still end: about to be sent, being sent, or sent and watched.
const PENDING = new Set(["queued", "sending", "watching"]);

/**
 * What Archive squad does as its chats move on: "close" the space once every chat was seen to end,
 * "wait" while any is still being sent or watched, else "keep" it (a chat in it didn't end, so its
 * terminal and its record stay as they are).
 */
export function squadEnd(phases) {
  if (phases.length && phases.every((p) => p === "ended")) return "close";
  return phases.some((p) => PENDING.has(p)) ? "wait" : "keep";
}
