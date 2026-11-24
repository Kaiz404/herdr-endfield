// report: the full oversight screen, the AIC report for agents. It is a block of the layout (the
// work area's stack, "work-stack": main or report), so it covers the work area at any size while
// the squad sidebar stays live beside it. Grouped by squad like team formations, sortable by
// heading, compact past 12 agents, and it scrolls.
// Output over 10 minutes and the rate come from the token totals the squad list publishes
// (shared "endfield.sessions", Claude Code only); other agents read "—" there.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, shared, layout } from "herdr";
import { palette, root, statusMark, chip, micro, spaced, wide, pad2, barcode, growDisc, find, Entrance, FONT } from "./kit.js";
import { roster } from "./roster.js";
import { DENSE_AT, fmtTokens } from "./fleet.js";
import { openArchived } from "./actions.js";

export const REPORT = { stack: "work-stack", work: "main", report: "report" };
export const toggleReport = (open) => run("layout.select", { stack: REPORT.stack, child: open ? REPORT.report : REPORT.work });
/** The panes back in view if the report covers them: every action that focuses an agent runs this first. */
export const showWork = () => { if (find(layout(), REPORT.stack)?.active === REPORT.report) toggleReport(false); };
/** Focuses an agent's pane, or peeks a child that has none, with the panes in view. */
export function goTo(m) {
  showWork();
  run(m.pane ? "pane.focus" : "terminal.peek", m.pane ? { pane: m.pane } : { terminal: m.address });
}

const WINDOW_MS = 10 * 60000;
const BARS = 16;
// Status order: Needs input, then Finished, Generating, Idle.
const ORDER = { blocked: 0, error: 0, done: 1, waiting: 1.5, working: 2, idle: 3 };
const COLS = [
  { k: "name", label: "Agent", grow: 2.3, key: (r) => r.m.label },
  { k: null, label: ["Session", "link"], grow: 1.25 },
  { k: null, label: ["Output", "10 min"], grow: 1.4 },
  { k: "rate", label: "Rate", grow: 0.8, key: (r) => -r.rate },
  { k: "ctx", label: "Reserves", grow: 0.9, key: (r) => -(r.ctx?.pct ?? -1) },
  { k: "turn", label: "Turn", grow: 0.45, key: (r) => -(r.m.turn ?? -1) },
  { k: "status", label: "Status", grow: 1, key: (r) => ORDER[r.m.status] ?? 4 },
];
const LETTER = { claude: "Claude Code", codex: "Codex", cursor: "Cursor", opencode: "OpenCode", gemini: "Gemini" };

export class Report {
  init(_props, cx) {
    // How the person left it (sort, direction, grouping, folded squads) survives a reload.
    let view = {};
    try { view = JSON.parse(localStorage.getItem("report.view") ?? "{}") ?? {}; } catch {}
    this.sort = COLS.some((c) => c.k && c.k === view.sort) ? view.sort : "status";
    this.dir = view.dir === -1 ? -1 : 1;
    this.group = view.group !== false;
    this.folded = new Set(Array.isArray(view.folded) ? view.folded : []);
    this.samples = new Map();
    this.width = 900;
    this.entrance = new Entrance(2);
    this.entrance.start(cx);
  }

  keep(cx) {
    localStorage.setItem("report.view", JSON.stringify({ sort: this.sort, dir: this.dir, group: this.group, folded: [...this.folded] }));
    cx.notify();
  }

  // Token totals over time, per agent, for the last 10 minutes.
  sample(sessions, now) {
    for (const [address, s] of Object.entries(sessions ?? {})) {
      if (s.tokens == null) continue;
      const list = this.samples.get(address) ?? [];
      if (list.at(-1)?.v !== s.tokens) list.push({ t: now, v: s.tokens });
      while (list.length > 1 && now - list[0].t > WINDOW_MS) list.shift();
      this.samples.set(address, list);
    }
  }

  // Tokens per minute bucket over the window: the sparkline, and the last minute's rate.
  output(address, now) {
    const list = this.samples.get(address) ?? [];
    const bars = Array(BARS).fill(0);
    for (let i = 1; i < list.length; i++) {
      const b = Math.min(BARS - 1, Math.floor((WINDOW_MS - (now - list[i].t)) / (WINDOW_MS / BARS)));
      if (b >= 0) bars[b] += list[i].v - list[i - 1].v;
    }
    const before = [...list].reverse().find((x) => now - x.t >= 60000) ?? list[0];
    return { bars, rate: list.length > 1 ? Math.max(0, list.at(-1).v - before.v) : 0, known: list.length > 0 };
  }

