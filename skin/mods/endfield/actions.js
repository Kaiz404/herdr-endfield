// actions: the confirm dialog behind every session card action, and the Archived list. Like
// Dispatch, it shows the exact command before anything runs and runs it once, on Confirm only.
//   action    props {role: "action", terminal, action (an ACTIONS key), snap: Session | null, overlay}
//             What each program offers, and the argv, are orders.js (ACTIONS, actionSteps). Typed
//             steps go through hc send --if idle; Next mode's hc keys runs only if Herdr still
//             says idle at the click. Afterwards it reads back the model or effort (the squad
//             list's session data) or the mode (Claude Code's own line, hc read), else says sent.
//             Archive records the chat in data/endfield/archive.json first (archiving), then
//             types the end command, then watches Herdr until the program is gone. Only then is
//             the record marked ended and a shell left behind kept out of Squads (shared
//             "endfield.archived", roster.js); otherwise the dialog says it is still running.
//             archiveChat and markEnded are those two halves; Archive squad (squadactions.js) runs them too.
//   archived  props {role: "archived", overlay}: the archived chats, newest first, each with
//             Resume: the program's resume command in a new tab of its space, or in a new space once
//             that is closed (archive.js resumePlan), on the click only.
//   account   props {role: "account", terminal, snap, overlay}: moves a Claude Code chat to another
//             saved login. Switch opens one tab running tools/account.mjs switch (orders.js
//             switchArgv), which waits for the turn, ends the old terminal and resumes there. Tokens
//             are typed only into that tool's own menu (Manage accounts), never into the skin.

import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, openOverlay, readTextFile, writeTextFile, appHome, exec, hc, run, shared, setShared, spaces, agents, terminals, knownAgents, checking, window as appWindow } from "herdr";
import { palette, root, micro, pill, barcode, growDisc, cue, MOTION, FONT, STRIP, strip, stripCode, stripCancel, homeBase } from "./kit.js";
import { roster } from "./roster.js";
import { append } from "./comms.js";
import { ACTIONS, MODE_WORD, gate, valuesProblem, actionSteps, stepLine, modeOnScreen, deliver, timeoutFor, shQuote, switchArgv, switchPlan } from "./orders.js";
import { archiveRecord, parseArchive, withoutChat, withEnded, updateFile, recordThenEnd, exitState, exitSeen, hideOf, keptHides, withoutHide, resumePlan, resumeState, programBin, PICK_NOTE } from "./archive.js";
import { ago } from "./sessions.js";

const ARCHIVE = () => `${appHome()}/data/endfield/archive.json`;
// Terminals kept out of Squads: enough for every archive a session sees, small enough for shared.json.
const HIDDEN_CAP = 50;
const READ_TRIES = 8;
export const READ_EVERY_MS = 1000;
// Claude Code saves and exits within a few seconds of /exit; past this the dialog says it is still running.
export const EXIT_TRIES = 20;

export const openAction = (p) => openOverlay({ mod: "endfield", kind: "dialog", frame: "none", width: 600, height: 520, props: { role: "action", ...p } });
export const openArchived = () => openOverlay({ mod: "endfield", kind: "dialog", frame: "none", width: 640, height: 540, props: { role: "archived" } });
export const openAccount = (p) => openOverlay({ mod: "endfield", kind: "dialog", frame: "none", width: 600, height: 560, props: { role: "account", ...p } });

export const ACCOUNT_TOOL = () => `${appHome()}/mods/endfield/tools/account.mjs`;

/** The saved login names and the default one (account.mjs list: never a token); no names with none or without node. */
export async function listAccounts() {
  try {
    const r = await exec("node", [ACCOUNT_TOOL(), "list"], { timeout: 15000 });
    const list = r.code === 0 ? JSON.parse(r.stdout) : [];
    return { names: list.map((a) => a.name), def: list.find((a) => a.default)?.name ?? null };
  } catch { return { names: [], def: null }; }
}

/** The account tool's menu in a new tab: a token is typed there, hidden, and never passes through the skin. */
export const manageAccounts = () => run("tab.new", { name: "Accounts", argv: ["node", ACCOUNT_TOOL()] });

async function readArchive() {
  try { return (await readTextFile(ARCHIVE())) ?? null; } catch { return null; }
}

const updateArchive = (change) => updateFile({ read: readArchive, write: (text, expected) => writeTextFile(ARCHIVE(), text, expected), change });

