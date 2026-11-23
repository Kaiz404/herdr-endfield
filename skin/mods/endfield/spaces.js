// spaces: grouped by machine once one isn't this computer, worktrees under their
// checkout. Behaviour ported from the shipped `spaces` mod: git refresh policy,
// machine fold / login Copy / Connect, worktree reordering, drag to reorder,
// right-click menu, keeping the active space in view.

import { div } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { spaces, machines, panes, run, openOverlay, exec, hc, watchFolder, window as appWindow } from "herdr";
import { palette, root, narrow, statusOf, glyph, freshDot, micro, wide, icon, pad2, path, wipe, slide, nudge, Entrance, FONT } from "./kit.js";

function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
const RAIL = 28;
// Fixed heights, so the selection block knows where the selected row starts.
const H = { row: 38, head: 28, note: 30, guidance: 48 };
// Changes made outside Herdr (an editor's save, a commit elsewhere) are looked for this often.
const FALLBACK = 60000;
// Places looked at together: all at once, hundreds of spaces exhaust open files or a core's execs.
const AT_ONCE = 6;

async function both(a, b) {
  const done = await Promise.allSettled([a, b]);
  const failed = done.find((d) => d.status === "rejected");
  if (failed) throw failed.reason;
  return done.map((d) => d.value);
}