  head(C, label, k) {
    const on = k && k === this.sort;
    return h_flex().id(`rh-${[label].flat()[0]}`).gap(5).items_center().when(Boolean(k), (el) => el.cursor_pointer().on_click((_e, cx) => {
      if (this.sort === k) this.dir = -this.dir; else { this.sort = k; this.dir = 1; }
      this.keep(cx);
    }))
      .child(div().px(6).py(4).ml(-6).rounded(2).when(on, (el) => el.bg(C.selBg)).child(spaced([label].flat(), on ? C.selText : C.muted, { rest: on ? C.selMuted : C.dim, gap: 5 })))
      .when(Boolean(k), (el) => el.child(micro(on ? (this.dir > 0 ? "▼" : "▲") : "↕", on ? C.text : C.hairStrong, 9)));
  }

  render() {
    const C = palette();
    const now = Date.now();
    const sessions = shared("endfield.sessions") ?? {};
    this.sample(sessions, now);
    const R = roster();
    const dense = R.all.size >= DENSE_AT;
    const RH = dense ? 30 : 46;
    const col = COLS.find((c) => c.k === this.sort) ?? COLS.at(-1);
    const cmp = (x, y) => {
      const a = col.key(x), b = col.key(y);
      return (typeof a === "string" ? a.localeCompare(b) : a - b) * this.dir;
    };
    const rowOf = (m) => ({ m, ctx: sessions[m.address]?.ctx ?? null, ...this.output(m.address, now) });
    // Children stay under their parent whatever the sort, so a tree never splits.
    const tree = (members) => {
      const rows = new Map(members.map((m) => [m.address, rowOf(m)]));
      const tops = members.filter((m) => !m.parent || !rows.has(m.parent)).map((m) => rows.get(m.address)).sort(cmp);
      const walk = (r, depth) => [{ ...r, depth }, ...r.m.kids.filter((k) => rows.has(k)).map((k) => rows.get(k)).sort(cmp).flatMap((k) => walk(k, depth + 1))];
      return tops.flatMap((r) => walk(r, 0));
    };
    const groups = this.group ? R.squads.map((q) => ({ q, rows: tree(q.members) })) : [{ q: null, rows: tree(R.flat) }];
    const count = (s) => R.flat.filter((m) => m.status === s).length;
    const tokens = [...this.samples.values()].reduce((n, l) => n + (l.length > 1 ? l.at(-1).v - l[0].v : 0), 0);
    const term = (a, b) => spaced([[a, C.text], [b, C.muted]], C.text, { gap: 4 });
    const vendors = new Set(R.flat.map((m) => m.program?.key)).size;
    const stats = [
      ["Squads", pad2(R.squads.length), C.hairStrong], ["Agents", pad2(R.flat.length), C.hairStrong], ["Generating", pad2(count("working")), C.flow],
      ["Needs input", pad2(count("blocked")), C.signal], ["Finished", pad2(count("done")), C.lime], [["Tokens", "10 min"], tokens ? fmtTokens(tokens) : "—", C.hairStrong],
    ];
    const inner = Math.max(400, this.width - 40 - 12 * (COLS.length - 1));
    const total = COLS.reduce((n, c) => n + c.grow, 0);
    const w = (i) => (inner * COLS[i].grow) / total;
    const cells = (els) => h_flex().gap(12).items_center().children(els.map((el, i) => div().w(w(i)).flex_none().min_w(0).child(el)));
    const chipSize = (d) => (dense ? (d ? 20 : 22) : d ? 26 : 30);
    const indent = (d) => (d ? (dense ? 24 : 28) * d : 0);

    const row = (r) => {
      const { m } = r;
      const on = m.focused;
      const fg = on ? C.selText : C.text, meta = on ? C.selMuted : C.muted;
      const parent = m.parent ? R.all.get(m.parent) : null;
      const link = parent ? [`◀ ${parent.address.toUpperCase()}`, parent.program?.key === m.program?.key ? "same vendor" : `${LETTER[parent.program?.key] ?? parent.program?.name} ▶ ${LETTER[m.program?.key] ?? m.program?.name}`] : m.kids.length ? [`${m.kids.length} children`] : [];
      const hot = (r.ctx?.pct ?? 0) >= 75;
      const peak = Math.max(1, ...r.bars);
      const cell = (edge, value, unit, color) => h_flex().gap(5).items_end().px(8).py(3).border_l(2).border_color(edge).bg(on ? "#262626" : C.ground).rounded_r(3)
        .child(div().font_semibold().text_color(color ?? fg).child(value)).child(micro(unit, meta));
      const size = chipSize(r.depth);
      return h_flex().id(`rr-${m.address}`).relative().h(RH).flex_none().px(20).items_center().border_b(1).border_color(on ? C.selBg : C.hair)
        .when(on, (el) => el.bg(C.selBg)).text_color(fg).cursor_pointer()
        .hover((s) => (on ? s : s.bg(C.sunken)))
        .on_click(() => goTo(m))
        .child(cells([
          h_flex().relative().h(RH).pl(indent(r.depth)).gap(9).items_center()
            .when(r.depth > 0, (el) => el.child(div().absolute().left(indent(r.depth) - (dense ? 13 : 15)).top(-4).w(10).h(RH / 2 + 4).border_l(1).border_b(1).border_color(on ? C.selMuted : C.hairStrong)))
            .child(chip(C, m.ident, m.status, { size, on, ground: on ? C.selBg : C.raised }))
            .child((dense ? h_flex().gap(8).items_center() : v_flex().gap(4)).min_w(0)
              .child(wide(m.label, fg, 9.5).flex_none())
              .child(div().min_w(0).truncate().font_medium().text_size(dense ? 12 : 13).child(m.title))),
          h_flex().gap(6).items_center().min_w(0).child(micro(m.address, fg).flex_none()).child(h_flex().min_w(0).gap(8).children(link.map((t) => div().min_w(0).truncate().font_family(FONT.mono).text_size(10).text_color(meta).child(t)))),
          h_flex().h(dense ? 20 : 28).p(3).gap(2).items_end().rounded(3).bg(on ? "#2C2C2C" : C.sunken)
            .children(r.bars.map((b) => div().flex_1().h(r.known ? Math.max(2, ((dense ? 14 : 22) * b) / peak) : 2).bg(on ? C.selText : C.text))),
          cell(on ? C.flowInv : C.flow, r.known ? fmtTokens(r.rate) : "—", "/min"),
          cell(hot ? C.red : C.hairStrong, r.ctx ? fmtTokens(r.ctx.used) : "—", r.ctx ? `/${fmtTokens(r.ctx.total)}` : "", hot ? (on ? C.errorInv : C.error) : null),
          micro(m.turn != null ? pad2(m.turn) : "—", fg),
          h_flex().child(statusMark(C, m.status, { inv: on, size: 11 }) ?? div()),
        ]));
    };

    const header = (g) => {
      const folded = this.folded.has(g.q.id);
      const blk = g.q.members.filter((m) => m.status === "blocked").length;
      const gen = g.q.members.filter((m) => m.status === "working").length;
      const done = g.q.members.filter((m) => m.status === "done").length;
      return h_flex().id(`rg-${g.q.id}`).h(28).flex_none().px(20).gap(10).items_center().bg(C.ground).border_b(1).border_color(C.hair).cursor_pointer()
        .on_click((_e, cx) => { folded ? this.folded.delete(g.q.id) : this.folded.add(g.q.id); this.keep(cx); })
        .child(div().w(22).h(16).flex().items_center().justify_center().rounded(3).bg(C.selBg).font_family(FONT.mono).text_size(9).text_color(C.selText).child(g.q.num))
        .child(wide(g.q.name, C.text, 10))
        .child(micro(`${pad2(g.q.members.length)} agents`, C.muted))
        .child(h_flex().pl(4).children(g.q.members.slice(0, 6).map((m, i) => div().ml(i ? -5 : 0).child(chip(C, { ...m.ident, badge: null }, m.status, { size: 16 })))))
        .child(div().flex_1().h(1).bg(C.hair))
        .child(micro(`▶▶ ${gen}   ✓ ${done}`, C.muted))
        .when(blk > 0, (el) => el.child(h_flex().h(14).px(6).gap(4).items_center().bg(C.signal).text_size(9).font_semibold().text_color(C.ink).child(`! ${blk} need input`)))
        .child(micro(folded ? "▸" : "▾", C.muted).w(8));
    };

    const bracket = (x, y, sides) => div().absolute().size(10).border_color(C.text)
      .when(x === "l", (el) => el.left(-7).border_l(1.5)).when(x === "r", (el) => el.right(-7).border_r(1.5))
      .when(y === "t", (el) => el.top(-7).border_t(1.5)).when(y === "b", (el) => el.bottom(-7).border_b(1.5));
    return root(C, this.entrance.apply(div().size_full().p(10).bg(C.sunken).child(v_flex().id("report").relative().size_full().bg(C.raised).border_1().border_color(C.hairStrong).rounded(4)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 1) { this.width = size.width; cx.notify(); } })
      .child(bracket("l", "t")).child(bracket("r", "t")).child(bracket("l", "b")).child(bracket("r", "b"))
      .child(h_flex().px(20).pt(16).pb(14).gap(14).items_end().border_b(1).border_color(C.hair)
        .child(v_flex().gap(8)
          .child(h_flex().gap(8).items_center().child(spaced(["Oversight", "every squad", "last 10 min"], C.muted, { rest: C.dim })).child(barcode(C.cross, 34)))
          .child(div().text_size(18).font_semibold().child("// Report")))
        .child(div().flex_1())
        .child(h_flex().gap(22).items_end().children(stats.map(([label, n, edge]) => v_flex().gap(6).items_end().pl(12).border_l(2).border_color(edge)
          .child(spaced([label].flat(), C.muted, { rest: C.dim, gap: 6 })).child(wide(n, C.text, 22)))))
        .child(div().id("report-close").relative().size(30).ml(8).rounded_full().border_1().border_color(C.hairStrong).flex().items_center().justify_center().cursor_pointer()
          .on_hover((over, cx) => { this.hot = over; cx.notify(); })
          .tooltip("Close the report").on_click(() => toggleReport(false))
          .child(growDisc("report-close-disc", 30, 30, 28, Boolean(this.hot), C.red))
          .child(div().relative().text_size(11).text_color(this.hot ? C.ink : C.text).child("×"))))
      .child(h_flex().px(20).py(10).gap(8).items_center().border_b(1).border_color(C.hair)
        .child(div().id("report-group").px(10).py(6).rounded_full().border_1().border_color(C.hairStrong).cursor_pointer()
          .when(this.group, (el) => el.bg(C.selBg))
          .on_click((_e, cx) => { this.group = !this.group; this.keep(cx); })
          .child(spaced([["Group", this.group ? C.selMuted : C.muted], [this.group ? "Squad" : "None", this.group ? C.selText : C.text]], C.text, { gap: 6 })))
        .child(div().id("report-archived").px(10).py(6).rounded_full().border_1().border_color(C.hairStrong).cursor_pointer()
          .tooltip("Chats archived from a session card, with Resume").on_click(() => openArchived())
          .child(micro("Archived", C.text)))
        .child(div().flex_1())
        .child(spaced(["Click a heading to sort", "click a row to focus it"], C.muted, { gap: 16 })))
      .child(h_flex().h(32).flex_none().px(20).items_center().border_b(1).border_color(C.hair)
        .child(cells(COLS.map((c) => this.head(C, c.label, c.k)))))
      .child(v_flex().id("report-rows").flex_1().min_h(0).overflow_y_scrollbar()
        .children(groups.flatMap((g) => [...(g.q ? [header(g)] : []), ...(g.q && this.folded.has(g.q.id) ? [] : g.rows.map(row))])))
      .child(h_flex().h(34).flex_none().px(20).gap(16).items_center().border_t(1).border_color(C.hair)
        .child(h_flex().gap(6).items_center().child(div().w(10).h(8).border_l(1).border_b(1).border_color(C.text)).child(micro("Child started with hc run, any vendor", C.muted)))
        .child(h_flex().gap(12).items_center().child(micro("Badge", C.dim))
          .children([["C", "Claude Code"], ["X", "Codex"], ["Cu", "Cursor"], ["O", "OpenCode"], ["G", "Gemini"]].map(([b, name]) => term(b, name))))
        .child(div().flex_1())
        .child(h_flex().gap(12).items_center().child(term(pad2(R.flat.length), "agents")).child(term(pad2(R.squads.length), "squads")).child(term(vendors, "vendors")))))));
  }
}
