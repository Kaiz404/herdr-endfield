// fleet: the status table and the roster rules, with no Herdr in them (tests/fleet.test.mjs runs
// them in node). roster.js feeds buildRoster() Herdr's live lists; kit.js re-exports the table.

// Every role reads a status through this table: its word, how its glyph draws, its bar colour,
// its entrance effect, its rank (how urgent) and whether its Squads row folds to one line.
export const STATUS = {
  blocked: { word: "Needs input", kind: "pill", bar: "signal", edge: "hazard", rank: 4 },
  error: { word: "Error", kind: "text", glyph: "×", hue: "error", bar: "red", rank: 4 },
  done: { word: "Finished", kind: "disc", glyph: "✓", bar: "lime", fresh: true, enter: ["flash", "pop"], rank: 3 },
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
 * { all: Map<address, Member>, squads: [{ id, num, name, machine, pinned?, members: Member[] }], flat: Member[],
 *   cast: Map<address, ident>, the `prev` of the next call, taken: the slots the members drew and `avoid` (see castCrew) }
 * Member: { address, agent (AgentInfo, null for a child without a pane), program, status, title,
 *   space, spaceName, tab, tabIndex, pane, seq, pinned, focused, created, turn, parent (address | null),
 *   depth, kids (addresses), urgency, model (id | null), ident: identity.resolve(...) + { callsign, drawn } }
 * Pinned agents (and their trees) come first, in a squad of their own ahead of every space's, so
 * the list and agent.next start with them. `sort` orders siblings; children stay under their parent.
 * identity: { resolve(program, terminal, {parent, model}) -> ident + {pool}, as(slug, program) } (IDENTITY in kit.js).
 * models: { address: model id } for the agents whose model is known.
 * prev: the last call's `cast`. avoid: slots a newcomer must not draw (the shown sub-agents', see held).
 */
