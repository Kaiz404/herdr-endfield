// fleet: the status table and the roster rules, with no Herdr in them (tests/fleet.test.mjs runs
// them in node). roster.js feeds buildRoster() Herdr's live lists; kit.js re-exports the table.

// Every role reads a status through this table: its word, how its glyph draws, its bar colour,
// its entrance effect, its rank (how urgent) and whether its Squads row folds to one line.
export const STATUS = {
  blocked: { word: "Needs input", kind: "pill", bar: "signal", edge: "hazard", rank: 4 },
  error: { word: "Error", kind: "text", glyph: "×", hue: "error", bar: "red", rank: 4 },
  done: { word: "Claimed", kind: "disc", glyph: "✓", bar: "lime", fresh: true, enter: ["flash", "pop"], rank: 3 },
  working: { word: "Generating", kind: "march", hue: "flow", bar: "flowInv", conveyor: true, rank: 2 },
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

// A Claude Code session's own sub-agents under its row: the working ones, or all of them while
// `open`, newest started first (by start, not last write, so a busy one doesn't hop past a newer
// one). `earlier` counts the ones not working, which a toggle row offers.
// subs: [{status, startedAt | null, lastAt}] -> {shown: subs, earlier: number}
export function subagentView(subs, open) {
  const at = (k) => k.startedAt ?? k.lastAt ?? 0;
  const newest = [...subs].sort((a, b) => at(b) - at(a));
  const working = newest.filter((k) => k.status === "working");
  return { shown: open ? newest : working, earlier: newest.length - working.length };
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

// A Squads row's height class: an idle agent folds to one line, any other keeps two. agents.js
// sizes each class in its H table, so the selection marker can add the heights up.
export const rowShape = (status, depth) => (STATUS[status]?.oneLine ? "idle" : depth ? "child" : "lead");

export const DASH = "—";

/** 151000 -> "151K", 1200000 -> "1.2M". */
export function fmtTokens(n) {
  if (n == null) return DASH;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

/** 40s -> "<1m", 12 min -> "12m", 65 min -> "1h 05m". */
export function elapsed(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// A Squads row's meta line: how long the run has gone (to now while it works, else to its last
// write), its model and effort, and the context it holds. What isn't known is left out, and an
// agent with no session shows its program instead of a model.
// run: {startedAt, lastAt, live, model, effort, used, program}, every field optional
export function rowMeta(run, now) {
  const end = run.live ? now : run.lastAt;
  return [
    run.startedAt && end ? elapsed(Math.max(0, end - run.startedAt)) : null,
    run.model ?? run.program,
    run.effort,
    run.used ? `${fmtTokens(run.used)} ctx` : null,
  ].filter(Boolean).join(" · ");
}
