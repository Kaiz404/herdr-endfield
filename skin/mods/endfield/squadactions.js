// squadactions: the confirm dialog behind a squad header's Archive squad and Close squad (squads.js
// squadMenu). props {role: "squad", id (the space), mode: "archive" | "close", overlay}. Like every
// card action it keeps the exact commands one click away (Show commands) and runs them once, on
// Confirm only. Both list every terminal that ends with the space (archive.js spaceTerminals:
// agents, sub-agents, shells and servers, archived chats' hidden shells), and space.close runs only if a fresh read of the space
// finds nothing the person wasn't shown (unconfirmed); else the dialog says what appeared and keeps it.
//   archive  every chat in the space (archive.js squadPlan, pinned ones too) goes through the card's
//            Archive (actions.js archiveChat, markEnded), one at a time in tree order; the first
//            refusal stops the rest. Once every one was seen to end (exitSeen), space.close ends the
//            shells they leave behind and the listed shells and servers. A chat that didn't end keeps
//            the space open, stays in Squads and keeps its record as still archiving.
//   close    space.close straight away. Herdr ends every terminal in the space, agents included
//            (`herdr-app commands`: "Close a space and end its terminals"), so the dialog names them
//            and offers Archive squad instead.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, run, shared, spaces, panes, agents, terminals, window as appWindow } from "herdr";
import { palette, root, micro, pill, cue, MOTION, FONT, strip, commandToggle, stripCancel } from "./kit.js";
import { roster } from "./roster.js";
import { ACTIONS, actionSteps, stepLine } from "./orders.js";
import { spaceTerminals, squadPlan, squadEnd, unconfirmed, confirmedOf, killPhrase, exitState, exitSeen } from "./archive.js";
import { frame, closeButton, archiveChat, markEnded, READ_EVERY_MS, EXIT_TRIES } from "./actions.js";

export const openSquadAction = (p) => openOverlay({ mod: "endfield", kind: "dialog", frame: "none", width: 620, height: 580, props: { role: "squad", ...p } });

// What each chat's row says while Archive squad runs: [word, tone].
const PHASE = {
  queued: ["Next", "muted"],
  sending: ["Typing", "text"],
  watching: ["Ending", "text"],
  ended: ["Archived", "text"],
  refused: ["Refused", "error"],
  running: ["Still running", "error"],
  skipped: ["Not sent", "muted"],
};

const closeStep = (id) => ({ herdr: "space.close", args: { id, confirmed: true } });

const GROUPS = [["agents", "Agents"], ["subs", "Sub-agents"], ["shells", "Shells and servers"]];
const names = (list) => list.map((c) => c.name).join(", ");

export class SquadDialog {
  init(p) {
    this.p = p;
    this.mode = p.mode;
    const q = roster().squads.find((s) => s.id === p.id);
    // Kept: the squad leaves the roster as its chats are hidden.
    this.title = q ? `Squad ${q.num}  ${q.name}` : "Squad";
    this.tabs = spaces().find((s) => s.id === p.id)?.tabs?.length ?? 0;
    // Archive squad's run once confirmed: {chats: [Who + {phase, error, chat, read}], end: squadEnd(...)}.
    this.job = null;
    // The plan the person last saw: Confirm acts on it, and space.close only on what it listed.
    this.seen = null;
    this.closed = false;
    // What appeared in the space after Confirm, so space.close didn't run: Who[].
    this.kept = null;
    this.showCommand = false;
  }

  hover(id) { return (over, cx) => { if (over) this.hot = id; else if (this.hot === id) this.hot = null; cx.notify(); }; }

  // Every terminal that ends with the space, read from Herdr now.
  enders() {
    return spaceTerminals(this.p.id, { spaces: spaces(), panes: panes(), listed: agents(), terms: terminals() });
  }

  // Every terminal in the space, grouped, named as Squads names them; pinned ones too: space.close ends them all.
  plan() {
    return squadPlan(this.enders(), roster().flat.filter((m) => m.space === this.p.id));
  }

  // Not close(): main.js hands a role's close() Herdr's cleanup call when the dialog goes.
  // confirmed: [{life, agent}] the person was shown. A fresh read with anything else keeps the space.
  closeSpace(confirmed) {
    const extra = unconfirmed(this.enders(), confirmed);
    if (extra.length) {
      const known = squadPlan(extra, roster().flat);
      this.kept = [...known.groups.agents, ...known.groups.subs, ...known.groups.shells];
      return;
    }
    const step = closeStep(this.p.id);
    run(step.herdr, step.args);
    this.closed = true;
    cue("tick");
  }