export function buildRoster({ listed, terms, spaces, identity, models = {}, prev = null, avoid = [], sort = BY.priority }) {
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

  // Identity: an agent keeps its last draw while its pool stays the same (see castCrew), so one
  // closing or another's model arriving moves nobody else. Newcomers, in creation order, draw the
  // first operator of their pool nobody holds. A child of the same program with no model of its
  // own runs its parent's, as Claude Code's sub-agents do.
  const order = [...all.values()].sort(byCreation);
  for (const m of order) {
    const up = m.parent ? all.get(m.parent) : null;
    m.model = models[m.address] ?? (up && up.program?.key === m.program?.key ? up.model ?? null : null);
    m.ident = identity.resolve(m.program, m.address, { parent: up?.program ?? null, model: m.model });
  }
  const crew = castCrew(identity, prev, order.map((m) => ({ id: m.address, ident: m.ident, program: m.program })), new Set(avoid));
  for (const m of order) m.ident = crew.get(m.address);
  const taken = new Set([...held([...crew.values()]), ...avoid]);

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
  return { all, squads, flat: squads.flatMap((q) => q.members), cast: crew, taken };
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

// ---- casting: which operator an agent is drawn as. IDENTITY in kit.js reads the art pack and the
// person's overrides; the rules are here, so tests/fleet.test.mjs can run them.

// Stronger models draw stronger operators. The lowercased model id (any "vendor/" prefix dropped)
// is tested against `rules` in order and the first match names its tier; the tier's pool is the
// draw order. A model no rule knows draws `fallback`. docs/CASTING.md has the game facts and sources.
export const CASTING = {
  rules: [
    [/fable|mythos/, "fable"],
    [/haiku|nano|flash-?lite|tiny/, "haiku"],
    [/opus/, "opus"],
    [/sonnet/, "sonnet"],
    [/^gpt-[a-z0-9.-]*-pro|^o\d+-pro|deep-?think|ultra|grok-[a-z0-9.-]*heavy/, "fable"],
    [/gemini-[a-z0-9.-]*flash/, "sonnet"],
    // "mini" as a word of its own (gpt-5-mini, o4-mini), never the end of "gemini".
    [/(^|[-_.])mini($|[-_.])/, "sonnet"],
    [/flash|fast|(^|[-:/])\d{1,2}b($|[-_.])/, "haiku"],
    [/composer|cursor/, "sonnet"],
    [/gemini-[a-z0-9.-]*pro|^gpt-\d|codex|^o\d|grok|deepseek.*(pro|reasoner)|kimi.*pro/, "opus"],
    [/deepseek|kimi|qwen|glm|minimax|mistral|devstral|codestral|llama|mimo|hy\d/, "sonnet"],
  ],
  pools: {
    fable: ["arcane", "argent-flow", "mi-fu", "rossi", "si", "zhuang-fangyi", "camille", "tangtang", "gilberta"],
    opus: ["laevatain", "yvonne", "ardelia", "last-rite", "typhoeus", "liino", "pogranichnik", "lifeng", "kay", "perlica", "xaihi"],
    sonnet: ["chen-qianyu", "avywenna", "ember", "snowshine", "arclight", "wulfgard", "da-pan", "alesh", "mimino", "purrchena"],
    haiku: ["akekuri", "antal", "catcher", "estella", "fluorite"],
  },
  fallback: "endministrator",
};

/** A model id's tier ("fable" | "opus" | "sonnet" | "haiku"), or null when no rule knows it. */
export const tierOf = (model) => {
  const id = String(model ?? "").toLowerCase().split("/").pop();
  return CASTING.rules.find(([re]) => re.test(id))?.[1] ?? null;
};

/** The operators a model draws from, in order; null when there is no model. */
export const poolFor = (model) => (model ? CASTING.pools[tierOf(model)] ?? [CASTING.fallback] : null);

/**
 * Who an agent is drawn as. First listed wins: its terminal's pin, the person's override for a
 * same-program child ("sub-agent") or for its program, its model's pool (the members the art pack
 * has), then the pack's defaults: "sub-agent" for a same-program child, its program, "shell".
 * cast: {terminals, overrides, defaults: {key: slug | null}, operators: {slug: any}, spares: slug[]}
 * -> {slug (null: the program's own tile), pinned, claim: a pin or override named it, pool: the draw order, spares last}
 */
export function choose(cast, program, terminal, { parent = null, model = null } = {}) {
  const pinned = cast.terminals[terminal];
  const child = Boolean(parent) && parent.key === program?.key;
  const chosen = [pinned, child ? cast.overrides["sub-agent"] : undefined, cast.overrides[program?.key]].find((v) => v !== undefined);
  const tier = chosen === undefined ? (poolFor(model) ?? []).filter((s) => cast.operators[s]) : [];
  const slug = chosen !== undefined ? chosen : tier[0] ?? [child ? cast.defaults["sub-agent"] : undefined, cast.defaults[program?.key], cast.defaults.shell].find((v) => v !== undefined);
  const own = slug && cast.operators[slug] ? slug : null;
  const pool = own ? [...new Set([...(tier.length ? tier : [own]), ...(pinned === undefined ? cast.spares : [])])] : [`program:${program?.key}`];
  return { slug: own, pinned: pinned !== undefined, claim: chosen !== undefined && Boolean(own), pool };
}

// The endfield mod has two pane roles, Comms and a sub-agent's transcript. panes() reports a mod
// pane's mod but not its props, so the roles are told apart by a registry kept in shared(PANE_ROLES):
// { roles: {pane: role}, opening: {tab: role} }. An opener calls opening() just before its
// pane.split, which records every endfield pane open now; the one that then appears in that tab has
// the role being opened. An endfield pane the registry never saw is Comms, the only pane role before.
export const PANE_ROLES = "endfield.panes";
// Transcript panes opened before the transcript was a role; that mod folder is gone after an upgrade.
const RETIRED_TRANSCRIPT = "endfield-transcript";

export function paneRole(reg, p) {
  if (p.mod === RETIRED_TRANSCRIPT) return "transcript";
  if (p.mod !== "endfield") return null;
  return reg?.roles?.[p.pane] ?? reg?.opening?.[p.tab] ?? "comms";
}

/** The registry once `role` is about to open in `tab`: every live endfield pane's role fixed, the dead dropped. */
export function opening(reg, panes, tab, role) {
  const roles = Object.fromEntries(panes.filter((p) => p.mod === "endfield").map((p) => [p.pane, paneRole(reg, p)]));
  const tabs = new Set(panes.map((p) => p.tab));
  const pending = Object.entries(reg?.opening ?? {}).filter(([t]) => t !== tab && tabs.has(t));
  return { roles, opening: { ...Object.fromEntries(pending), [tab]: role } };
}

const slot = ({ slug, n }) => `${slug}·${n}`;

/** The first of `pool` that `taken` doesn't hold: each once, then each again as ·2, and so on. -> {slug, n, from} */
export function draw(pool, taken) {
  for (let n = 1; ; n++) for (const slug of pool) if (!taken.has(slot({ slug, n }))) return { slug, n, from: pool.join() };
}

// ident: identity.resolve(...), whose pool[0] it draws as; d: the drawn slot.
const named = (identity, ident, program, d) => {
  const got = d.slug === ident.pool[0] ? ident : identity.as(d.slug, program);
  return { ...got, callsign: `${got.name.toUpperCase()}${d.n > 1 ? `·${d.n}` : ""}`, drawn: d };
};

/** Draws one agent around `taken` (and adds it there): identity.resolve(...) + { callsign, drawn }. */
export function cast(identity, ident, program, taken) {
  const d = draw(ident.pool, taken);
  taken.add(slot(d));
  return named(identity, ident, program, d);
}

/**
 * Draws a crew (a session's sub-agents, or the pane agents). Claims draw first: an agent a pin or
 * override names (ident.claim) takes that operator ahead of the rest, so a new pin gets the bare
 * callsign. Every other agent keeps what it drew while it stays and draws from the same pool,
 * unless a claim now holds its slot; a new model tier, pin or override redraws it. Newcomers, in
 * start order, draw around `taken`, so siblings differ and a number appears only once a pool is
 * spent: ARDELIA·2, never ARDELIA·30. prev: Map<id, ident> from the last render;
 * crew: [{id, startedAt?, ident, program}] -> Map<id, ident + { callsign, drawn }>
 */
export function castCrew(identity, prev, crew, taken) {
  const out = new Map();
  const started = [...crew].sort((x, y) => (x.startedAt ?? 0) - (y.startedAt ?? 0));
  for (const k of started) if (k.ident.claim) out.set(k.id, cast(identity, k.ident, k.program, taken));
  const claimed = new Set(held([...out.values()]));
  for (const k of crew) {
    const d = prev?.get(k.id)?.drawn;
    if (!out.has(k.id) && d?.from === k.ident.pool.join() && !claimed.has(slot(d))) { taken.add(slot(d)); out.set(k.id, named(identity, k.ident, k.program, d)); }
  }
  for (const k of started) if (!out.has(k.id)) out.set(k.id, cast(identity, k.ident, k.program, taken));
  return out;
}

/** The slots `idents` hold, for draws that must not repeat them. */
export const held = (idents) => idents.flatMap((i) => (i?.drawn ? [slot(i.drawn)] : []));

// A sub-agent's transcript shows in one pane per tab, docked right of its parent.
export const transcriptsIn = (panes, tab, reg) => panes.filter((p) => p.tab === tab && paneRole(reg, p) === "transcript");

// What a click on a sub-agent does in its parent's tab. `shown`: the path that tab's pane was
// opened on. The one already shown is focused; any other click replaces every transcript pane
// there with one new split, because a mod pane's props can't change once it is open. A pane of the
// retired mod is always replaced, since it can only show an error.
export function transcriptPlan(panes, tab, shown, path, reg) {
  const open = transcriptsIn(panes, tab, reg);
  if (open.length === 1 && shown === path && open[0].mod === "endfield") return { focus: open[0].pane };
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
