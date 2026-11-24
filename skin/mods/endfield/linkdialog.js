// linkdialog: Link as helper, the confirm a drop of one agent row on another opens (agents.js), and
// the links file it and the card's Unlink write. Like every typed action, it shows the exact
// commands first and runs them once, on Confirm only: the link is saved to data/endfield/links.json,
// then a note is typed into the lead and then the helper with hc send --if idle (links.js
// linkThenTell). Either one not idle refuses before anything is saved or typed. The card's Send note
// again opens it at the helper's note alone (from 1), for a link whose helper was never told.
//   link  props {role: "link", lead, helper (addresses), from (0, or 1: the helper's note only), overlay}

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, readTextFile, writeTextFile, appHome, exec, panes, shared, setShared, window as appWindow } from "herdr";
import { palette, root, micro, pill, cue, MOTION, FONT, strip, stripCode, stripCancel } from "./kit.js";
import { roster } from "./roster.js";
import { append } from "./comms.js";
import { gate, deliver, timeoutFor, stepLine } from "./orders.js";
import { updateFile } from "./archive.js";
import { parseLinks, withLink, withoutLink, withNoted, lifeOf, byLife, linkProblem, linkSteps, linkThenTell, DOC } from "./links.js";
import { frame, closeButton } from "./actions.js";

const FILE = () => `${appHome()}/data/endfield/links.json`;

async function readLinks() {
  try { return (await readTextFile(FILE())) ?? null; } catch { return null; }
}

// The Claude Code agents running now, by life: a write keeps only the links that still stand among them.
const lives = () => byLife(roster().all.values());

// updateFile reads links.json again before every write, so another window's links are kept.
const updateLinks = (change) => updateFile({ read: readLinks, write: (text, expected) => writeTextFile(FILE(), text, expected), change: (text) => change(text, lives()) });

let loaded = null;

/** links.json into shared "endfield.links", which every surface's roster nests helpers by. -> whether it changed. */
export async function loadLinks() {
  const links = parseLinks(await readLinks());
  const text = JSON.stringify(links);
  if (text === loaded) return false;
  loaded = text;
  setShared("endfield.links", links);
  return true;
}

/** The card's Unlink: the helper back at the top of its own squad. Nothing is typed. */
export async function unlink(m) {
  const r = await updateLinks((text, now) => withoutLink(text, lifeOf(m), now));
  await loadLinks();
  return r;
}

export const openLink = (p) => openOverlay({ mod: "endfield", kind: "dialog", frame: "none", width: 600, height: 600, props: { role: "link", ...p } });

const cwdOf = (address) => panes().find((p) => p.terminal === address)?.cwd ?? null;
// The task as the agent's row shows it (agents.js publishes it), not the terminal's raw title.
const who = (m) => ({ address: m.address, label: m.label, title: shared("endfield.rowTitles")?.[m.address] ?? m.title, cwd: cwdOf(m.address) });

const NOTES = [
  "They talk through Claude Code's own cross-session messaging (ListAgents, SendMessage), on by default from 2.1.234 on Windows. notify_when_idle needs 2.1.236 in both.",
  "A session started with --bare can't receive messages. crossSessionInbound set to refuse drops them, hold keeps them for your approval, and so does a session that bypasses permission prompts when the sender does not.",
  `The hc parent can't change: Report and hc's own parent notes still treat them as separate. ${DOC}`,
];

export class LinkDialog {
  init(p) {
    this.p = p;
    // edit -> busy -> sent | refused (Confirm again, from `next`) | uncertain
    this.state = { phase: "edit", error: null };
    this.next = p.from ?? 0;
    this.entered = false;
  }

  hover(id) { return (over, cx) => { if (over) this.hot = id; else if (this.hot === id) this.hot = null; cx.notify(); }; }

  // The pair, the steps and why Confirm can't run now: one call for the drawing and the click.
  plan() {
    const R = roster();
    const lead = R.all.get(this.p.lead), helper = R.all.get(this.p.helper);
    const problem = this.next === 0 ? linkProblem(R.all, this.p.helper, this.p.lead) : !lead || !helper ? "One of them is gone." : helper.linked !== lead.address ? "It is no longer linked to that lead." : null;
    const steps = lead && helper ? linkSteps(who(lead), who(helper)) : [];
    const busy = problem ? null
      : [[lead, 0], [helper, 1]].filter(([m, i]) => i >= this.next && gate(m.herdrStatus)).map(([m]) => `${m.label} ${m.address}: ${gate(m.herdrStatus)}`)[0] ?? null;
    return { lead, helper, steps, why: problem ?? busy };
  }

