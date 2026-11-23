// actions: the confirm dialog behind every session card action, and the Archived list. Like
// Dispatch, it shows the exact command before anything runs and runs it once, on Confirm only.
//   action    props {role: "action", terminal, action (an ACTIONS key), snap: Session | null, overlay}
//             What each program offers, and the argv, are orders.js (ACTIONS, actionSteps). Typed
//             steps go through hc send --if idle; Next mode's hc keys runs only if Herdr still
//             says idle at the click. Afterwards it reads back the model or effort (the squad
//             list's session data) or the mode (Claude Code's own line, hc read), else says sent.
//             Archive ends the program, then records the chat in data/endfield/archive.json and
//             keeps its terminal out of Squads (shared "endfield.archived", roster.js).
//   archived  props {role: "archived", overlay}: the archived chats, newest first, each with
//             Resume: a new tab running the program's resume command (archive.js), on the click only.

import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, openOverlay, readTextFile, writeTextFile, appHome, exec, hc, run, shared, setShared, spaces, knownAgents, checking, window as appWindow } from "herdr";
import { palette, root, micro, pill, barcode, growDisc, cue, MOTION, FONT } from "./kit.js";
import { roster } from "./roster.js";
import { append } from "./comms.js";
import { ACTIONS, gate, valuesProblem, actionSteps, stepLine, modeOnScreen, deliver, timeoutFor } from "./orders.js";
import { archiveRecord, parseArchive, withChat, withoutChat, resumeArgv, lifeKey } from "./archive.js";
import { ago } from "./sessions.js";

const ARCHIVE = () => `${appHome()}/data/endfield/archive.json`;
// Terminals kept out of Squads: enough for every archive a session sees, small enough for shared.json.
const HIDDEN_CAP = 50;
const READ_TRIES = 8;
const READ_EVERY_MS = 1000;
const MODE_WORD = { default: "manual", acceptEdits: "accept edits", plan: "plan", auto: "auto", dontAsk: "don't ask", bypassPermissions: "bypass permissions" };

export const openAction = (p) => openOverlay({ mod: "endfield", kind: "dialog", frame: "none", width: 600, height: 520, props: { role: "action", ...p } });
export const openArchived = () => openOverlay({ mod: "endfield", kind: "dialog", frame: "none", width: 640, height: 540, props: { role: "archived" } });

async function readArchive() {
  try { return (await readTextFile(ARCHIVE())) ?? null; } catch { return null; }
}

