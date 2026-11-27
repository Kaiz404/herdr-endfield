// dispatch: one dialog, two modes, and nothing it does is the skin's own rule: it keeps the exact hc
// command one click away (Show command) and, on Dispatch, runs it. props: {role: "dispatch", mode: "send" | "new", target?, space?,
// parent?, overlay}. The argv, and what became of a run, are orders.js:
//   send  hc send <t> [--if idle] [--wait] -- "<task>"  to a running agent (or any terminal it was opened on)
//   new   hc run --bg --keep --json (--parent <t> [--outlive-parent] | --no-parent) --cwd <space folder>
//         --label herdr.space=<id> --label herdr.tab=<new id> -- <program> "<task>"
//         A tab id Herdr doesn't know becomes a new tab in that space; the agent shows up there.
//         With saved logins, Claude Code runs as node <tools/account.mjs> run [<name>] -- <program> (orders.js
//         accountArgv); "default" leaves the name out, so the tool's default account (or the normal login) runs it.
// Every dispatch is logged to the Comms log (comms.js). The skin never starts anything on its own:
// only this dialog, on the person's click or Ctrl+Enter, and once: after hc took it, the action is Close.

import { div } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { props, closeOverlay, openOverlay, spaces, terminals, knownAgents, exec, hc, appHome, checking, settings, window as appWindow } from "herdr";
import { windowHeight } from "./hovercard.js";
import { palette, root, micro, spaced, wide, chip, glyph, pill, barcode, dots, cue, growDisc, IDENTITY, MOTION, FONT, STRIP, strip, commandToggle, stripCancel } from "./kit.js";
import { roster } from "./roster.js";
import { cast } from "./fleet.js";
import { append } from "./comms.js";
import { sendArgs, runArgs, taskProblem, commandLine, deliver, timeoutFor, deliverPlan, accountArgv } from "./orders.js";
import { ACCOUNT_TOOL, listAccounts } from "./actions.js";
import { isClaude } from "./sessions.js";

// The dialog never outgrows the window: capped 24px short of it (in mod px), and its content scrolls.
const DISPATCH_H = 760;
const dispatchHeight = () => {
  let h = null;
  try { h = windowHeight(window.viewport_size().height, settings().zoom ?? 1); } catch {}
  return h ? Math.min(DISPATCH_H, Math.max(320, h - 24)) : DISPATCH_H;
};
export const openDispatch = (p) => openOverlay({ mod: "endfield", kind: "dialog", frame: "none", width: 700, height: dispatchHeight(), props: { role: "dispatch", ...p } });

const OPTS = {
  send: { title: "Delivery", list: [{ k: "idle", label: "Only if idle" }, { k: "now", label: "Now" }, { k: "wait", label: "Now, wait for reply" }] },
  new: { title: "Lifetime", list: [{ k: "keep", label: "Ends with parent" }, { k: "outlive", label: "Outlives parent" }, { k: "none", label: "No parent" }] },
};
// A plain command in a new terminal, for the shell of the machine the space is on: the task is the command.
const SHELL = (machine) => (!machine && appWindow()?.platform === "windows"
  ? { key: "shell", name: "Shell", run: ["powershell", "-NoProfile", "-Command"], installed: true, shell: true }
  : { key: "shell", name: "Shell", run: ["sh", "-c"], installed: true, shell: true });
// Read-only: whether Claude Code already trusts a folder (tools/trust.mjs).
const TRUST_TOOL = () => `${appHome()}/mods/endfield/tools/trust.mjs`;
// Herdr's own multi-line field (its feedback dialog) takes Enter as a new line, so Enter adds a line
// here too and Ctrl+Enter (Cmd+Enter on macOS) dispatches, like the Dispatch button.
const SEND_KEY = () => (appWindow()?.platform === "macos" ? "Cmd+Enter" : "Ctrl+Enter");
const newTab = () => `tb${Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`;