  async archive(cx) {
    const plan = this.seen;
    if (this.job || !plan || plan.blockers.length || !plan.chats.length) return;
    this.job = { chats: plan.chats.map((c) => ({ ...c, phase: "queued", error: null, chat: null, read: null })), end: "wait" };
    cx.notify();
    const sessions = shared("endfield.sessions") ?? {};
    let stop = false;
    for (const c of this.job.chats) {
      if (stop) { c.phase = "skipped"; continue; }
      c.phase = "sending";
      cx.notify();
      const { chat, r } = await archiveChat({ terminal: c.terminal, snap: sessions[c.terminal] ?? null, via: "Archive squad" });
      c.chat = chat;
      c.error = r.phase === "sent" ? null : r.error;
      // Refused typed nothing and took the record back; uncertain may have typed, so it is watched.
      c.phase = r.phase === "refused" ? "refused" : "watching";
      if (r.phase !== "sent") stop = true;
    }
    this.watch(cx);
  }

  // Herdr's lists are the evidence each one ended, as for the card's Archive.
  watch(cx, tries = 0) {
    cx.timer.after(READ_EVERY_MS, (cx) => cx.spawn(async (cx) => {
      for (const c of this.job.chats) {
        if (c.phase !== "watching") continue;
        const read = exitState(c.chat, agents(), terminals());
        if (exitSeen(c.read, read)) {
          c.phase = "ended";
          const marked = await markEnded(c.chat);
          if (!marked.ok) c.error = `Ended, but the archive could not mark it (${marked.error}).`;
        } else if (tries + 1 >= EXIT_TRIES) c.phase = "running";
        c.read = read;
      }
      this.job.end = squadEnd(this.job.chats.map((c) => c.phase));
      // The archived chats should be shells now; everything else as it was listed.
      if (this.job.end === "close") this.closeSpace([...this.job.chats.map((c) => ({ life: c.life, agent: null })), ...confirmedOf(this.seen.groups.shells)]);
      if (this.job.end === "wait") this.watch(cx, tries + 1);
      cx.notify();
    }));
  }

