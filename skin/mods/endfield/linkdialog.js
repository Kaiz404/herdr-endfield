// linkdialog: Link, the one-sentence confirm a drop of one agent row on another opens (agents.js),
// and the links file it and the card's Unlink write. Link saves the link to
// data/endfield/links.json at once, so Squads nests the helper whatever either agent is doing, then
// types each note with hc send --if idle into only an agent idle right now (links.js linkThenTell).
// A side not told is noted false and its card offers Send note, which opens this dialog for that
// side alone (side: "lead" | "helper") and types only its note, only while it is idle.
//   link  props {role: "link", lead, helper (addresses), side?, overlay}

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, readTextFile, writeTextFile, appHome, exec, panes, shared, setShared, window as appWindow } from "herdr";
import { palette, root, pill, cue, MOTION, strip, stripCode, stripCancel, STRIP } from "./kit.js";
import { roster } from "./roster.js";
import { append } from "./comms.js";
import { gate, deliver, timeoutFor, stepLine } from "./orders.js";
import { updateFile } from "./archive.js";
import { parseLinks, withLink, withoutLink, withNoted, lifeOf, byLife, linkProblem, linkSteps, linkThenTell, tell, outcome } from "./links.js";
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

export const openLink = (p) => openOverlay({ mod: "endfield", kind: "dialog", frame: "none", width: 600, height: 420, props: { role: "link", ...p } });

const cwdOf = (address) => panes().find((p) => p.terminal === address)?.cwd ?? null;
// The task as the agent's row shows it (agents.js publishes it), not the terminal's raw title.
const who = (m) => ({ address: m.address, label: m.label, title: shared("endfield.rowTitles")?.[m.address] ?? m.title, cwd: cwdOf(m.address) });
const nameOf = (m) => m?.ident?.callsign ?? m?.label ?? "It";

// How long the result line stays before the dialog closes: longer when there is something to do later.
const LINGER = { clear: 1600, later: 4200 };

export class LinkDialog {
  init(p) {
    this.p = p;
    // edit -> busy -> done (the result line, then it closes) | edit again with an error
    this.state = { phase: "edit", error: null, line: null };
    this.showNote = false;
    this.entered = false;
  }

  hover(id) { return (over, cx) => { if (over) this.hot = id; else if (this.hot === id) this.hot = null; cx.notify(); }; }

  // The pair, its notes and why the button can't run now: one call for the drawing and the click.
  plan() {
    const R = roster();
    const lead = R.all.get(this.p.lead), helper = R.all.get(this.p.helper);
    const side = this.p.side ?? null;
    const steps = lead && helper ? linkSteps(who(lead), who(helper)).filter((s) => !side || s.who === side) : [];
    const why = !side ? linkProblem(R.all, this.p.helper, this.p.lead)
      : !lead || !helper ? "One of them is gone."
      : helper.linked !== lead.address ? "They are no longer linked."
      : gate({ lead, helper }[side].herdrStatus);
    return { lead, helper, side, steps, why, names: { lead: nameOf(lead), helper: nameOf(helper) } };
  }

  async go(cx) {
    const plan = this.plan();
    if (plan.why || this.state.phase !== "edit") return;
    this.state = { phase: "busy", error: null, line: null };
    cx.notify();
    const { lead, helper } = plan;
    const b = lifeOf(helper);
    const io = {
      steps: plan.steps,
      // Read at the click: a note goes only into an agent Herdr says is idle right now.
      idle: (w) => gate(roster().all.get({ lead: lead.address, helper: helper.address }[w])?.herdrStatus) === null,
      told: (step) => updateLinks((text, now) => withNoted(text, b, step.who, now)),
      send: (step) => deliver({
        args: step.hc,
        exec: (a) => exec("hc", a, { timeout: timeoutFor({ mode: "send", delivery: "idle" }) }),
        log: () => append({ at: Date.now(), from: "you", to: step.hc[1], kind: "action", via: `Link ${stepLine(step, appWindow()?.platform)}`, text: step.hc.at(-1) }),
      }),
    };
    const link = { a: lifeOf(lead), b, sa: lead.session, sb: helper.session, at: Date.now(), noted: { lead: false, helper: false } };
    const r = plan.side ? { ok: true, ...(await tell(io)) } : await linkThenTell({ ...io, keep: () => updateLinks((text, now) => withLink(text, link, now)) });
    await loadLinks();
    if (!r.ok) { this.state = { phase: "edit", error: r.error, line: null }; cx.notify(); return; }
    const later = Object.values(r.out).some((x) => x !== "sent");
    this.state = { phase: "done", error: null, line: outcome({ ...r, names: plan.names, linked: !plan.side }) };
    cue("tick");
    cx.notify();
    cx.timer.after(later ? LINGER.later : LINGER.clear, () => closeOverlay((props() ?? this.p).overlay));
  }