export default class Spaces {
  init(_props, cx) {
    this.git = {};
    this.checked = {};
    this.unsure = new Set();
    this.pending = new Set();
    this.busy = {};
    this.ready = {};
    this.at = {};
    this.watching = new Map();
    // New spaces wait a moment for git, so a worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.scroll = ScrollHandle.new();
    this.activeAt = -1;
    this.machines = [];
    this.width = 0;
    this.hover = null;
    this.entrance = new Entrance(1);
    this.entrance.start(cx);
    try {
      this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
      if (!this.reconnecting || typeof this.reconnecting !== "object" || Array.isArray(this.reconnecting)) this.reconnecting = {};
      for (const state of Object.values(this.reconnecting)) state.busy = false;
    } catch { this.reconnecting = {}; }
    try { this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]")); } catch { this.folded = new Set(); }
    this.refreshMachines(cx);
    cx.timer.every(15000, (cx) => this.refreshMachines(cx));
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id)) || this.orderingDue(now)) cx.notify();
  }

  // Places whose git could have changed: new ones, where a command or agent turn just
  // ended, those on a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    for (const k of Object.keys(this.git)) if (!keys.has(k)) {
      delete this.git[k];
      delete this.checked[k];
      this.unsure.delete(k);
    }
    const repos = new Set(Object.values(this.git).filter(Boolean).map((g) => g.repo));
    for (const [repo, pending] of this.watching) if (!repos.has(JSON.stringify([null, repo]))) {
      this.watching.delete(repo);
      pending.cancel();
    }
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (appWindow().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async (cx) => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const ask = async (args) => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(AT_ONCE, keys.length) }, async () => {
          while (next < keys.length) await this.check(keys[next++], cx);
        }));
      }
      this.refreshing = false;
      cx.notify();
    });
  }

  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // Ref-only reads avoid scanning the worktree or waking its index watch.
      const [r, common] = await both(
        exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd, on }),
        exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on }),
      );
      if (r.code !== 0 || common.code !== 0) {
        if (!/not a git repository/i.test(r.code !== 0 ? r.stderr : common.stderr)) {
          this.unsure.add(key);
          this.git[key] ??= null;
        } else this.git[key] = null;
        return;
      }
      const top = r.stdout.replace(/\n$/, ""), repo = common.stdout.replace(/\n$/, "");
      const [branch, counts] = await both(
        exec("git", ["symbolic-ref", "-q", "HEAD"], { cwd, on }),
        exec("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { cwd, on }),
      );
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const [ahead, behind] = counts.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [0, 0];
      this.git[key] = { name, branch: branch.code === 0 ? branch.stdout.trim().replace(/^refs\/heads\//, "") : "(detached)", ahead, behind, repo: JSON.stringify([on, repo]), linked: repo !== `${top}/.git` };
      if (!on) this.watch(repo, cx);
    } catch {
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    const pending = watchFolder(repo);
    this.watching.set(repo, pending);
    cx.spawn(async (cx) => {
      let current = pending;
      try {
        for (;;) {
          await current;
          if (this.watching.get(repo) !== current) return;
          const mine = JSON.stringify([null, repo]);
          const keys = Object.keys(this.git).filter((k) => this.git[k]?.repo === mine);
          if (!keys.length) break;
          this.refreshGit(keys, cx);
          current = watchFolder(repo);
          this.watching.set(repo, current);
        }
      } catch {}
      if (this.watching.get(repo) === current) this.watching.delete(repo);
    });
  }

  menu(w) {
    openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });
  }

  orderingDue(now) {
    return this.ordering && now - this.ordering.at >= 1000
      && this.ordering.machines.every((name) => machines().some((m) => m.name === name && m.layout === "ready"));
  }

  // Spaces in order, each worktree space moved under its main checkout's (and the model reordered to match).
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set();
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "last" : "mid" }));
    }
    // Simulate the batch so later indexes include earlier moves; a lost sync conflict retries after the echo.
    const order = sp.map((w) => w.id);
    const target = out.map((r) => r.w.id);
    const key = JSON.stringify([order, target, machines()]);
    if (order.every((id, i) => id === target[i])) {
      this.ordering = null;
    } else if (this.ordering?.key !== key || this.orderingDue(Date.now())) {
      const moved = new Set();
      this.ordering = { key, at: Date.now(), machines: [] };
      for (let i = 0; i < out.length; i++) {
        const from = order.indexOf(out[i].w.id);
        if (from === i) continue;
        run("space.move", { id: out[i].w.id, index: i + 1 });
        moved.add(out[i].w.machine ?? null);
        order.splice(i, 0, order.splice(from, 1)[0]);
      }
      this.ordering.machines = [...moved];
    }
    return out.filter((r) => this.shown.has(r.w.id));
  }

  grouped(C, collapsed) {
    const rows = this.ordered();
    const draw = (r) => (collapsed ? this.compact(r, C) : this.row(r, C));
    this.activeAt = -1;
    this.activeTop = -1;
    let before = 0, beforePx = 0;
    const remote = [...new Set([...rows.map((r) => r.w.machine).filter(Boolean), ...this.machines.map((m) => m.name), ...Object.keys(this.reconnecting)])].sort();
    const loading = (m) => {
      const layout = machines().find((k) => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some((k) => k.name === m && k.state === "connected"))
        || spaces().some((s) => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = (m) => h_flex().id(`machine-loading-${m ?? "local"}`).h(H.note).flex_none().px(collapsed ? 0 : 16).items_center()
      .when(collapsed, (el) => el.justify_center()).child(micro(collapsed ? "…" : "Loading…", C.dim));
    if (!remote.length) {
      if (loading(null) && !rows.length) return [loadingRow(null)];
      this.activeAt = rows.findIndex((r) => r.w.active);
      this.activeTop = this.activeAt * H.row;
      return rows.map(draw);
    }
    return [null, ...remote].flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find((k) => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const login = machine?.state === "needs_login" ? `hc machine login ${m}` : null;
      const folded = this.folded.has(m);
      const state = !m ? "local" : connected ? "connected" : (machine?.state ?? "asleep").replace(/_/g, " ");
      const lamp = div().size(5).flex_none().bg(connected ? C.lime : C.dim);
      const head = h_flex().id(`machine-${m ?? "local"}`).flex_none().items_center().cursor_pointer()
        .when(collapsed, (el) => el.mt(6).w(RAIL).h(24).justify_center().rounded(3).relative()
          .tooltip(login ? `${m} needs a login: run ${login}. Click for Settings.` : m ? `${m} · ${state}` : "This computer")
          .child(icon(m ? "server" : "monitor", 13).text_color(C.muted))
          .when(Boolean(m), (el) => el.child(lamp.absolute().right(4).bottom(3))))
        .when(!collapsed, (el) => el.h(H.head).px(16).gap(8))
        .hover((s) => s.bg(C.sunken))
        .on_click((_e, cx) => {
          if (collapsed && login) { run("app.settings", { section: "machines" }); return; }
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .when(!collapsed, (el) => el
          .child(wide(m ?? "This machine", C.muted, 10).flex_shrink(1).min_w(0).truncate())
          .child(div().flex_1().h(1).bg(C.hair))
          .when(machine?.keeps_running_after_logout === false, (el) => el.child(div().id(`machine-logout-${m}`)
            .flex_none().text_color(C.error).tooltip("Agents stop when you disconnect. Click for the fix.")
            .on_click((_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "machine-add", kind: "dialog", width: 560 }); }).child("⚠")))
          .when(!rebuilt && !login && Boolean(m), (el) => el.child(h_flex().gap(5).items_center().child(lamp).child(micro(state, C.muted))))
          .when(rebuilt, (el) => el.child(h_flex().flex_none().gap(6).items_center()
            .child(div().max_w(120).truncate().child(micro(repair?.error || "rebuilt", repair?.error ? C.error : C.muted)))
            .child(div().id(`machine-connect-${m}`).px(8).h(18).flex().items_center().rounded_full().bg(C.signal).text_color(C.ink)
              .text_size(10.5).font_semibold().hover((s) => s.bg(C.signalHover))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .when(connected, (el) => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().size(18).flex().items_center().justify_center()
            .rounded_full().text_color(C.muted).hover((s) => s.bg(C.raised).text_color(C.text)).tooltip(`New space on ${m ?? "this computer"}`)
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); }).child(icon("plus", 11))))
          .child(icon(folded ? "chevron-right" : "chevron-down", 10).text_color(C.muted)));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(H.note).flex_none().px(collapsed ? 0 : 16).gap(8).items_center().rounded(3)
        .text_size(12).text_color(C.dim).hover((s) => s.bg(C.sunken).text_color(C.text))
        .on_click(() => run("space.new", { machine: m ?? "" }))
        .when(collapsed, (el) => el.w(RAIL).justify_center().tooltip(`New space on ${m ?? "this computer"}`).child(icon("plus", 11)))
        .when(!collapsed, (el) => el.child(icon("plus", 11)).child("New space there"));
      if (!collapsed && rebuilt) { before += 1; beforePx += H.head; return [head]; }
      const cell = collapsed ? (el) => h_flex().flex_none().justify_center().child(el) : (el) => el;
      const guidance = !collapsed && login ? [v_flex().h(H.guidance).px(16).pt(4).pb(8).gap(5).flex_none()
        .child(micro("Needs a login: run", C.error))
        .child(h_flex().gap(6).items_center()
          .child(div().flex_1().min_w(0).truncate().tooltip(login).font_family(FONT.mono).text_size(11).text_color(C.muted).child(login))
          .child(div().id(`machine-login-copy-${m}`).flex_none().px(8).h(20).flex().items_center().rounded_full().border_1().border_color(C.hairStrong)
            .text_size(11).font_medium().text_color(C.text).bg(C.raised).cursor_pointer().hover((s) => s.bg(C.sunken))
            .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(login); this.copiedLogin = login; cx.notify(); })
            .child(this.copiedLogin === login ? "Copied" : "Copy")))] : [];
      const items = [cell(head), ...guidance, ...(folded ? [] : mine.length ? mine.map(draw) : [loading(m) ? loadingRow(m) : cell(empty)])];
      const first = folded ? -1 : mine.findIndex((r) => r.w.active);
      if (first >= 0) {
        this.activeAt = before + 1 + guidance.length + first;
        this.activeTop = beforePx + H.head + guidance.length * H.guidance + first * H.row;
      }
      before += items.length;
      beforePx += H.head + guidance.length * H.guidance + (folded ? 0 : mine.length ? mine.length * H.row : H.note);
      return items;
    });
  }

  // The micro-label: tabs, then only what git says that the name doesn't (repo, branch, ahead/behind).
  tail(w, g, tree) {
    const same = (a) => a.toLowerCase() === w.name.toLowerCase();
    const parts = [];
    if (!tree) parts.push(`${w.tabs.length} ${w.tabs.length === 1 ? "tab" : "tabs"}`);
    if (g) {
      if (!tree && !same(g.name)) parts.push(g.name);
      if (!same(g.branch ?? "")) parts.push(g.branch ?? "detached");
      const sync = [g.ahead > 0 ? `↑${g.ahead}` : "", g.behind > 0 ? `↓${g.behind}` : ""].filter(Boolean).join(" ");
      if (sync) parts.push(sync);
    }
    return parts.join(" · ");
  }

  // What a space says at its right, read from the status table: unseen gets the new-dot too.
  signal(C, s, inv) {
    const st = statusOf(s);
    if (!st) return null;
    return h_flex().flex_none().gap(6).items_center()
      .when(Boolean(st.fresh), (el) => el.child(freshDot(C, 7)))
      .child(glyph(C, s, { inv, size: 11 }));
  }

  row({ w, i, g, tree }, C) {
    const on = w.active;
    const fromIndex = this.pressed === null ? -1 : spaces().findIndex((s) => s.id === this.pressed);
    const fg = on ? C.selText : C.text;
    const sub = on ? C.selMuted : C.muted;
    const line = on ? C.selMuted : C.hairStrong;
    const tail = this.tail(w, g, tree);
    return h_flex()
      .relative()
      .id(`space-${w.id}`)
      .h(H.row)
      .flex_none()
      .pl(tree ? 36 : 14)
      .pr(14)
      .gap(10)
      .items_center()
      .on_hover((over, cx) => {
        if (over) this.hover = w.id;
        else if (this.hover === w.id) this.hover = null;
        cx.notify();
      })
      .when(this.pressed === w.id && this.over !== w.id, (el) => el.opacity(0.5))
      .child(wipe(`sp-hover-${w.id}`, C.sunken, this.width, this.hover === w.id && !on))
      .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(C.text)
          .when(fromIndex < i, (l) => l.bottom(0))
          .when(fromIndex > i, (l) => l.top(0)),
      ))
      // A worktree hangs off its checkout with one right-angle hairline, production-chain style.
      .when(Boolean(tree), (el) => el.child(div().absolute().left(22).top(0).w(8).h(19).border_l(1).border_b(1).border_color(line))
        .when(tree === "mid", (el) => el.child(div().absolute().left(22).top(19).bottom(0).w(1).bg(line))))
      .on_mouse_down("left", () => { this.pressed = w.id; this.over = w.id; })
      .on_mouse_move((_e, cx) => {
        const source = spaces().find((s) => s.id === this.pressed);
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? w.id : null;
        if (this.pressed !== null && this.over !== over) { this.over = over; cx.notify(); }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed, over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === w.id && from !== w.id) {
          const index = spaces().findIndex((s) => s.id === w.id);
          if (index !== -1) run("space.move", { id: from, index: index + 1 });
        } else if (from === w.id) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .child(nudge(v_flex(), `sp-label-${w.id}`, this.hover === w.id).flex_1().min_w(0).gap(4)
        .child(path(w.name, fg, sub))
        .when(Boolean(tail), (el) => el.child(micro(tail, sub).truncate())))
      .child(div().relative().flex_none().child(this.signal(C, w.status, on) ?? div()));
  }

  compact({ w, i }, C) {
    const st = statusOf(w.status);
    const on = w.active;
    return h_flex().flex_none().justify_center().py(2).child(h_flex()
      .id(`space-${w.id}`)
      .relative()
      .size(RAIL)
      .rounded(2)
      .justify_center()
      .items_center()
      .overflow_hidden()
      .when(on, (el) => el.bg(C.selBg))
      .when(!on, (el) => el.border_1().border_color(C.hair).hover((s) => s.bg(C.sunken)))
      .tooltip(w.name)
      .on_click(() => run("space.select", { id: w.id }))
      .on_mouse_down("right", () => this.menu(w))
      .child(wide(pad2(i + 1), on ? C.selText : C.muted, 10.5))
      .when(on, (el) => el.child(div().absolute().left(0).top(0).bottom(0).w(2).bg(C.signal)))
      .when(Boolean(st) && !st.quiet, (el) => el.child(div().absolute().left(0).right(0).bottom(0).h(2).bg(C[st.bar]))));
  }

  render() {
    const C = palette();
    const collapsed = narrow();
    const sp = spaces();
    const list = this.grouped(C, collapsed);
    const active = sp.find((p) => p.active)?.id;
    if (active !== this.revealed || this.activeAt !== this.revealedAt) {
      this.revealed = active;
      this.revealedAt = this.activeAt;
      if (this.activeAt >= 0) this.scroll.scroll_to_item(this.activeAt + 1);
    }
    return root(C, this.entrance.apply(v_flex().size_full().min_h(0).bg(C.ground)
      .child(h_flex().flex_none().items_center().when(collapsed, (el) => el.h(36).justify_center())
        .when(!collapsed, (el) => el.h(38).pt(6).pl(16).pr(12).gap(8)
          .child(div().text_size(13).font_semibold().child("// Spaces"))
          .child(div().flex_1())
          .child(micro(pad2(sp.length), C.muted)))
        .child(div().id("space-new").size(22).flex_none().flex().items_center().justify_center().rounded(3)
          .text_color(C.muted).hover((s) => s.bg(C.sunken).text_color(C.text))
          .tooltip("New space").on_click(() => run("space.new")).child(icon("plus", 12))))
      .child(v_flex().flex_1().min_h(0).pb(12).overflow_y_scrollbar().track_scroll(this.scroll)
        .on_size_change((size, cx) => { this.width = size.width; if (this.activeAt >= 0) this.scroll.scroll_to_item(this.activeAt + 1); cx.notify(); })
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        // Child 0 is the selection block (scroll indexes above are +1 for it); hidden when the selected space is folded away.
        .child(slide("sp-slide", C, Math.max(0, this.activeTop), H.row, { edge: true }).when(collapsed || this.activeTop < 0, (el) => el.opacity(0)))
        .children(list))));
  }
}
