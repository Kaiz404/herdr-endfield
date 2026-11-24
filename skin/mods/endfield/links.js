// links: one agent linked to another as its helper, with no Herdr in it (tests/links.test.mjs runs it
// in node). The hc parent is set at `hc run` and can't change, so a link lives in the skin:
// data/endfield/links.json = {links: Link[]}, Link = {a: lead's life, b: helper's life, sa, sb: the
// Claude Code session each ran when linked, at, noted: {lead, helper}: whose note was typed}. A life
// is archive.js lifeKey (address@created), so a link drops when either terminal ends and never comes
// back on an address reused after a restart; the session ids drop it when a new session (or another
// program) starts in the same shell. Both agents sit in one space, so a helper never leaves its own
// squad (dock.js won't move a linked chat out of it). Squads nests the helper under its
// lead (fleet.js buildRoster); the hc parent, the Report tree and parent notes are untouched.
// The two agents talk through Claude Code's own cross-session messaging (ListAgents, SendMessage),
// which the note typed into each on Confirm points them at:
// https://code.claude.com/docs/en/cross-session-messaging.md

import { lifeKey } from "./archive.js";
import { sendArgs } from "./orders.js";

export const DOC = "https://code.claude.com/docs/en/cross-session-messaging.md";

export function parseLinks(text) {
  try {
    const links = JSON.parse(text ?? "")?.links;
    return Array.isArray(links) ? links.filter((l) => l && typeof l.a === "string" && typeof l.b === "string" && l.a !== l.b) : [];
  } catch { return []; }
}

/** The life of a roster member (fleet.js), as a link names it. */
export const lifeOf = (m) => lifeKey(m.address, m.created);

const addressOf = (life) => life.slice(0, life.lastIndexOf("@"));

/** The Claude Code agents by life. members: fleet.js members ({address, created, program, space, session}). */
export const byLife = (members) => new Map([...members].filter((m) => m.program?.key === "claude").map((m) => [lifeOf(m), m]));

/**
 * Whether link `l` still stands among `lives` (byLife): both lives still run Claude Code, in one
 * space, each in the session it was linked in. A session not read yet (null) doesn't drop it.
 */
export function stands(l, lives) {
  const A = lives.get(l.a), B = lives.get(l.b);
  return Boolean(A && B) && A.space === B.space && [[A, l.sa], [B, l.sb]].every(([m, s]) => m.session == null || m.session === s);
}

const fileOf = (links) => `${JSON.stringify({ links }, null, 1)}\n`;

// Links that no longer stand drop at each write.
const kept = (text, lives) => parseLinks(text).filter((l) => stands(l, lives));

/**
 * The file with `link` in it. text is links.json as read just now, so a link another window made
 * is seen: a helper has one lead, and one it already has is refused (throws), never replaced.
 */
export function withLink(text, link, lives) {
  const links = kept(text, lives);
  const earlier = links.find((l) => l.b === link.b && l.a !== link.a);
  if (earlier) throw new Error(`it is already a helper of ${addressOf(earlier.a)}, linked from another window. Unlink it first`);
  return fileOf([...links.filter((l) => l.b !== link.b), link]);
}

/** The file without the link whose helper is life `b`. */
export const withoutLink = (text, b, lives) => fileOf(kept(text, lives).filter((l) => l.b !== b));

/** The file with `who` ("lead" | "helper") noted as told on the link whose helper is life `b`. */
export const withNoted = (text, b, who, lives) => fileOf(kept(text, lives).map((l) => (l.b === b ? { ...l, noted: { ...l.noted, [who]: true } } : l)));

/** Whether link `l`'s helper is still to be told (a link from before notes were noted counts as told). */
export const helperUntold = (l) => l?.noted?.helper === false;

const machineOf = (address) => (address.includes("/") ? address.split("/")[0] : null);

/**
 * Why helper `b` can't be dropped on lead `a`, or null when it can. all: the roster's members by
 * address (fleet.js buildRoster), whose `linked` is the lead a member is already a helper of.
 */
