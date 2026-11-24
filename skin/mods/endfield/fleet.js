// fleet: the status table and the roster rules, with no Herdr in them (tests/fleet.test.mjs runs
// them in node). roster.js feeds buildRoster() Herdr's live lists; kit.js re-exports the table.

// Every role reads a status through this table: its word, how its glyph draws, its bar colour,
// its entrance effect, its rank (how urgent) and whether its Squads row folds to one line.
export const STATUS = {
  blocked: { word: "Needs input", kind: "pill", bar: "signal", edge: "hazard", rank: 4 },
  error: { word: "Error", kind: "text", glyph: "×", hue: "error", bar: "red", rank: 4 },
  done: { word: "Finished", kind: "disc", glyph: "✓", bar: "lime", fresh: true, enter: ["flash", "pop"], rank: 3 },
  // Waiting on background work it started. Its glyph is still: motion is kept for where work happens.
  waiting: { word: "Waiting", kind: "pause", hue: "flow", bar: "flowInv", rank: 2.5 },
  working: { word: "Generating", kind: "march", hue: "flow", bar: "flowInv", rank: 2 },
  idle: { word: "Idle", kind: "mono", glyph: "zZ", bar: "hairStrong", quiet: true, oneLine: true, rank: 1 },
};
export const statusOf = (s) => STATUS[s] ?? null;
export const rank = (s) => STATUS[s]?.rank ?? 0;

// From 12 agents the sidebar goes compact.
export const DENSE_AT = 12;

// A sub-agent without a pane isn't in agents(): error counts as blocked, and it's never done
// (it reports to its parent, whose done is the news).
const childStatus = (s) => (s === "error" ? "blocked" : s === "done" ? "idle" : s ?? "idle");

// Creation order (the core's created_ms, else the address number): stable while agents come and
// go, so a callsign never hops from one agent to another.
const byCreation = (x, y) => x.created - y.created || x.address.localeCompare(y.address, undefined, { numeric: true });

// Siblings: priority ranks an agent by the most urgent status in its tree (a parent whose child
// needs input sorts as needing input), as the shipped agents mod does.
export const BY = {
  priority: (x, y) => y.urgency - x.urgency || y.seq - x.seq,
  order: (x, y) => x.tabIndex - y.tabIndex || byCreation(x, y),
};

export const PINNED = "pinned";

/**
 * { all: Map<address, Member>, squads: [{ id, num, name, machine, pinned?, members: Member[] }], flat: Member[] }
 * Member: { address, agent (AgentInfo, null for a child without a pane), program, status, title,
 *   space, spaceName, tab, tabIndex, pane, seq, pinned, focused, created, turn, parent (address | null),
 *   depth, kids (addresses), urgency, ident: identity.resolve(...) + { callsign } }
 * Pinned agents (and their trees) come first, in a squad of their own ahead of every space's, so
 * the list and agent.next start with them. `sort` orders siblings; children stay under their parent.
 * identity: { resolve(program, terminal, {parent}), as(slug, program), spares() } (IDENTITY in kit.js).
 */