  async confirm(cx) {
    const plan = this.plan();
    if (plan.why || (this.state.phase !== "edit" && this.state.phase !== "refused")) return;
    this.state = { phase: "busy", error: null };
    cx.notify();
    const link = { a: lifeOf(plan.lead), b: lifeOf(plan.helper), sa: plan.lead.session, sb: plan.helper.session, at: Date.now(), noted: { lead: false, helper: false } };
    const r = await linkThenTell({
      steps: plan.steps,
      from: this.next,
      keep: () => updateLinks((text, now) => withLink(text, link, now)),
      unkeep: () => updateLinks((text, now) => withoutLink(text, link.b, now)),
      told: (step) => updateLinks((text, now) => withNoted(text, link.b, step.who, now)),
      send: (step) => deliver({
        args: step.hc,
        exec: (a) => exec("hc", a, { timeout: timeoutFor({ mode: "send", delivery: "idle" }) }),
        log: () => append({ at: Date.now(), from: "you", to: step.hc[1], kind: "action", via: `Link as helper ${stepLine(step, appWindow()?.platform)}`, text: step.hc.at(-1) }),
      }),
    });
    await loadLinks();
    this.next = r.next;
    this.state = { phase: r.phase, error: r.error ?? null };
    if (r.phase === "sent") cue("tick");
    cx.notify();
  }

  render() {
    const C = palette();
    const p = props() ?? this.p;
    const { lead, helper, steps, why } = this.plan();
    const platform = appWindow()?.platform;
    const done = this.state.phase === "sent" || this.state.phase === "uncertain";
    const ready = !why && (this.state.phase === "edit" || this.state.phase === "refused");
    const line = (label, tone, text) => h_flex().gap(10).items_center().px(10).py(8).bg(C.ground).border_l(2).border_color(C[tone]).rounded_r(3)
      .child(micro(label, C.muted).w(52).flex_none()).child(div().flex_1().min_w(0).text_size(12).text_color(C.muted).child(text));
    const party = (role, m) => line(role, "hairStrong", m ? `${m.ident?.callsign ?? ""}  ${m.label}  ${m.address}  ${m.title ?? ""}` : "Gone");
    const told = this.next > 0 && this.state.phase === "refused" ? `The lead was told. Confirm types only the helper's note. ${this.state.error}` : this.state.error;
    const outcome = this.state.phase === "sent" ? ["Linked", C.text, `${helper?.label ?? "It"} now shows under ${lead?.label ?? "its lead"}. Unlink it on its card.`]
      : told ? [{ refused: "hc said" }[this.state.phase] ?? "Check first", C.error, told] : null;
    return root(C, div().id("ln-root").size_full().flex().items_center().justify_center()
      .on_size_change((_s, cx) => { if (!this.entered) cx.timer.after(MOTION.settle.delay, (cx) => { this.entered = true; cx.notify(); }); })
      .child(div().w(560).opacity(this.entered ? 1 : 0).top(this.entered ? 0 : 8).relative().transition("opacity", MOTION.dispatch.enter).transition("top", MOTION.dispatch.enter)
        .child(frame(C, "link", {
          kicker: "Squads  link",
          title: this.p.from ? "// Send note again" : "// Link as helper",
          close: closeButton(C, this, p.overlay),
          body: v_flex().px(22).pb(16).gap(10)
            .child(party("Lead", lead))
            .child(party("Helper", helper))
            .child(line("Needs", why ? "red" : "lime", why ?? (this.next ? "The helper idle. hc types its note only while it stays idle, after any draft you left in it." : "Both idle. hc types each note only while that agent stays idle, after any draft you left in it.")))
            .child(line("Does", "hairStrong", this.p.from
              ? "The link is saved and the lead was told. Types the helper's note alone: it names the lead (folder, task) and asks it to coordinate with SendMessage and agree who owns which files."
              : "Saves the link, so Squads shows the helper under the lead. Then types a note into each naming the other (folder, task) and asking them to coordinate with SendMessage and agree who owns which files."))
            .children(NOTES.map((n) => line("Note", "signal", n)))
            .when(Boolean(outcome), (el) => el.child(h_flex().px(10).py(7).gap(8).items_center().border_l(2).border_color(outcome[1] === C.error ? C.red : C.lime).bg(C.ground)
              .child(micro(outcome[0], outcome[1]).flex_none()).child(div().flex_1().min_w(0).font_family(FONT.mono).text_size(11).child(outcome[2])))),
          // The exact commands, one per line, wrapped rather than cut: Confirm runs these and nothing else.
          strip: strip()
            .child(stripCode(v_flex().id("ln-cmd").flex_1().min_w(0).max_h(120).overflow_y_scrollbar().gap(4))
              .children(steps.slice(this.next).map((s) => div().child(stepLine(s, platform)))))
            .when(!done, (el) => el.child(stripCancel("ln-cancel", () => closeOverlay(p.overlay))))
            .when(done, (el) => el.child(pill(C, "ln-done", "Close", { kind: "dark", knob: "×", h: 30, hot: this.hot === "ln-done", on_hover: this.hover("ln-done"), action: () => closeOverlay(p.overlay) })))
            .when(!done, (el) => el.child(div().when(!ready, (el) => el.opacity(0.45)).child(pill(C, "ln-go", this.state.phase === "busy" ? "Running" : "Confirm",
              { kind: "primary", h: 30, hot: this.hot === "ln-go", on_hover: this.hover("ln-go"), action: (_e, cx) => cx.spawn(async (cx) => this.confirm(cx)) })))),
        }))));
  }
}