export function linkProblem(all, b, a) {
  const B = all.get(b), A = all.get(a);
  if (!B || !A || b === a) return "Drop it on another agent.";
  if (B.program?.key !== "claude" || A.program?.key !== "claude") return "Both must be Claude Code sessions: they talk through its cross-session messaging.";
  if (machineOf(a) !== machineOf(b)) return "Both must be on the same machine: cross-session messaging between machines needs Remote Control.";
  if (A.space !== B.space) return "Link agents in the same squad. Drag one onto the other's squad first.";
  if (B.parent) return `It is already a sub-agent of ${B.parent}.`;
  if (B.linked) return B.linked === a ? "It is already linked to that agent." : `It is already a helper of ${B.linked}. Unlink it first.`;
  for (let up = A; up; up = all.get(up.parent ?? up.linked)) if (up.address === b) return "That agent is under it already.";
  if (!A.session || !B.session) return "Wait until both sessions show on their cards: a link is kept to the session.";
  return null;
}

const oneLine = (s) => `${s ?? ""}`.replace(/\s+/g, " ").trim();
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const TASK_CHARS = 120;

/** How a note names the other agent so ListAgents can find it: its program, folder and task (the label its row shows). */
const named = (x) => `${x.label} in ${x.cwd ?? "an unknown folder"}, terminal ${x.address}, working on "${clip(oneLine(x.title) || "no task shown", TASK_CHARS)}"`;

const COORDINATE = "Coordinate with it through Claude Code's cross-session messaging: find it with ListAgents (by that folder or task) and message it with SendMessage. Pass notify_when_idle to SendMessage to hear once when it next goes idle. Before either of you edits, agree who owns which files, or work in separate git worktrees, so your changes don't clash.";

/**
 * The notes typed on Confirm, one line each. lead and helper: {address, label, title (as its row shows it), cwd}.
 * hc read is only a fallback for seeing the other's screen; the channel is SendMessage.
 */
export function linkNotes(lead, helper) {
  return {
    lead: `The person linked another Claude Code session to you as your helper: ${named(helper)}. ${COORDINATE} If messaging is unavailable, hc read ${helper.address} shows its screen.`,
    helper: `The person linked you as a helper of another Claude Code session: ${named(lead)}. ${COORDINATE} Tell it with SendMessage when your part is done. If messaging is unavailable, hc read ${lead.address} shows its screen.`,
  };
}

/** What Confirm types, in order: the lead's note, then the helper's, each only while that agent is idle. */
export const linkSteps = (lead, helper) => {
  const notes = linkNotes(lead, helper);
  return [
    { who: "lead", hc: sendArgs({ target: lead.address, delivery: "idle", task: notes.lead }) },
    { who: "helper", hc: sendArgs({ target: helper.address, delivery: "idle", task: notes.helper }) },
  ];
};

/**
 * Link's order, as Archive's (archive.js recordThenEnd): the record is written before anything is
 * typed, so nothing is typed for a link that wasn't kept. Then each step from `from` (a retry after
 * the helper refused, or the card's Send note again, starts at 1), and each one sent is noted on
 * the record by told(step). A refusal at the first step typed nothing, so the record comes back out.
 * keep, unkeep, told: updateFile over links.json; send(step) is deliver() (orders.js).
 * -> {phase, error, next: the step a retry starts at}
 */
export async function linkThenTell({ steps, from = 0, keep, unkeep, told, send }) {
  if (from === 0) {
    const k = await keep();
    if (!k.ok) return { phase: "refused", error: `Nothing was typed: the link could not be saved (${k.error}).`, next: 0 };
  }
  for (let i = from; i < steps.length; i++) {
    const r = await send(steps[i]);
    // An uncertain send may have typed the note: count it as told, so "Send note again" can't repeat it.
    if (r.phase === "sent" || r.phase === "uncertain") await told(steps[i]);
    if (r.phase === "sent") continue;
    if (i === 0 && r.phase === "refused") {
      const back = await unkeep();
      return { ...r, next: 0, error: back.ok ? r.error : `${r.error} The link could not be taken back: Unlink it on the card.` };
    }
    return { ...r, next: i };
  }
  return { phase: "sent", error: null, next: steps.length };
}