export function buildRoster({ listed, terms, spaces, identity, sort = BY.priority }) {
  const termOf = new Map(terms.map((t) => [t.address, t]));
  const all = new Map();
  for (const a of listed) {
    all.set(a.address, {
      address: a.address, agent: a, program: a.program, status: a.status, title: a.title,
      space: a.space, spaceName: a.space_name, tab: a.tab, tabIndex: a.tab_index, pane: a.pane,
      seq: a.seq, pinned: Boolean(a.pinned), focused: a.focused, parent: termOf.get(a.address)?.parent ?? null,
      created: termOf.get(a.address)?.created_ms ?? 0, turn: termOf.get(a.address)?.turn ?? null,
    });
  }
  // Children without a pane, under any listed agent (to any depth).
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of terms) {
      if (all.has(t.address) || t.state !== "live" || !t.parent || !all.has(t.parent)) continue;
      const up = all.get(t.parent);
      all.set(t.address, {
        address: t.address, agent: null, program: t.program, status: childStatus(t.status), title: t.title || t.name || t.template || t.program?.name || t.address,
        space: up.space, spaceName: up.spaceName, tab: up.tab, tabIndex: up.tabIndex, pane: null,
        seq: up.seq, pinned: false, focused: false, parent: t.parent, created: t.created_ms ?? 0, turn: t.turn ?? null,
      });
      grew = true;
    }
  }
  for (const m of all.values()) {
    if (m.parent && !all.has(m.parent)) m.parent = null;
    m.kids = [];
  }
  for (const m of all.values()) if (m.parent) all.get(m.parent).kids.push(m.address);
  const urgency = (m) => (m.urgency ??= Math.max(rank(m.status), ...m.kids.map((k) => urgency(all.get(k)))));
  for (const m of all.values()) urgency(m);

  // Identity in creation order: a repeated operator first takes a spare, then a callsign (PERLICA·2).
  const used = new Map();
  const spares = [...identity.spares()];
  for (const m of [...all.values()].sort(byCreation)) {
    let ident = identity.resolve(m.program, m.address, { parent: m.parent ? all.get(m.parent).program : null });
    const key = ident.operator ?? `program:${m.program?.key}`;
    if (used.has(key) && ident.operator && !ident.pinned) {
      const spare = spares.find((s) => !used.has(s));
      if (spare) ident = identity.as(spare, m.program);
    }
    const k = ident.operator ?? key;
    const n = (used.get(k) ?? 0) + 1;
    used.set(k, n);
    m.ident = { ...ident, callsign: `${ident.name.toUpperCase()}${n > 1 ? `·${n}` : ""}` };
  }

  const place = (m, depth) => [{ ...m, depth }, ...m.kids.map((k) => all.get(k)).sort(sort).flatMap((k) => place(k, depth + 1))];
  const tops = [...all.values()].filter((m) => !m.parent);
  const squad = (id, num, name, machine, members, extra = {}) => {
    const placed = members.sort(sort).flatMap((m) => place(m, 0));
    for (const m of placed) all.set(m.address, m);
    return { id, num, name, machine, members: placed, ...extra };
  };
  const squads = [];
  const pinned = tops.filter((m) => m.pinned);
  if (pinned.length) squads.push(squad(PINNED, "PN", "Pinned", null, pinned, { pinned: true }));
  spaces.forEach((sp, i) => {
    const mine = tops.filter((m) => m.space === sp.id && !m.pinned);
    if (mine.length) squads.push(squad(sp.id, String(i + 1).padStart(2, "0"), sp.name, sp.machine ?? null, mine));
  });
  return { all, squads, flat: squads.flatMap((q) => q.members) };
}

// Without a registry to say whether its process lives, a run counts as alive while its transcript
// was written this recently.
const FRESH_MS = 20000;

/**
 * What a Claude Code run (a session, or one of its sub-agents) is doing, from what its transcript
 * says and whether its process lives (tools/probe.mjs), not from how long ago it wrote: a run that
 * waits on a background task writes nothing for as long as the task takes.
 * run: {live: boolean | null, final, pending: {wait} | null, tasks: [{state}], mtime, now}
 * parent: the owning agent's status; a run that is over reads idle under an idle parent, else done.
 * -> working | waiting | done | idle
 */
export function runStatus(run, parent) {
  const over = parent === "idle" ? "idle" : "done";
  if (!(run.live ?? run.now - run.mtime < FRESH_MS)) return over;
  if (run.pending) return run.pending.wait ? "waiting" : "working";
  if (!run.final) return "working";
  return (run.tasks ?? []).some((t) => t.state === "running") ? "waiting" : over;
}

// Still in flight: a sub-agent in one of these shows under its parent without being asked for.
export const inFlight = (status) => status === "working" || status === "waiting";

/**
 * How often to ask again when no file was written: a status can change by time alone. A working
 * sub-agent may go quiet: "fast". A wait may end with no write to see, by a monitor's timeout or
 * its session's crash: "slow". Else null.
 * sessions: Session[] (sessions.js)
 */
export function pollPace(sessions) {
  const subs = sessions.flatMap((s) => s.subagents);
  if (subs.some((k) => k.status === "working")) return "fast";
  return sessions.some((s) => s.waiting) || subs.some((k) => k.status === "waiting") ? "slow" : null;
}

