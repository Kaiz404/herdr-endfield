// links: one agent linked to another as its helper, with no Herdr in it (tests/links.test.mjs runs it
// in node). The hc parent is set at `hc run` and can't change, so a link lives in the skin:
// data/endfield/links.json = {links: Link[]}, Link = {a: lead's life, b: helper's life, sa, sb: the
// Claude Code session each ran when linked, at, noted: {lead, helper}: whose note was typed}. A life
// is archive.js lifeKey (address@created), so a link drops when either terminal ends and never comes
// back on an address reused after a restart; the session ids drop it when a new session (or another
// program) starts in the same shell. Both agents sit in one space: Herdr can't move a chat between
// spaces, so a helper from another would leave its own squad. Squads nests the helper under its
// lead (fleet.js buildRoster); the hc parent, the Report tree and parent notes are untouched.
// The two agents talk through Claude Code's own cross-session messaging (ListAgents, SendMessage),
// which the note typed into each idle one on Link points them at:
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

/**
 * The notes still owed to the agent whose life is `life`: one per link that names it as a lead or a
 * helper with that side noted false. A link from before notes were noted counts as told.
 * -> [{side: "lead" | "helper", lead, helper (addresses)}], what openLink takes for Send note
 */
export const untold = (links, life) => links.flatMap((l) => [["lead", l.a], ["helper", l.b]]
  .filter(([who, x]) => x === life && l.noted?.[who] === false)
  .map(([side]) => ({ side, lead: addressOf(l.a), helper: addressOf(l.b) })));

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
  if (A.space !== B.space) return "Link agents in the same squad; Herdr can't move a chat between squads.";
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

/** The two notes as hc lines: each types only while its agent is idle (--if idle), never --force. */
export const linkSteps = (lead, helper) => {
  const notes = linkNotes(lead, helper);
  return [
    { who: "lead", hc: sendArgs({ target: lead.address, delivery: "idle", task: notes.lead }) },
    { who: "helper", hc: sendArgs({ target: helper.address, delivery: "idle", task: notes.helper }) },
  ];
};

/**
 * Types each step's note into its agent only if idle(step.who) says it is idle now, and notes it on
 * the link by told(step) once sent. An uncertain send may have typed it, so it counts as told and is
 * never offered twice. A busy agent, or one hc refused, is left untold for its card's Send note.
 * send(step) is deliver() (orders.js). -> {out: {[who]: "sent" | "uncertain" | "busy"}, errors: {[who]: hc's words}}
 */
export async function tell({ steps, idle, told, send }) {
  const out = {}, errors = {};
  for (const step of steps) {
    if (!idle(step.who)) { out[step.who] = "busy"; continue; }
    const r = await send(step);
    if (r.phase === "sent" || r.phase === "uncertain") await told(step);
    out[step.who] = r.phase === "refused" ? "busy" : r.phase;
    if (r.phase === "uncertain") errors[step.who] = r.error;
  }
  return { out, errors };
}

/**
 * Link: the link is saved first, so Squads nests the helper at once whatever either agent is doing;
 * then each note goes to its agent if idle (tell). A save that fails types nothing.
 * keep: updateFile over links.json. -> {ok, error} | {ok, out, errors}
 */
export async function linkThenTell({ steps, idle, keep, told, send }) {
  const k = await keep();
  if (!k.ok) return { ok: false, error: `Nothing was typed: the link could not be saved (${k.error}).` };
  return { ok: true, ...(await tell({ steps, idle, told, send })) };
}

/**
 * The one line Link (or Send note) ends on. out, errors: tell's; names: {lead, helper} as the dialog
 * titles them; linked: whether this was a Link (else a Send note).
 */
export function outcome({ out, errors = {}, names, linked = true }) {
  const head = linked ? "Linked." : "Sent.";
  const busy = Object.keys(out).filter((w) => out[w] === "busy").map((w) => names[w]);
  const unsure = Object.keys(out).filter((w) => out[w] === "uncertain").map((w) => `${names[w]} may not have its note (${errors[w]}).`);
  if (!linked && busy.length) return `${busy[0]} isn't idle any more. Nothing was typed. Send its note when it's free.`;
  const wait = busy.length === 1 ? `${busy[0]} is busy. Send its note from its card when it's free.`
    : busy.length > 1 ? `${busy.join(" and ")} are busy. Send each note from its card when it's free.` : "";
  const all = !wait && !unsure.length ? (linked ? "Both agents have their note." : `${names[Object.keys(out)[0]]} has its note.`) : "";
  return [head, wait, ...unsure, all].filter(Boolean).join(" ");
}