  render() {
    const C = palette();
    const p = props() ?? this.p;
    const { side, steps, why, names } = this.plan();
    const { phase, error, line } = this.state;
    const ready = !why && phase === "edit";
    const title = side ? `// Send ${names[side]} its note` : `// Link ${names.helper} under ${names.lead}`;
    const sentence = side
      ? `${names[side]} gets a short note about ${names[side === "lead" ? "helper" : "lead"]} so they can coordinate.`
      : "Both agents get a short note about each other so they can coordinate.";
    const said = phase === "done" ? [line, C.text] : error ? [error, C.error] : why ? [why, C.muted] : null;
    const toggle = h_flex().id("ln-note").h(30).px(14).items_center().rounded_full().border_1().border_color(STRIP.edge).cursor_pointer()
      .on_click((_e, cx) => { this.showNote = !this.showNote; cx.notify(); })
      .child(div().text_size(12).font_medium().text_color(STRIP.text).child(this.showNote ? "Hide note" : "Show note"));
    return root(C, div().id("ln-root").size_full().flex().items_center().justify_center()
      .on_size_change((_s, cx) => { if (!this.entered) cx.timer.after(MOTION.settle.delay, (cx) => { this.entered = true; cx.notify(); }); })
      .child(div().w(560).opacity(this.entered ? 1 : 0).top(this.entered ? 0 : 8).relative().transition("opacity", MOTION.dispatch.enter).transition("top", MOTION.dispatch.enter)
        .child(frame(C, "link", {
          kicker: "Squads  link",
          title,
          close: closeButton(C, this, p.overlay),
          body: v_flex().px(22).pb(16).gap(10)
            .child(div().text_size(13).text_color(C.text).child(sentence))
            .when(Boolean(said), (el) => el.child(div().text_size(12).text_color(said[1]).child(said[0])))
            // The note text as typed, wrapped: hc types the last argument of each line.
            .when(this.showNote, (el) => el.child(stripCode(v_flex().id("ln-notes").max_h(180).overflow_y_scrollbar().gap(8).px(10).py(8).rounded(3).bg(STRIP.bg))
              .children(steps.map((s) => div().child(`${names[s.who]}: ${s.hc.at(-1)}`))))),
          strip: strip().child(div().flex_1())
            .child(toggle)
            .when(phase !== "done", (el) => el.child(stripCancel("ln-cancel", () => closeOverlay(p.overlay))))
            .when(phase === "done", (el) => el.child(pill(C, "ln-done", "Close", { kind: "dark", knob: "×", h: 30, hot: this.hot === "ln-done", on_hover: this.hover("ln-done"), action: () => closeOverlay(p.overlay) })))
            .when(phase !== "done", (el) => el.child(div().when(!ready, (el) => el.opacity(0.45)).child(pill(C, "ln-go", phase === "busy" ? (side ? "Sending" : "Linking") : side ? "Send" : "Link",
              { kind: "primary", h: 30, hot: this.hot === "ln-go", on_hover: this.hover("ln-go"), action: (_e, cx) => cx.spawn(async (cx) => this.go(cx)) })))),
        }))));
  }
}