/**
 * Archive's first half for one chat, from the card or Archive squad: the record (what Herdr and its
 * session show now), then its end command with hc send --if idle (recordThenEnd). `via` heads the
 * Comms line. -> {chat, r}: r is deliver()'s; on "refused" nothing was typed and the record is gone.
 */
export async function archiveChat({ terminal, snap, via }) {
  const m = roster().all.get(terminal);
  if (!m) return { chat: null, r: { phase: "refused", error: "Herdr no longer lists it. Nothing was typed." } };
  const sp = spaces().find((s) => s.id === m.space);
  // A program with no session sidecar (Codex, Cursor) still resumes in its terminal's folder.
  const cwd = snap?.cwd ?? terminals().find((t) => t.address === terminal)?.cwd ?? null;
  const chat = archiveRecord({
    sessionId: snap?.sessionId ?? null, approx: Boolean(snap?.approx), program: m.program.key, cwd, title: m.title ?? null,
    space: m.space ?? null, squad: sp?.name ?? m.spaceName ?? null, machine: sp?.machine ?? null, terminal, created: m.created ?? 0, now: Date.now(),
  });
  const [step] = actionSteps(ACTIONS[chat.program].archive, { target: terminal });
  const r = await recordThenEnd({
    chat,
    update: updateArchive,
    send: () => deliver({
      args: step.hc,
      exec: (a) => exec("hc", a, { timeout: timeoutFor({ mode: "send", delivery: "idle" }) }),
      log: () => append({ at: Date.now(), from: "you", to: terminal, kind: "action", via: `${via} ${stepLine(step, appWindow()?.platform)}`, text: step.hc.at(-1) }),
    }),
  });
  return { chat, r };
}

/** Archive's second half, once Herdr no longer lists the program: its leftover shell leaves Squads and the record is marked ended. */
export async function markEnded(chat) {
  setShared("endfield.archived", keptHides([...(shared("endfield.archived") ?? []), hideOf(chat)], terminals()).slice(-HIDDEN_CAP));
  return updateArchive((text) => withEnded(text, chat.archivedAt, Date.now()));
}

// The dialogs' shared frame: corner brackets, a title block, a body, the graphite command strip.
export function frame(C, id, { kicker, title, close, body, strip }) {
  return v_flex().id(id).relative().w_full().bg(C.raised).border_1().border_color(C.hairStrong).rounded(4)
    .child(div().absolute().left(-7).top(-7).size(10).border_l(1.5).border_t(1.5).border_color(C.text))
    .child(div().absolute().right(-7).bottom(-7).size(10).border_r(1.5).border_b(1.5).border_color(C.text))
    .child(h_flex().pl(22).pr(20).pt(18).pb(14).gap(12).items_end()
      .child(v_flex().gap(8).min_w(0)
        .child(h_flex().gap(8).items_center().child(micro(kicker, C.muted).truncate()).child(barcode(C.cross)))
        .child(div().text_size(20).font_semibold().child(title)))
      .child(div().flex_1())
      .child(close))
    .child(body)
    .when(Boolean(strip), (el) => el.child(strip));
}

export function closeButton(C, view, overlay) {
  return div().id("ac-close").relative().size(30).rounded_full().border_1().border_color(C.hairStrong).flex().items_center().justify_center().cursor_pointer()
    .on_hover(view.hover("ac-close")).on_click(() => closeOverlay(overlay))
    .child(growDisc("ac-close-disc", 30, 30, 28, view.hot === "ac-close", C.red))
    .child(div().relative().text_size(11).text_color(view.hot === "ac-close" ? C.ink : C.text).child("×"));
}

export class ActionDialog {
  init(p, cx) {
    this.p = p;
    const m = roster().all.get(p.terminal);
    this.program = m?.program?.key ?? null;
    this.action = ACTIONS[this.program]?.[p.action] ?? null;
    this.values = {};
    this.inputs = {};
    for (const f of this.action?.fields ?? []) {
      if (f.kind !== "text") continue;
      const s = InputState.new({ placeholder: f.placeholder ?? "" });
      if (f.key === "name" && m?.agent?.tab_name && !/^\d+$/.test(m.agent.tab_name)) s.set_value(m.agent.tab_name);
      s.on("change", (_e, cx) => cx.notify());
      this.inputs[f.key] = s;
    }
    this.alsoSession = false;
    // edit -> busy -> sent | refused (may Confirm again) | uncertain; deliver() in orders.js.
    this.state = { phase: "edit", error: null };
    this.read = null;
    // Archive only: watching | ended | running (not seen to end in time).
    this.exit = null;
    this.before = this.readNow();
    this.entered = false;
    if (checking()) return;
    const first = Object.values(this.inputs)[0];
    if (first) { first.focus(); cx.timer.after(600, () => first.focus()); }
  }