export class Dispatch {
  init(p, cx) {
    this.p = p;
    this.mode = p.mode ?? "send";
    this.target = p.target ?? null;
    this.space = p.space ?? spaces().find((s) => s.active)?.id ?? null;
    this.parent = p.parent ?? (p.mode === "new" ? null : p.target ?? null);
    this.opt = { send: "now", new: this.parent ? "keep" : "none" };
    this.progs = [SHELL(this.machine())];
    this.prog = null;
    // The machine this.progs were asked of (knownAgents on), so a space on another one asks again.
    this.progsOn = undefined;
    // Saved logins (tools/account.mjs) and the one a new Claude Code agent starts on; null is the default login.
    this.accounts = [];
    this.account = null;
    // edit -> busy -> sent | refused (may Dispatch again) | uncertain: deliver() in orders.js.
    this.state = { phase: "edit", error: null };
    this.input = TextareaState.new({ placeholder: "What should it do?" });
    this.input.set_auto_grow(2, 6);
    this.input.on("change", (_e, cx) => cx.notify());
    this.input.on("submit", (e, cx) => { if (e?.secondary && this.ready) cx.spawn(async (cx) => this.confirm(cx)); });
    this.showCommand = false;
    // {folder, trusted: true | false | null, repo}: whether Claude Code will ask to trust the new agent's folder.
    this.trust = null;
    this.entered = false;
    if (checking()) return;
    // The first focus can land before the dialog is shown (the shipped prompt's finding): try again.
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    cx.spawn(async (cx) => {
      await this.loadPrograms(cx);
      ({ names: this.accounts, def: this.def } = await listAccounts());
      cx.notify();
      await this.checkTrust(cx);
    });
  }

  machine() { return spaces().find((s) => s.id === this.space)?.machine ?? null; }

  // What is installed where the new agent runs: a space on a WSL or SSH machine starts it there.
  async loadPrograms(cx) {
    const on = this.machine();
    if (this.progsOn === on) return;
    this.progsOn = on;
    this.progs = [SHELL(on)];
    let known = [];
    try { known = await knownAgents({ on }); } catch {}
    if (this.progsOn !== on) return;
    // Installed programs first, then the shell, then the rest (dimmed): six tiles show.
    this.progs = [...known.filter((g) => g.installed), SHELL(on), ...known.filter((g) => !g.installed)];
    if (!this.progs.some((g) => g.key === this.prog && g.installed)) this.prog = this.progs.find((g) => g.installed && !g.shell)?.key ?? "shell";
    cx.notify();
  }

  // Once per folder, and only for a space on this machine: ~/.claude.json lives where Claude Code runs.
  async checkTrust(cx) {
    const space = spaces().find((s) => s.id === this.space);
    const folder = space && !space.machine ? space.folder ?? null : null;
    if (!folder || this.trust?.folder === folder) return;
    this.trust = { folder, trusted: null, repo: false };
    // A later space may have been chosen while this ran: keep the answer only for the folder still asked about.
    try {
      const got = { folder, ...JSON.parse((await exec("node", [TRUST_TOOL(), folder], { timeout: 10000 })).stdout) };
      if (this.trust?.folder === folder) this.trust = got;
    } catch {}
    cx.notify();
  }

  // The exact command: the argv hc gets, and that argv as one line for this machine's shell. A send
  // to an agent follows deliverPlan, so "Only if idle" to a finished agent goes plain, as the preview says.
  command() {
    const task = this.input.value().trim();
    const platform = appWindow()?.platform;
    if (this.mode === "send") {
      const T = this.target ? roster().all.get(this.target) : null;
      // hc delivers on Herdr's own status, not the roster's waiting.
      const plan = T ? deliverPlan(T.herdrStatus, this.opt.send === "idle") : null;
      const args = sendArgs({ target: this.target ?? "?", delivery: this.opt.send === "wait" ? "wait" : plan?.gate ?? this.opt.send, task });
      return { args, text: commandLine(args, platform), task, plan };
    }
    const space = spaces().find((s) => s.id === this.space);
    const prog = this.progs.find((g) => g.key === this.prog) ?? SHELL(space?.machine);
    const parent = this.opt.new === "none" ? null : this.parent;
    const args = runArgs({ parent, outlive: this.opt.new === "outlive", machine: space?.machine, folder: space?.folder, space: this.space, tab: this.tab ??= newTab(), argv: isClaude({ program: prog }) && this.accounts.length && !space?.machine ? accountArgv({ tool: ACCOUNT_TOOL(), account: this.account, argv: prog.run }) : prog.run, task });
    return { args, text: commandLine(args, platform), prog, task };
  }