  render() {
    const C = palette();
    const p = props() ?? this.p;
    const platform = appWindow()?.platform;
    const archiving = this.mode === "archive";
    const job = this.job;
    const done = this.closed || Boolean(this.kept) || (job && job.end !== "wait");
    // Live until Confirm; then what the person confirmed stays on screen.
    if (!job && !done) this.seen = this.plan();
    const plan = this.seen;
    const { groups } = plan;
    const sp = spaces().find((s) => s.id === p.id);
    const tabs = this.tabs;
    const phaseOf = new Map((job?.chats ?? []).map((c) => [c.terminal, c]));
    const blocked = new Set(plan.blockers.map((b) => b.terminal));
    const steps = [
      ...(archiving ? (job ? job.chats : plan.chats).map((c) => actionSteps(ACTIONS[c.program].archive, { target: c.terminal })[0]) : []),
      closeStep(p.id),
    ];
    const ready = !done && !job && (archiving ? !plan.blockers.length && plan.chats.length > 0 : Boolean(sp));
    const line = (label, tone, text) => h_flex().gap(10).items_center().px(10).py(8).bg(C.ground).border_l(2).border_color(C[tone]).rounded_r(3)
      .child(micro(label, C.muted).flex_none()).child(div().flex_1().min_w(0).text_size(12).text_color(C.muted).child(text));
    const all = [...groups.agents, ...groups.subs, ...groups.shells];
    const agentsEnd = groups.agents.length + groups.subs.length > 0;
    const needs = archiving
      ? plan.blockers.length ? ["red", plan.blockers.map((b) => `${b.name}: ${b.why}`).join(" ")]
        : !plan.chats.length ? ["red", "No chat in this squad to archive."]
        : ["lime", "Every chat is idle. hc types each end command only while it stays idle."]
      : [all.length ? "red" : "hairStrong", all.length
        ? `Kills ${killPhrase(groups)} now.${agentsEnd ? " No /exit and no archive record, so Report > Archived can't resume the agents, and a turn in progress is lost." : ""}`
        : "Nothing runs in it."];
    const does = archiving
      ? `Archives each chat as its session card does: its record first, then ${[...new Set(plan.chats.map((c) => ACTIONS[c.program].archive.text()))].join(" or ") || "/exit"}, then hides it once Herdr stops listing it. A refusal stops the rest. When every chat has ended, space.close ends the shells they leave in its ${tabs} ${tabs === 1 ? "tab" : "tabs"}${groups.shells.length ? ` and ${killPhrase({ agents: [], subs: [], shells: groups.shells })}, which nothing resumes` : ""}. If one doesn't end, the space stays open.`
      : `space.close ends every terminal in the space: each agent, its sub-agents and every shell or server in its ${tabs} ${tabs === 1 ? "tab" : "tabs"}. Herdr doesn't keep or park them.`;
    const recheck = " Just before space.close the space is read again; if anything not listed here is in it, the space stays open.";
    const outcome = this.closed ? ["Closed", C.text, archiving ? "Every chat ended and the space is closed. Report > Archived resumes them." : "The space is closed."]
      : this.kept ? ["Kept", C.error, `${names(this.kept)} appeared in the space after you confirmed, so space.close didn't run and the space stays open. Open the menu again to see everything that would end.`]
      : job?.end === "keep" ? ["Kept", C.error, "Not every chat ended, so the space stays open. Those still in Squads keep their terminals; open the menu again to archive them."]
      : job ? ["Running", C.text, "Archiving one chat at a time."]
      : null;
    const row = (c) => {
      const j = phaseOf.get(c.terminal);
      const [word, tone] = j ? PHASE[j.phase] : !archiving || c.kind === "shell" ? ["Ends", "muted"] : blocked.has(c.terminal) ? ["Blocked", "error"] : ["Idle", "muted"];
      return v_flex().id(`sq-${c.terminal}`).gap(3).py(6).pl(10 + 14 * c.depth).pr(10).border_b(1).border_color(C.hair)
        .child(h_flex().gap(10).items_center().min_w(0)
          .child(div().w(110).flex_none().truncate().text_size(12).font_semibold().child(c.name))
          .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(C.muted).child(c.title))
          .when(c.pinned, (el) => el.child(micro("Pinned", C.muted, 9).flex_none()))
          .child(micro(word, tone === "error" ? C.error : tone === "text" ? C.text : C.muted).flex_none()))
        .when(Boolean(j?.error), (el) => el.child(div().font_family(FONT.mono).text_size(10.5).text_color(C.error).child(j.error)));
    };
    const section = ([key, label]) => groups[key].length
      ? [div().id(`sq-h-${key}`).pt(6).pb(2).child(micro(`${label}  ${groups[key].length}`, C.muted, 9)), ...groups[key].map(row)]
      : [];
    return root(C, div().id("sq-root").size_full().flex().items_center().justify_center()
      .on_size_change((_s, cx) => { if (!this.entered) cx.timer.after(MOTION.settle.delay, (cx) => { this.entered = true; cx.notify(); }); })
      .child(div().w(580).opacity(this.entered ? 1 : 0).top(this.entered ? 0 : 8).relative().transition("opacity", MOTION.dispatch.enter).transition("top", MOTION.dispatch.enter)
        .child(frame(C, "squad", {
          kicker: this.title,
          title: archiving ? "// Archive squad" : "// Close squad",
          close: closeButton(C, this, p.overlay),
          body: v_flex().px(22).pb(16).gap(12)
            .child(v_flex().id("sq-list").max_h(170).overflow_y_scrollbar().children(GROUPS.flatMap(section)))
            .child(line(archiving ? "Needs" : "Kills", needs[0], needs[1]))
            .child(line("Does", "hairStrong", does + recheck))
            .when(Boolean(outcome), (el) => el.child(h_flex().px(10).py(7).gap(8).items_center().border_l(2).border_color(outcome[1] === C.error ? C.red : C.lime).bg(C.ground)
              .child(micro(outcome[0], outcome[1]).flex_none()).child(div().flex_1().min_w(0).font_family(FONT.mono).text_size(11).child(outcome[2])))),
          // Confirm runs these lines and nothing else, shown or not.
          strip: strip()
            .child(commandToggle("sq-cmd", { open: this.showCommand, flip: (_e, cx) => { this.showCommand = !this.showCommand; cx.notify(); }, lines: steps.map((s) => stepLine(s, platform)) }).flex_1())
            .when(Boolean(done), (el) => el.child(pill(C, "sq-done", "Close", { kind: "dark", knob: "×", h: 30, hot: this.hot === "sq-done", on_hover: this.hover("sq-done"), action: () => closeOverlay(p.overlay) })))
            .when(!done && !job, (el) => el.child(stripCancel("sq-cancel", () => closeOverlay(p.overlay))))
            .when(!done && !job && !archiving, (el) => el.child(pill(C, "sq-instead", "Archive squad instead", { kind: "dark", h: 30, hot: this.hot === "sq-instead", on_hover: this.hover("sq-instead"),
              action: (_e, cx) => { this.mode = "archive"; cx.notify(); } })))
            .when(!done, (el) => el.child(div().when(!ready, (el) => el.opacity(0.45)).child(pill(C, "sq-go", job ? "Running" : archiving ? `Archive ${plan.chats.length}` : "Close squad",
              { kind: "primary", h: 30, hot: this.hot === "sq-go", on_hover: this.hover("sq-go"),
                action: (_e, cx) => { if (!ready) return; if (archiving) cx.spawn(async (cx) => this.archive(cx)); else { this.closeSpace(confirmedOf(all)); cx.notify(); } } })))),
        }))));
  }
}