  hover(id) { return (over, cx) => { if (over) this.hot = id; else if (this.hot === id) this.hot = null; cx.notify(); }; }

  value(key) { return this.inputs[key] ? this.inputs[key].value() : this.values[key]; }

  all() { return Object.fromEntries((this.action?.fields ?? []).map((f) => [f.key, this.value(f.key)])); }

  steps() {
    const m = roster().all.get(this.p.terminal);
    return actionSteps(this.action, { target: this.p.terminal, tab: m?.tab ?? null, values: this.all(), alsoSession: this.alsoSession });
  }

  // What session data says now, for model and effort; the mode comes off the screen (readMode).
  readNow() {
    const k = this.action?.read;
    return k === "model" || k === "effort" ? shared("endfield.sessions")?.[this.p.terminal]?.[k] ?? null : null;
  }

  async readMode() {
    try { return modeOnScreen((await hc(["read", this.p.terminal, "--lines", "4"])).stdout); } catch { return null; }
  }

  // Polls once a second until the value moves off what it was before, or READ_TRIES pass.
  readBack(cx, tries = 0) {
    cx.timer.after(READ_EVERY_MS, (cx) => cx.spawn(async (cx) => {
      const k = this.action.read;
      const now = k === "mode" ? await this.readMode() : this.readNow();
      const moved = now != null && (k === "mode" || now !== this.before);
      if (moved || tries + 1 >= READ_TRIES) { this.read = { value: now, moved }; cx.notify(); return; }
      this.readBack(cx, tries + 1);
    }));
  }

  async confirm(cx, ready) {
    if (!ready || (this.state.phase !== "edit" && this.state.phase !== "refused")) return;
    const target = this.p.terminal;
    const platform = appWindow()?.platform;
    this.state = { phase: "busy", error: null };
    cx.notify();
    if (this.action.archive) { await this.archive(cx); cx.notify(); return; }
    for (const step of this.steps()) {
      if (step.herdr) { run(step.herdr, step.args); continue; }
      // hc keys has no --if: Herdr's status at the click is the gate.
      if (step.hc[0] === "keys") {
        const why = gate(roster().all.get(target)?.herdrStatus);
        if (why) { this.state = { phase: "refused", error: why }; cx.notify(); return; }
      }
      const r = await deliver({
        args: step.hc,
        exec: (a) => exec("hc", a, { timeout: timeoutFor({ mode: "send", delivery: "idle" }) }),
        log: () => append({ at: Date.now(), from: "you", to: target, kind: "action", via: `Session card ${stepLine(step, platform)}`, text: step.hc.at(-1) }),
      });
      if (r.phase !== "sent") { this.state = r; cx.notify(); return; }
    }
    cue("tick");
    this.state = { phase: "sent", error: null };
    if (this.action.read) this.readBack(cx);
    cx.notify();
  }

  async archive(cx) {
    const { chat, r } = await archiveChat({ terminal: this.p.terminal, snap: this.p.snap, via: "Session card" });
    if (r.phase === "refused") { this.state = r; return; }
    // Sent, or uncertain (it may have been typed): either way the lists say whether it took.
    this.state = r.phase === "sent" ? { phase: "sent", error: null } : r;
    this.exit = "watching";
    this.watchExit(cx, chat);
  }

  // hc exiting 0 means /exit was typed, not that the program ended: Herdr's lists are the evidence.
  watchExit(cx, chat, tries = 0, prev = null) {
    cx.timer.after(READ_EVERY_MS, (cx) => cx.spawn(async (cx) => {
      const read = exitState(chat, agents(), terminals());
      if (exitSeen(prev, read)) {
        const marked = await markEnded(chat);
        this.exit = "ended";
        if (!marked.ok) this.state = { phase: "sent", error: `It ended, but the archive could not mark it (${marked.error}). Report > Archived still resumes it.` };
        cue("tick");
        cx.notify();
        return;
      }
      if (tries + 1 >= EXIT_TRIES) { this.exit = "running"; cx.notify(); return; }
      this.watchExit(cx, chat, tries + 1, read);
    }));
  }