// The dialogs' shared frame: corner brackets, a title block, a body, the graphite command strip.
function frame(C, id, { kicker, title, close, body, strip }) {
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

function closeButton(C, view, overlay) {
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
    for (const step of this.steps()) {
      if (step.herdr) { run(step.herdr, step.args); continue; }
      // hc keys has no --if: Herdr's status at the click is the gate.
      if (step.hc[0] === "keys") {
        const why = gate(roster().all.get(target)?.status);
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
    if (this.action.archive) await this.archive();
    else if (this.action.read) this.readBack(cx);
    cx.notify();
  }

  // The program was told to end: the chat goes in the archive, and its terminal out of Squads.
  async archive() {
    const m = roster().all.get(this.p.terminal);
    const s = this.p.snap;
    const chat = archiveRecord({
      sessionId: s?.sessionId ?? null, program: this.program, cwd: s?.cwd ?? null, title: m?.title ?? null,
      space: m?.space ?? null, terminal: this.p.terminal, created: m?.created ?? 0, now: Date.now(),
    });
    const hidden = shared("endfield.archived") ?? [];
    setShared("endfield.archived", [...hidden, lifeKey(this.p.terminal, m?.created)].slice(-HIDDEN_CAP));
    const text = await readArchive();
    try { await writeTextFile(ARCHIVE(), withChat(text, chat), text); } catch (e) {
      this.state = { phase: "sent", error: `Ended, but the archive could not be written: ${String(e?.message ?? e)}` };
    }
  }

  render(cx) {
    const C = palette();
    const p = props() ?? this.p;
    const a = this.action;
    const m = roster().all.get(p.terminal);
    const platform = appWindow()?.platform;
    if (!a) return root(C, div().p(20).child(`No ${p.action} action for ${m?.program?.name ?? "this program"}.`));
    const status = m?.status ?? null;
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
      : typedSteps ? ["lime", "Idle. hc types it only while it stays idle, after any draft you left in it."] : ["hairStrong", "Herdr only: nothing is typed into the agent."];
    const read = this.read;
    const outcome = this.state.error ? [{ refused: "hc said", sent: "Sent" }[this.state.phase] ?? "Check first", C.error, this.state.error]
      : this.state.phase !== "sent" ? null
      : a.archive ? ["Archived", C.text, "It is ending. Report > Archived resumes it."]
      : !a.read ? ["Sent", C.text, "Sent. This program's state can't be read back here."]
      : !read ? ["Sent", C.text, "Sent. Reading it back."]
      : read.moved ? ["Now", C.text, a.read === "mode" ? `Mode: ${MODE_WORD[read.value] ?? read.value}` : `${a.read === "model" ? "Model" : "Effort"}: ${read.value}`]
      : ["Sent", C.text, "Sent. Session data hasn't changed yet; the card shows it once it does."];
    return root(C, div().id("ac-root").size_full().flex().items_center().justify_center()
      .on_size_change((_s, cx) => { if (!this.entered) cx.timer.after(MOTION.settle.delay, (cx) => { this.entered = true; cx.notify(); }); })
      .child(div().w(560).opacity(this.entered ? 1 : 0).top(this.entered ? 0 : 8).relative().transition("opacity", MOTION.dispatch.enter).transition("top", MOTION.dispatch.enter)
        .child(frame(C, "action", {
          kicker: `${m?.ident?.callsign ?? ""}  ${m?.program?.name ?? ""}  ${m?.title ?? ""}`,
          title: `// ${a.label}`,
          close: closeButton(C, this, p.overlay),
          body: v_flex().px(22).pb(16).gap(14)
            .children((a.fields ?? []).map(field))
            .when(Boolean(check), (el) => el.child(check))
            .child(h_flex().gap(10).items_center().px(10).py(8).bg(C.ground).border_l(2).border_color(C[pre[0]]).rounded_r(3)
              .child(micro("Needs", C.muted).flex_none()).child(div().text_size(12).text_color(C.muted).child(pre[1])))
            .child(h_flex().gap(10).items_center().px(10).py(8).bg(C.ground).border_l(2).border_color(C.hairStrong).rounded_r(3)
              .child(micro("Does", C.muted).flex_none()).child(div().text_size(12).text_color(C.muted).child(a.note)))
            .when(Boolean(outcome), (el) => el.child(h_flex().px(10).py(7).gap(8).items_center().border_l(2).border_color(this.state.error ? C.red : C.lime).bg(C.ground)
              .child(micro(outcome[0], outcome[1]).flex_none()).child(div().flex_1().min_w(0).font_family(FONT.mono).text_size(11).child(outcome[2])))),
          // The exact commands, one per line, wrapped rather than cut: Confirm runs these and nothing else.
          strip: h_flex().pl(22).pr(14).py(12).gap(12).items_center().bg("#374045").text_color("#F2F2F2").rounded_b(3)
            .child(v_flex().id("ac-cmd").flex_1().min_w(0).max_h(72).overflow_y_scrollbar().gap(4).font_family("JetBrains Mono").text_size(10.5).line_height(1.4).text_color("#B9C2C7")
              .children(steps.map((s) => div().child(stepLine(s, platform)))))
            .when(!done, (el) => el.child(h_flex().id("ac-cancel").h(30).px(14).items_center().rounded_full().border_1().border_color("#6B777D").cursor_pointer()
              .on_click(() => closeOverlay(p.overlay)).child(div().text_size(12).font_medium().text_color("#F2F2F2").child("Cancel"))))
            .when(done, (el) => el.child(pill(C, "ac-done", "Close", { kind: "dark", knob: "×", h: 30, hot: this.hot === "ac-done", on_hover: this.hover("ac-done"), action: () => closeOverlay(p.overlay) })))
            .when(!done, (el) => el.child(div().when(!ready, (el) => el.opacity(0.45)).child(pill(C, "ac-go", this.state.phase === "busy" ? "Running" : a.archive ? "Archive" : "Confirm",
              { kind: "primary", h: 30, hot: this.hot === "ac-go", on_hover: this.hover("ac-go"), action: (_e, cx) => cx.spawn(async (cx) => this.confirm(cx, ready)) })))),
        }))));
  }
}

export class Archived {
  init(_p, cx) {
    this.chats = [];
    this.text = null;
    this.error = null;
    this.entered = false;
    if (checking()) return;
    cx.spawn(async (cx) => { await this.load(); cx.notify(); });
  }

  async load() {
    this.text = await readArchive();
    this.chats = parseArchive(this.text);
  }

  hover(id) { return (over, cx) => { if (over) this.hot = id; else if (this.hot === id) this.hot = null; cx.notify(); }; }

  // A new tab in the chat's space (or the shown one), in its folder, running the resume command.
  async resume(cx, chat) {
    let runArgv = null;
    try { runArgv = (await knownAgents()).find((g) => g.key === chat.program)?.run ?? null; } catch {}
    const space = spaces().some((s) => s.id === chat.space) ? chat.space : undefined;
    run("tab.new", { name: chat.title ?? undefined, space, folder: chat.cwd ?? undefined, argv: resumeArgv(chat, runArgv) });
    try { await writeTextFile(ARCHIVE(), withoutChat(this.text, chat.archivedAt), this.text); this.error = null; } catch (e) {
      this.error = `Resumed, but the archive could not be updated: ${String(e?.message ?? e)}`;
    }
    cue("tick");
    await this.load();
    cx.notify();
  }

  render(cx) {
    const C = palette();
    const p = props() ?? {};
    const row = (c, i) => v_flex().id(`ar-${c.archivedAt}`).gap(6).px(14).py(10).border_b(1).border_color(C.hair)
      .child(h_flex().gap(10).items_center().min_w(0)
        .child(micro(String(i + 1).padStart(2, "0"), C.muted).flex_none())
        .child(div().flex_1().min_w(0).truncate().text_size(13).font_semibold().child(c.title ?? c.terminal))
        .child(micro(ago(c.archivedAt), C.muted).flex_none())
        .child(pill(C, `ar-go-${c.archivedAt}`, "Resume", { kind: "dark", knob: "▶", hot: this.hot === c.archivedAt, on_hover: this.hover(c.archivedAt),
          action: (_e, cx) => cx.spawn(async (cx) => this.resume(cx, c)) })))
      .child(div().truncate().font_family(FONT.mono).text_size(10.5).text_color(C.muted).child(`${c.cwd ?? ""}  ${resumeArgv(c, null).join(" ")}`))
      .when(Boolean(c.approx), (el) => el.child(micro("Resumes the newest chat, not necessarily this one", C.muted, 9)));
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
          strip: h_flex().pl(22).pr(14).py(10).bg("#374045").rounded_b(3)
            .child(micro("Resume opens a new tab and runs the command shown, only when you click it", "#B9C2C7")),
        }))));
  }
}