// A Claude Code session's own sub-agents under its row: the ones in flight (working or waiting),
// or all of them while `open`, newest started first (by start, not last write, so a busy one
// doesn't hop past a newer one). `earlier` counts the ones that are over, which a toggle row offers.
// subs: [{status, startedAt | null, lastAt}] -> {shown: subs, earlier: number}
export function subagentView(subs, open) {
  const at = (k) => k.startedAt ?? k.lastAt ?? 0;
  const newest = [...subs].sort((a, b) => at(b) - at(a));
  const active = newest.filter((k) => inFlight(k.status));
  return { shown: open ? newest : active, earlier: newest.length - active.length };
}

// A Claude Code session's own sub-agents share one operator, so each one shown takes the lowest
// number no other shown one holds, and keeps it while it stays shown: ARDELIA·2, never ARDELIA·30.
// prev: Map<id, n> from the last render; shown: ids in start order.
export function subNumbers(prev, shown) {
  const next = new Map(shown.filter((id) => prev.has(id)).map((id) => [id, prev.get(id)]));
  const taken = new Set(next.values());
  for (const id of shown) {
    if (next.has(id)) continue;
    let n = 1;
    while (taken.has(n)) n++;
    next.set(id, n);
    taken.add(n);
  }
  return next;
}

// A sub-agent's transcript shows in one pane per tab, docked right of its parent.
export const TRANSCRIPT = "endfield-transcript";
export const transcriptsIn = (panes, tab) => panes.filter((p) => p.mod === TRANSCRIPT && p.tab === tab);

// What a click on a sub-agent does in its parent's tab. `shown`: the path that tab's pane was
// opened on. The one already shown is focused; any other click replaces every transcript pane
// there with one new split, because a mod pane's props can't change once it is open.
export function transcriptPlan(panes, tab, shown, path) {
  const open = transcriptsIn(panes, tab);
  if (open.length === 1 && shown === path) return { focus: open[0].pane };
  return { close: open.map((p) => p.pane) };
}

// A Squads row's height class: an idle agent folds to one line, any other keeps two. agents.js
// sizes each class in its H table, so the selection marker can add the heights up.
export const rowShape = (status, depth) => (STATUS[status]?.oneLine ? "idle" : depth ? "child" : "lead");

export const DASH = "—";

/** 151000 -> "151K", 1200000 -> "1.2M", 1000000 -> "1M". */
export function fmtTokens(n) {
  if (n == null) return DASH;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

/** 42s -> "42s", 27 min -> "27m", 67 min -> "1h07", 12 h -> "12h", 3 days -> "3d". */
export function elapsed(ms) {
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  if (m < 1) return `${Math.floor(ms / 1000)}s`;
  if (m < 60) return `${m}m`;
  if (h < 10) return `${h}h${String(m % 60).padStart(2, "0")}`;
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The window is 1M for a "[1m]" model, else 200K; a context already past 200K must be in the larger one.
export function contextWindow(id, used) {
  return /\[1m\]/i.test(id ?? "") || used > 200000 ? 1000000 : 200000;
}

// From this share of the window on, a context gauge runs red.
export const CTX_HOT = 0.75;

const EFFORT = { low: "low", medium: "med", high: "high", xhigh: "xhigh", max: "max" };

/**
 * What a Squads row says about a run. model (or, with no session, the program) and effort sit
 * beside the callsign. time: how long the run has gone, to now while it works, else to its last
 * write. ticking: the time reads seconds and changes each second. gauge: how full its context is,
 * in `segments` blocks. What isn't known is null.
 * run: {startedAt, lastAt, live, model, modelId, effort, used, total, program}, every field optional
 * -> {model, effort, time, ticking, gauge: {lit, hot, tip} | null}
 */
export function rowMeta(run, now, segments) {
  const end = run.live ? now : run.lastAt;
  const ms = run.startedAt && end ? Math.max(0, end - run.startedAt) : null;
  const total = run.total ?? contextWindow(run.modelId, run.used);
  const share = run.used ? run.used / total : null;
  return {
    model: run.model ?? run.program ?? null,
    effort: EFFORT[run.effort] ?? run.effort ?? null,
    time: ms == null ? null : elapsed(ms),
    ticking: Boolean(run.live) && ms != null && ms < 60000,
    gauge: share == null ? null : {
      lit: Math.round(Math.min(1, share) * segments),
      hot: share >= CTX_HOT,
      tip: `${fmtTokens(run.used)} / ${fmtTokens(total)} · ${Math.round(share * 100)}%`,
    },
  };
}