  render(cx) {
    const C = palette();
    const p = props() ?? this.p;
    const a = this.action;
    const m = roster().all.get(p.terminal);
    const platform = appWindow()?.platform;
    if (!a) return root(C, div().p(20).child(`No ${p.action} action for ${m?.program?.name ?? "this program"}.`));
    const status = m?.herdrStatus ?? null;
    const steps = this.steps();
    const typedSteps = steps.some((s) => s.hc);
    const why = typedSteps ? gate(status) : null;
    const problem = valuesProblem(a, this.all());
    const done = this.state.phase === "sent" || this.state.phase === "uncertain";
    const ready = !why && !problem && (this.state.phase === "edit" || this.state.phase === "refused");
    const field = (f) => v_flex().gap(6)
      .child(micro(f.label, C.muted))
      .child(f.kind === "text"
        ? h_flex().h(34).px(10).items_center().rounded(3).border_1().border_color(C.hairStrong).bg(C.ground).font_family(FONT.mono).text_size(12).child(Input.new(this.inputs[f.key]))
        : h_flex().gap(6).flex_wrap().children(f.list.map((v) => {
          const on = this.values[f.key] === v;
          return h_flex().id(`ac-${f.key}-${v}`).h(26).px(10).items_center().rounded_full().border_1().cursor_pointer()
            .border_color(on ? C.selBg : C.hairStrong).when(on, (el) => el.bg(C.selBg))
            .on_click((_e, cx) => { this.values[f.key] = v; cx.notify(); })
            .child(div().font_family(FONT.mono).text_size(12).text_color(on ? C.selText : C.text).child(v));
        })));
    const check = a.session ? h_flex().id("ac-also").gap(8).items_center().cursor_pointer()
      .on_click((_e, cx) => { this.alsoSession = !this.alsoSession; cx.notify(); })
      .child(div().size(14).rounded(2).border(1.5).border_color(C.text).flex().items_center().justify_center().when(this.alsoSession, (el) => el.bg(C.selBg).child(div().text_size(10).text_color(C.selText).child("✓"))))
      .child(div().text_size(12).child("Also name the session with /rename (it must be idle)")) : null;
    const pre = why ? ["red", why] : problem ? ["hairStrong", problem]
      : a.needs ? ["signal", a.needs]
      : typedSteps ? ["lime", "Idle. hc types it only while it stays idle, after any draft you left in it."] : ["hairStrong", "Herdr only: nothing is typed into the agent."];
    const read = this.read;
    const name = m?.program?.name ?? "It";
    const outcome = this.exit === "ended" && !this.state.error ? ["Archived", C.text, `${name} ended. Report > Archived resumes it.`]
      : this.state.error ? [{ refused: "hc said", sent: "Sent" }[this.state.phase] ?? "Check first", C.error, this.state.error]
      : this.state.phase !== "sent" ? null
      : this.exit === "watching" ? ["Ending", C.text, `${a.text()} typed. Waiting for Herdr to stop listing it.`]
      : this.exit === "running" ? ["Still running", C.error, `${a.text()} was typed, but ${name} hasn't ended after ${EXIT_TRIES}s, so it stays in Squads. Look at its terminal.`]
      : !a.read ? ["Sent", C.text, "Sent. This program's state can't be read back here."]
      : !read ? ["Sent", C.text, "Sent. Reading it back."]
      : read.moved ? ["Now", C.text, a.read === "mode" ? `Mode: ${MODE_WORD[read.value] ?? read.value}` : `${a.read === "model" ? "Model" : "Effort"}: ${read.value}`]
      : ["Sent", C.text, "Sent. Session data hasn't changed yet; the card shows it once it does."];
    return root(C, div().id("ac-root").size_full().flex().items_center().justify_center()
      .on_size_change((_s, cx) => { if (!this.entered) cx.timer.after(MOTION.settle.delay, (cx) => { this.entered = true; cx.notify(); }); })
      .child(div().w(560).opacity(this.entered ? 1 : 0).top(this.entered ? 0 : 8).relative().transition("opacity", MOTION.dispatch.enter).transition("top", MOTION.dispatch.enter)
        .child(frame(C, "action", {
          kicker: `${m?.ident?.callsign ?? ""}  ${m?.label ?? ""}  ${m?.title ?? ""}`,
          title: `// ${a.label}`,
          close: closeButton(C, this, p.overlay),
          body: v_flex().px(22).pb(16).gap(14)
            .children((a.fields ?? []).map(field))
            .when(Boolean(check), (el) => el.child(check))
            .child(h_flex().gap(10).items_center().px(10).py(8).bg(C.ground).border_l(2).border_color(C[pre[0]]).rounded_r(3)
              .child(micro("Needs", C.muted).flex_none()).child(div().flex_1().min_w(0).text_size(12).text_color(C.muted).child(pre[1])))
            .child(h_flex().gap(10).items_center().px(10).py(8).bg(C.ground).border_l(2).border_color(C.hairStrong).rounded_r(3)
              .child(micro("Does", C.muted).flex_none()).child(div().flex_1().min_w(0).text_size(12).text_color(C.muted).child(a.note)))
            .when(Boolean(outcome), (el) => el.child(h_flex().px(10).py(7).gap(8).items_center().border_l(2).border_color(outcome[1] === C.error ? C.red : C.lime).bg(C.ground)
              .child(micro(outcome[0], outcome[1]).flex_none()).child(div().flex_1().min_w(0).font_family(FONT.mono).text_size(11).child(outcome[2])))),
          // The exact commands, one per line, wrapped rather than cut: Confirm runs these and nothing else.
          strip: strip()
            .child(stripCode(v_flex().id("ac-cmd").flex_1().min_w(0).max_h(72).overflow_y_scrollbar().gap(4))
              .children(steps.map((s) => div().child(stepLine(s, platform)))))
            .when(!done, (el) => el.child(stripCancel("ac-cancel", () => closeOverlay(p.overlay))))
            .when(done, (el) => el.child(pill(C, "ac-done", "Close", { kind: "dark", knob: "×", h: 30, hot: this.hot === "ac-done", on_hover: this.hover("ac-done"), action: () => closeOverlay(p.overlay) })))
            .when(!done, (el) => el.child(div().when(!ready, (el) => el.opacity(0.45)).child(pill(C, "ac-go", this.state.phase === "busy" ? "Running" : a.archive ? "Archive" : "Confirm",
              { kind: "primary", h: 30, hot: this.hot === "ac-go", on_hover: this.hover("ac-go"), action: (_e, cx) => cx.spawn(async (cx) => this.confirm(cx, ready)) })))),
        }))));
  }
}