  async confirm(cx) {
    if (this.state.phase !== "edit" && this.state.phase !== "refused") return;
    const { args, task, plan } = this.command();
    if (!task || plan?.enabled === false) return;
    const send = this.mode === "send";
    const target = this.target;
    const wait = send && this.opt.send === "wait";
    this.state = { phase: "busy", error: null };
    cx.notify();
    const r = await deliver({
      args,
      exec: (a) => exec("hc", a, { timeout: timeoutFor({ mode: this.mode, delivery: this.opt.send }) }),
      log: async (r) => {
        const to = send ? target : (/"address":"([^"]+)"/.exec(r.stdout ?? "")?.[1] ?? "new");
        await append({ at: Date.now(), from: "you", to, kind: "task", via: ["Dispatch", commandLine(args.slice(0, -1), appWindow()?.platform)], text: task });
        if (!wait) return;
        // Not a reply: the screen's last line once the turn ended, which may be a prompt, a spinner or a draft.
        const screen = await hc(["read", target, "--lines", "20"]);
        const last = `${screen.stdout ?? ""}`.split(/\r?\n/).map((l) => l.trim()).filter((l) => /[\p{L}\p{N}]/u.test(l)).at(-1);
        if (last) await append({ at: Date.now(), from: target, to: "you", kind: "screen", via: ["hc send --wait", "last screen line after the turn"], text: last });
      },
    });
    if (r.phase === "sent") cue("tick");
    if (r.phase === "sent" && r.logged) { closeOverlay(props()?.overlay ?? this.p.overlay); return; }
    this.state = r.phase === "sent" ? { phase: "sent", error: "Sent. The Comms log could not be written." } : r;
    cx.notify();
  }

  hover(id) { return (over, cx) => { if (over) this.hot = id; else if (this.hot === id) this.hot = null; cx.notify(); }; }

  render(cx) {
    const C = palette();
    const p = props() ?? this.p;
    const R = roster();
    const send = this.mode === "send";
    const T = this.target ? R.all.get(this.target) : null;
    const term = this.target && !T ? terminals().find((t) => t.address === this.target) : null;
    const { text, prog, plan } = this.command();
    const task = this.input.value().trim();
    const space = spaces().find((s) => s.id === this.space);
    const squad = R.squads.find((q) => q.id === this.space);
    const parentM = this.parent ? R.all.get(this.parent) : null;
    const lone = this.opt.new === "none" || !this.parent;
    // The roster's own draw: a same-program child runs its parent's model; any other starts on its program's default until its model is known.
    const up = lone ? null : parentM;
    const model = up && up.program?.key === prog?.key ? up.model ?? null : null;
    const ident = prog ? (prog.shell ? IDENTITY.as(null, { key: "shell", name: "Shell" }) : cast(IDENTITY, IDENTITY.resolve(prog, null, { parent: up?.program ?? null, model }), prog, new Set(R.taken))) : null;
    const callsign = ident?.callsign ?? ident?.name.toUpperCase() ?? "";
    const tone = { blocked: "signal", working: "flow", error: "error" }[T?.herdrStatus] ?? "lime";
    const warn = !send ? null : plan ? [tone, plan.preview ?? (deliverPlan(T.herdrStatus, false).enabled ? `${plan.reason} Choose Now to send anyway.` : plan.reason)]
      : term ? ["hairStrong", "A terminal with no agent status: the text is typed and Enter pressed."] : ["hairStrong", "Pick a target."];
    const held = send && plan?.enabled === false;
    const problem = taskProblem({ mode: this.mode, shell: Boolean(prog?.shell), task });
    const done = this.state.phase === "sent" || this.state.phase === "uncertain";
    const ready = Boolean(task) && !held && !problem && (this.state.phase === "edit" || this.state.phase === "refused") && (send ? Boolean(this.target) : Boolean(this.space));
    this.ready = ready;
    const banner = this.state.error ? { refused: ["hc said", C.error], uncertain: ["Check before sending again", C.error], sent: ["Sent", C.text] }[this.state.phase] ?? ["hc said", C.error] : problem ? ["Not sent", C.error] : null;
    const pair = (a, b, fg, dim, size) => h_flex().min_w(0).gap(6).items_center().child(wide(a, fg, size).flex_none()).child(wide(b, dim, size).min_w(0).truncate());
    const section = (n, label, right) => h_flex().gap(8).items_center().child(spaced([n, label], C.dim, { rest: C.muted, gap: 6 })).child(div().flex_1().h(1).bg(C.hair)).when(Boolean(right), (el) => el.child(micro(right, C.muted)));
    const tabBtn = (k, label, cmd) => {
      const on = this.mode === k;
      return h_flex().id(`dl-mode-${k}`).h(28).px(12).gap(6).items_center().rounded_full().cursor_pointer().when(on, (el) => el.bg(C.selBg))
        .on_click((_e, cx) => { this.mode = k; this.state.error = null; cx.notify(); })
        .child(div().text_size(12).font_semibold().text_color(on ? C.selText : C.text).child(label))
        .child(div().font_family(FONT.mono).text_size(9).text_color(on ? C.selMuted : C.muted).child(cmd));
    };
    const targets = R.flat.slice(0, 12);
    const targetTile = (m) => {
      const on = m.address === this.target;
      return v_flex().id(`dl-t-${m.address}`).relative().flex_1().min_w(0).h(96).items_center().justify_center().gap(6).rounded(3).border_1().cursor_pointer()
        .border_color(on ? C.selBg : C.hair).bg(on ? C.selBg : C.ground)
        .tooltip(`${m.label}, ${m.title}`)
        .on_click((_e, cx) => { this.target = m.address; this.parent = m.address; cx.notify(); })
        .when(on, (el) => el.child(div().absolute().left(-1).top(14).bottom(14).w(3).bg(C.signal)))
        .child(chip(C, m.ident, m.status, { size: 40, on, ground: on ? C.selBg : C.ground }))
        .child(wide(m.label, on ? C.selText : C.text, 8.5).max_w_full().truncate())
        .child(h_flex().h(10).gap(4).items_center().child(glyph(C, m.status, { inv: on, size: 8 }) ?? div()).child(micro(m.address, on ? C.selMuted : C.muted, 8.5)));
    };
    const progTile = (g) => {
      const on = g.key === this.prog;
      return v_flex().id(`dl-p-${g.key}`).relative().flex_1().min_w(0).h(78).p(8).gap(4).justify_end().rounded(3).overflow_hidden().bg(C.ink)
        .when(on, (el) => el.border_2().border_color(C.signal)).when(!g.installed, (el) => el.opacity(0.45))
        .when(g.installed, (el) => el.cursor_pointer().on_click((_e, cx) => { this.prog = g.key; cx.notify(); }))
        .child(dots("#FFFFFF1F"))
        .child(div().absolute().left(8).top(8).font_family(FONT.mono).text_size(10).text_color("#F2F2F2").child(IDENTITY.as(null, g).badge))
        .child(div().relative().text_size(11.5).font_semibold().text_color("#F2F2F2").truncate().child(g.name))
        .child(micro(g.installed ? "installed" : "not installed", "#A9A9A3", 8.5).relative())
        .child(div().absolute().left(0).right(0).bottom(0).h(3).bg(g.installed ? C.lime : "#3A3A3A"));
    };
    const box = (label, body) => v_flex().flex_1().min_w(0).gap(5).px(10).py(8).rounded(3).border_1().border_color(C.hair).child(spaced([label].flat(), C.muted, { rest: C.dim, size: 8.5, gap: 6 })).child(body);
    const cycleSpace = (_e, cx) => {
      const ids = spaces().map((s) => s.id);
      this.space = ids[(ids.indexOf(this.space) + 1) % ids.length] ?? null;
      this.tab = null;
      cx.notify();
      cx.spawn(async (cx) => { await this.loadPrograms(cx); await this.checkTrust(cx); });
    };
    const optRow = OPTS[this.mode];
    // Saved logins and the account tool live on this computer: an agent on another machine uses that machine's login.
    const onAccount = isClaude({ program: prog }) && this.accounts.length > 0 && !space?.machine;
    const untrusted = isClaude({ program: prog }) && this.trust?.folder === space?.folder && this.trust?.trusted === false;
    const cycleAccount = (_e, cx) => {
      const list = [null, ...this.accounts];
      this.account = list[(list.indexOf(this.account) + 1) % list.length];
      cx.notify();
    };
    return root(C, div().id("dl-root").size_full().overflow_y_scrollbar().flex().items_center().justify_center()
      .on_size_change((_s, cx) => { if (!this.entered) cx.timer.after(MOTION.settle.delay, (cx) => { this.entered = true; cx.notify(); }); })
      .child(v_flex().id("dispatch").relative().w(660).bg(C.raised).border_1().border_color(C.hairStrong).rounded(4)
        .opacity(this.entered ? 1 : 0).top(this.entered ? 0 : 8).transition("opacity", MOTION.dispatch.enter).transition("top", MOTION.dispatch.enter)
        .child(div().absolute().left(-7).top(-7).size(10).border_l(1.5).border_t(1.5).border_color(C.text))
        .child(div().absolute().right(-7).bottom(-7).size(10).border_r(1.5).border_b(1.5).border_color(C.text))
        .child(h_flex().pl(22).pr(20).pt(18).pb(14).gap(12).items_end()
          .child(v_flex().gap(8)
            .child(h_flex().gap(8).items_center().child(spaced(send ? ["hc send", "to a running agent"] : ["hc run", "new agent in a space"], C.muted, { rest: C.dim })).child(barcode(C.cross)))
            .child(div().text_size(20).font_semibold().child("// Dispatch")))
          .child(div().flex_1())
          .child(h_flex().p(3).gap(2).rounded_full().bg(C.sunken).child(tabBtn("send", "Send to agent", "hc send")).child(tabBtn("new", "New agent", "hc run")))
          .child(div().id("dl-close").relative().size(30).ml(4).rounded_full().border_1().border_color(C.hairStrong).flex().items_center().justify_center().cursor_pointer()
            .on_hover(this.hover("dl-close")).on_click(() => closeOverlay(p.overlay))
            .child(growDisc("dl-close-disc", 30, 30, 28, this.hot === "dl-close", C.red))
            .child(div().relative().text_size(11).text_color(this.hot === "dl-close" ? C.ink : C.text).child("×"))))
        .when(send, (el) => el.child(v_flex().px(22).pt(4).pb(14).gap(10)
          .child(section("01", "Target operator", `${String(R.flat.length).padStart(2, "0")} in this window`))
          .child(v_flex().gap(8).children([0, 6].filter((k) => k < Math.max(1, targets.length)).map((k) => h_flex().gap(8)
            .children([...targets.slice(k, k + 6).map(targetTile), ...Array.from({ length: Math.max(0, 6 - targets.slice(k, k + 6).length) }, () => div().flex_1())]))))
          .when(Boolean(term), (el) => el.child(spaced([`Target: ${term.address}`, `${term.program?.name ?? "terminal"} (opened on it)`], C.text, { rest: C.muted })))
          .child(h_flex().gap(10).items_center().px(10).py(8).bg(C.ground).border_l(2).border_color(C[warn[0]]).rounded_r(3)
            .when(Boolean(T), (el) => el.child(pair(T.label, T.address, C.text, C.muted, 9.5).flex_none()))
            .child(div().text_size(12).text_color(C.muted).child(warn[1])))))
        .when(!send, (el) => el.child(v_flex().px(22).pt(4).pb(14).gap(10)
          .child(section("01", "Program", space?.machine ? `Installed on ${space.machine}` : "Installed on this machine"))
          .child(h_flex().gap(8).children(this.progs.slice(0, 6).map(progTile)))
          .child(h_flex().gap(8)
            .child(box(["Operator", model ? "by model" : "program default"], h_flex().gap(10).items_center()
              .child(ident ? chip(C, ident, "idle", { size: 30, ground: C.raised }) : div())
              .child(wide(callsign, C.text, 10).truncate())))
            .child(box(["Squad", "space"], h_flex().id("dl-space").gap(6).items_center().cursor_pointer().on_click(cycleSpace).tooltip("Click for the next space")
              .child(div().w(22).h(16).flex().items_center().justify_center().rounded(3).bg(C.selBg).font_family(FONT.mono).text_size(9).text_color(C.selText).child(squad?.num ?? String(spaces().findIndex((s) => s.id === this.space) + 1).padStart(2, "0")))
              .child(wide(space?.name ?? "none", C.text, 10).flex_1().min_w(0).truncate()).child(micro("▸", C.muted))))
            .child(box(["Parent", "reports to"], lone ? pair("None", "top level", C.text, C.muted, 10) : pair(parentM?.label ?? this.parent, this.parent, C.text, C.muted, 10)))
            .when(onAccount, (el) => el.child(box(["Account", "login"], h_flex().id("dl-account").gap(6).items_center().cursor_pointer().on_click(cycleAccount).tooltip("Click for the next saved account")
              .child(wide(this.account ?? (this.def ? `default ${this.def}` : "default"), C.text, 10).flex_1().min_w(0).truncate()).child(micro("▸", C.muted))))))
          .when(untrusted, (el) => el.child(h_flex().gap(10).items_center().px(10).py(8).bg(C.ground).border_l(2).border_color(C.hairStrong).rounded_r(3)
            .child(micro("Trust", C.muted).flex_none())
            .child(div().flex_1().min_w(0).text_size(12).text_color(C.muted)
              .child(`First run in this ${this.trust.repo ? "repo" : "folder"}: Claude Code will ask you to trust it once, in the new tab. SETUP step 8 says why.`))))))
        .child(v_flex().px(22).pb(14).gap(8)
          .child(section("02", prog?.shell && !send ? "Command" : "Task", `Enter adds a line  ${SEND_KEY()} dispatches  ${task.length} chars`))
          .child(h_flex().min_h(58).px(12).py(10).gap(8).items_stretch().rounded(3).border_1().border_color(C.hairStrong).bg(C.ground)
            .child(div().w(4).flex_none().border_t(1.5).border_b(1.5).border_l(1.5).border_color(C.text))
            .child(div().flex_1().min_w(0).font_family("JetBrains Mono").text_size(12).child(Textarea.new(this.input)))
            .child(div().w(4).flex_none().border_t(1.5).border_b(1.5).border_r(1.5).border_color(C.text))))
        .child(h_flex().px(22).pb(16).gap(8).items_center()
          .child(spaced(["03", optRow.title], C.dim, { rest: C.muted, gap: 6 }).w(92).flex_none())
          .children(optRow.list.filter((o) => send || o.k === "none" || this.parent).map((o) => {
            const on = this.opt[this.mode] === o.k;
            return h_flex().id(`dl-o-${o.k}`).h(26).px(10).gap(6).items_center().rounded_full().border_1().cursor_pointer()
              .border_color(on ? C.selBg : C.hairStrong).when(on, (el) => el.bg(C.selBg))
              .on_click((_e, cx) => { this.opt[this.mode] = o.k; cx.notify(); })
              .child(div().size(8).rounded_full().border(1.5).border_color(on ? C.selText : C.text).when(on, (el) => el.bg(C.signal)))
              .child(div().text_size(12).text_color(on ? C.selText : C.text).child(o.label));
          })))
        .when(Boolean(banner), (el) => el.child(h_flex().mx(22).mb(12).px(10).py(7).gap(8).items_center().border_l(2).border_color(this.state.phase === "sent" ? C.lime : C.red).bg(C.ground)
          .child(micro(banner[0], banner[1]).flex_none()).child(div().flex_1().min_w(0).font_family(FONT.mono).text_size(11).child(this.state.error ?? problem))))
        // The graphite strip: who ▶▶ whom, the exact command behind Show command, Cancel and the one yellow action.
        .child(strip()
          .child(v_flex().flex_1().min_w(0).gap(6)
            .child(h_flex().gap(8).items_center().min_w(0)
              .child(micro("Current formula", STRIP.dim))
              .child(wide("You", STRIP.text, 10).flex_none())
              .child(div().text_size(9).text_color("#31ACF0").child("▶▶"))
              .child(send ? (T ? pair(T.label, T.address, STRIP.text, STRIP.dim, 10) : wide(this.target ?? "—", STRIP.text, 10).min_w(0).truncate())
                : pair(`New ${prog?.name ?? ""}`, lone ? space?.name ?? "" : `child of ${this.parent}`, STRIP.text, STRIP.dim, 10)))
            .child(commandToggle("dl-cmd", { open: this.showCommand, flip: (_e, cx) => { this.showCommand = !this.showCommand; cx.notify(); }, lines: [text] })))
          .when(!done, (el) => el.child(stripCancel("dl-cancel", () => closeOverlay(p.overlay))))
          .when(done, (el) => el.child(pill(C, "dl-close-done", "Close", { kind: "dark", knob: "×", h: 30, hot: this.hot === "dl-close-done", on_hover: this.hover("dl-close-done"), action: () => closeOverlay(p.overlay) })))
          .when(!done, (el) => el.child(div().when(!ready, (el) => el.opacity(0.45)).child(pill(C, "dl-go", this.state.phase === "busy" ? "Dispatching" : "Dispatch", { kind: "primary", h: 30, hot: this.hot === "dl-go", on_hover: this.hover("dl-go"),
            action: (_e, cx) => { if (ready) cx.spawn(async (cx) => this.confirm(cx)); } })))))));
  }
}
