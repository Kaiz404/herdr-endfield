// roster: the fleet as every surface sees it. Who each agent is (operator, callsign, class badge),
// who started it, and the squads: one per space, members in tree order (a parent, then its
// children). The squad sidebar, the report, Dispatch, pane headers and the toast all read this.

import { agents, terminals, spaces } from "herdr";
import { IDENTITY, rank } from "./kit.js";

// A sub-agent without a pane isn't in agents(): error counts as blocked, and it's never done
// (it reports to its parent, whose done is the news).
const childStatus = (s) => (s === "error" ? "blocked" : s === "done" ? "idle" : s ?? "idle");

// Creation order (the core's created_ms, else the address number): stable while agents come and
// go, so a callsign never hops from one agent to another.
const byCreation = (x, y) => x.created - y.created || x.address.localeCompare(y.address, undefined, { numeric: true });

// From 12 agents the sidebar goes compact: 34px squad rows, spaces as numbered squares.
export const DENSE_AT = 12;

export const BY = {
  priority: (x, y) => rank(y.status) - rank(x.status) || y.seq - x.seq,
  order: (x, y) => x.tabIndex - y.tabIndex || byCreation(x, y),
};

/**
 * { all: Map<address, Member>, squads: [{ id, num, name, machine, members: Member[] }], flat: Member[] }
 * Member: { address, agent (AgentInfo, null for a child without a pane), program, status, title,
 *   space, spaceName, tab, tabIndex, pane, seq, pinned, focused, created, turn, parent (address | null),
 *   depth, kids (addresses), ident: IDENTITY.resolve(...) + { callsign } }
 * `sort` orders siblings (BY.priority or BY.order); children always stay under their parent.
 */
export function roster(sort = BY.priority) {
  const listed = agents();
  const terms = terminals();
  const termOf = new Map(terms.map((t) => [t.address, t]));
  const all = new Map();
  for (const a of listed) {
    all.set(a.address, {
      address: a.address, agent: a, program: a.program, status: a.status, title: a.title,
      space: a.space, spaceName: a.space_name, tab: a.tab, tabIndex: a.tab_index, pane: a.pane,
      seq: a.seq, pinned: a.pinned, focused: a.focused, parent: termOf.get(a.address)?.parent ?? null,
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

  // Identity in creation order: a repeated operator first takes a spare, then a callsign (PERLICA·2).
  const used = new Map();
  const spares = [...IDENTITY.spares()];
  for (const m of [...all.values()].sort(byCreation)) {
    let ident = IDENTITY.resolve(m.program, m.address, { parent: m.parent ? all.get(m.parent).program : null });
    const key = ident.operator ?? `program:${m.program?.key}`;
    if (used.has(key) && ident.operator && !ident.pinned) {
      const spare = spares.find((s) => !used.has(s));
      if (spare) ident = IDENTITY.as(spare, m.program);
    }
    const k = ident.operator ?? key;
    const n = (used.get(k) ?? 0) + 1;
    used.set(k, n);
    m.ident = { ...ident, callsign: `${ident.name.toUpperCase()}${n > 1 ? `·${n}` : ""}` };
  }

  const place = (m, depth) => [{ ...m, depth }, ...m.kids.map((k) => all.get(k)).sort(sort).flatMap((k) => place(k, depth + 1))];
  const squads = [];
  spaces().forEach((sp, i) => {
    const tops = [...all.values()].filter((m) => m.space === sp.id && !m.parent).sort((x, y) => (y.pinned - x.pinned) || sort(x, y));
    if (!tops.length) return;
    const members = tops.flatMap((m) => place(m, 0));
    for (const m of members) all.set(m.address, m);
    squads.push({ id: sp.id, num: String(i + 1).padStart(2, "0"), name: sp.name, machine: sp.machine ?? null, members });
  });
  return { all, squads, flat: squads.flatMap((q) => q.members) };
}

/** The most urgent status among some members. */
export const urgent = (members) => members.reduce((top, m) => (rank(m.status) > rank(top) ? m.status : top), "idle");