export class Archived {
  init(_p, cx) {
    this.chats = [];
    this.error = null;
    this.entered = false;
    // programs.json's run argv per program, asked once: every row draws the command its Resume runs.
    this.runs = null;
    this.busy = false;
    if (checking()) return;
    cx.spawn(async (cx) => {
      await this.load();
      try { this.runs = Object.fromEntries((await knownAgents()).map((g) => [g.key, g.run])); } catch { this.runs = {}; }
      cx.notify();
    });
  }

  async load() {
    this.chats = parseArchive(await readArchive());
  }

  hover(id) { return (over, cx) => { if (over) this.hot = id; else if (this.hot === id) this.hot = null; cx.notify(); }; }

  // What a row's Resume runs, where, and whether it may: one call for the drawing and the click.
  plan(c) {
    const running = c.ended == null && exitState(c, agents(), terminals()) === "running";
    return { open: resumePlan(c, this.runs?.[c.program], spaces(), homeBase()?.folder ?? null), ...resumeState(c, running) };
  }

  // A new tab in the chat's space, or a new space once that is closed, in its folder, running the drawn command.
  async resume(cx, chat) {
    const plan = this.plan(chat);
    if (this.busy || !this.runs || !plan.can) return;
    this.busy = true;
    cx.notify();
    run(plan.open.herdr, plan.open.args);
    setShared("endfield.archived", withoutHide(shared("endfield.archived") ?? [], chat));
    const r = await updateArchive((text) => withoutChat(text, chat.archivedAt));
    this.error = r.ok ? null : `Resumed, but the archive could not be updated: ${r.error}`;
    cue("tick");
    await this.load();
    this.busy = false;
    cx.notify();
  }

  render(cx) {
    const C = palette();
    const p = props() ?? {};
    const row = (c, i) => {
      const plan = this.plan(c);
      const go = plan.can && Boolean(this.runs) && !this.busy;
      return v_flex().id(`ar-${c.archivedAt}`).gap(6).px(14).py(10).border_b(1).border_color(C.hair)
        .child(h_flex().gap(10).items_center().min_w(0)
          .child(micro(String(i + 1).padStart(2, "0"), C.muted).flex_none())
          .child(div().flex_1().min_w(0).truncate().text_size(13).font_semibold().child(c.title ?? c.terminal))
          .child(micro(ago(c.archivedAt), C.muted).flex_none())
          .child(div().when(!go, (el) => el.opacity(0.45)).child(pill(C, `ar-go-${c.archivedAt}`, "Resume", { kind: "dark", knob: "▶", hot: this.hot === c.archivedAt, on_hover: this.hover(c.archivedAt),
            action: (_e, cx) => cx.spawn(async (cx) => this.resume(cx, c)) }))))
        // Where it opens, then the folder and the exact argv Resume hands tab.new or space.new, wrapped rather than cut.
        .child(micro(plan.open.where, C.muted, 9))
        .child(div().font_family(FONT.mono).text_size(10.5).text_color(C.muted)
          .child(`${plan.open.args.folder ?? ""}  ${this.runs ? plan.open.args.argv.map(shQuote).join(" ") : "Asking which command starts it"}`))
        .when(Boolean(plan.note), (el) => el.child(micro(plan.note, plan.can ? C.muted : C.error, 9)));
    };
    return root(C, div().id("ar-root").size_full().flex().items_center().justify_center()
      .on_size_change((_s, cx) => { if (!this.entered) cx.timer.after(MOTION.settle.delay, (cx) => { this.entered = true; cx.notify(); }); })
      .child(div().w(600).opacity(this.entered ? 1 : 0).relative().transition("opacity", MOTION.dispatch.enter)
        .child(frame(C, "archived", {
          kicker: `${String(this.chats.length).padStart(2, "0")} chats  newest first`,
          title: "// Archived",
          close: closeButton(C, this, p.overlay),
          body: v_flex().px(8).pb(12).gap(8)
            .when(Boolean(this.error), (el) => el.child(micro(this.error, C.error).px(14)))
            .child(v_flex().id("ar-list").h(380).overflow_y_scrollbar()
              .when(this.chats.length === 0, (el) => el.child(v_flex().h(160).items_center().justify_center().gap(6)
                .child(div().text_size(13).font_medium().child("Nothing archived"))
                .child(div().text_size(12).text_color(C.muted).child("Archive on a session card ends a chat and keeps it here."))))
              .children(this.chats.map(row))),
          strip: strip().py(10)
            .child(micro("Resume opens a new tab and runs the command shown, only when you click it", STRIP.dim)),
        }))));
  }
}

export class AccountDialog {
  init(p, cx) {
    this.p = p;
    this.accounts = null;
    this.choice = null;
    this.now = false;
    // programs.json's run argv for this program; null until asked, then the program's own command if unknown.
    this.run = null;
    this.entered = false;
    if (checking()) return;
    cx.spawn(async (cx) => {
      this.accounts = (await listAccounts()).names;
      const key = roster().all.get(p.terminal)?.program?.key;
      try { this.run = (await knownAgents()).find((g) => g.key === key)?.run ?? null; } catch {}
      this.run ??= [programBin(key)];
      cx.notify();
    });
  }

  hover(id) { return (over, cx) => { if (over) this.hot = id; else if (this.hot === id) this.hot = null; cx.notify(); }; }

  // The tab Switch opens, in the agent's space and folder, under its tab's name: one call for the drawing and the click.
  tab(m) {
    const s = this.p.snap;
    const name = m?.agent?.tab_name && !/^\d+$/.test(m.agent.tab_name) ? m.agent.tab_name : undefined;
    const argv = switchArgv({ tool: ACCOUNT_TOOL(), terminal: this.p.terminal, account: this.choice, sessionId: s?.sessionId ?? null, now: this.now && m?.herdrStatus === "working", argv: this.run ?? [] });
    return { name, space: m?.space ?? undefined, folder: s?.cwd ?? undefined, argv };
  }

  render(cx) {
    const C = palette();
    const p = props() ?? this.p;
    const m = roster().all.get(p.terminal);
    const s = p.snap;
    const status = m?.herdrStatus ?? null;
    const plan = switchPlan(status, this.now);
    const current = shared("endfield.sessions")?.[p.terminal]?.account;
    const currentWord = current == null ? "unknown (no statusline sidecar yet)" : current || "default login";
    const notes = [
      (shared("endfield.waiting") ?? []).includes(p.terminal) ? "Background tasks still run. They end with the old process." : null,
      !s?.sessionId ? "No session id is known: it resumes the newest chat in this folder (--continue)." : s.approx ? PICK_NOTE.guess : null,
    ].filter(Boolean);
    const ready = plan.can && Boolean(this.choice) && Boolean(this.run);
    const tab = this.tab(m);
    const chipRow = (id, list, on, pick) => h_flex().gap(6).flex_wrap().children(list.map(([k, label, off]) => {
      const sel = on === k;
      return h_flex().id(`${id}-${k}`).h(26).px(10).items_center().rounded_full().border_1()
        .border_color(sel ? C.selBg : C.hairStrong).when(sel, (el) => el.bg(C.selBg)).when(off, (el) => el.opacity(0.4))
        .when(!off, (el) => el.cursor_pointer().on_click((_e, cx) => { pick(k); cx.notify(); }))
        .child(div().font_family(FONT.mono).text_size(12).text_color(sel ? C.selText : C.text).child(label));
    }));
    const line = (label, tone, text) => h_flex().gap(10).items_center().px(10).py(8).bg(C.ground).border_l(2).border_color(C[tone]).rounded_r(3)
      .child(micro(label, C.muted).flex_none()).child(div().flex_1().min_w(0).text_size(12).text_color(C.muted).child(text));
    const accounts = this.accounts ?? [];
    return root(C, div().id("acc-root").size_full().flex().items_center().justify_center()
      .on_size_change((_s, cx) => { if (!this.entered) cx.timer.after(MOTION.settle.delay, (cx) => { this.entered = true; cx.notify(); }); })
      .child(div().w(560).opacity(this.entered ? 1 : 0).top(this.entered ? 0 : 8).relative().transition("opacity", MOTION.dispatch.enter).transition("top", MOTION.dispatch.enter)
        .child(frame(C, "account", {
          kicker: `${m?.ident?.callsign ?? ""}  ${m?.label ?? ""}  ${m?.title ?? ""}`,
          title: "// Account",
          close: closeButton(C, this, p.overlay),
          body: v_flex().px(22).pb(16).gap(14)
            .child(v_flex().gap(6).child(micro(`Move to  (now on ${currentWord})`, C.muted))
              .child(this.accounts == null ? micro("Reading saved accounts", C.muted)
                : accounts.length ? chipRow("acc-to", accounts.map((a) => [a, a, a === current]), this.choice, (k) => { this.choice = k; })
                : div().text_size(12).text_color(C.muted).child("No saved accounts. Manage accounts adds one from a token (claude setup-token).")))
            .when(status === "working", (el) => el.child(v_flex().gap(6).child(micro("When", C.muted))
              .child(chipRow("acc-when", [["after", "After this turn", false], ["now", "Stop now", false]], this.now ? "now" : "after", (k) => { this.now = k === "now"; }))))
            .child(line("Needs", plan.tone, plan.says))
            .children(notes.map((n) => line("Note", "signal", n)))
            .child(line("Does", "hairStrong", "Opens a tab that waits for the turn, ends this agent and its tab, and resumes the same chat there on the new account. Close that tab before then to cancel.")),
          strip: strip()
            .child(stripCode(v_flex().id("acc-cmd").flex_1().min_w(0).max_h(72).overflow_y_scrollbar())
              .child(div().child(this.choice ? stepLine({ herdr: "tab.new", args: tab }, appWindow()?.platform) : "Pick an account")))
            .child(pill(C, "acc-manage", "Manage accounts", { kind: "dark", h: 30, hot: this.hot === "acc-manage", on_hover: this.hover("acc-manage"),
              action: () => { manageAccounts(); closeOverlay(p.overlay); } }))
            .child(stripCancel("acc-cancel", () => closeOverlay(p.overlay)))
            .child(div().when(!ready, (el) => el.opacity(0.45)).child(pill(C, "acc-go", "Switch", { kind: "primary", h: 30, hot: this.hot === "acc-go", on_hover: this.hover("acc-go"),
              action: () => { if (!ready) return; run("tab.new", tab); cue("tick"); closeOverlay(p.overlay); } }))),
        }))));
  }
}
