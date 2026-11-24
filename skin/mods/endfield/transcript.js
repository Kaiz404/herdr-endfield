// transcript: a Claude Code transcript (a sub-agent's, usually) as a read-only pane, the endfield
// mod's transcript role. props: {role, path, title?, id?, parent?, via?}. The user's prompt, the
// assistant's words as markdown, each tool call as one `● Tool arg` line and its result folded to
// its first line. It follows the file while shown and keeps the newest entry in view.
// Transcripts run to tens of MB and readTextFile stops at 1 MiB, so tools/probe.mjs (node) reads
// them, from the byte it last reached.
// Its foot takes a follow-up for the sub-agent. A Claude Code sub-agent has no terminal, so the text
// goes to its parent (terminal `parent`, callsign `via`) with `hc send`, asking it to pass the text
// on with SendMessage; the argv and its refusals are orders.js. Send runs exactly the command last
// drawn: render reads agents(), so it redraws when the parent's status changes, and a click that
// beats that redraw is refused with the reason. Nothing goes without the person's click or Enter,
// and each send is logged to Comms the way Dispatch logs. A sub-agent card's Follow-up opens or
// focuses this pane and names its path in the shared key "endfield.followup": the box takes the keyboard.

import { div } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle, TextView, InputState, Input } from "gpui-base";
import { props, exec, appHome, watchFolder, settings, checking, agents, shared, setShared, window as appWindow } from "herdr";
import * as fs from "fs/promises";
import { relayOrder, relayRefusal, commandLine, deliver, timeoutFor } from "./orders.js";
import { append } from "./comms.js";
import { commandToggle } from "./kit.js";

// Panes are ink cards in both appearances, so one set of terminal-side colours.
const C = { text: "#E6E6E1", muted: "#A9A9A3", dim: "#6F6F6A", rule: "#2C2C2C", flow: "#4CB8F5", signal: "#FFFA00", red: "#FF5A5E", raised: "#222222" };
const MONO = "JetBrains Mono";
// The newest entries drawn; a long run's earliest ones are counted, not drawn.
const KEEP = 400;
// The follow-up box takes the keyboard once the card that asked for it has closed.
const COMPOSE_FOCUS_MS = 300;
// How often a transcript that can't be watched is read again.
const POLL_MS = 3000;

const base = (p) => String(p ?? "").split(/[\\/]/).pop();

export class Transcript {
  init(p, cx) {
    this.p = props() ?? p ?? {};
    this.entries = [];
    this.dropped = 0;
    this.to = 0;
    this.state = "loading";
    this.scroll = ScrollHandle.new();
    this.req = `${appHome()}/data/endfield/probe-transcript-${Math.random().toString(36).slice(2, 10)}.json`;
    // edit -> busy -> sent | refused (may send again) | uncertain (Send waits until the text changes): deliver() in orders.js.
    this.send = { phase: "edit", error: null };
    // The order prompt() last drew; Send runs its args and nothing else.
    this.shown = null;
    this.showCommand = false;
    this.input = InputState.new({ placeholder: "Follow-up for this sub-agent" });
    this.input.on("change", (_e, cx) => { if (this.send.phase !== "busy" && this.input.value()) this.send = { phase: "edit", error: null }; this.notice = null; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.trySend(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    if (checking() || !this.p.path) { this.state = this.p.path ? "ready" : "missing"; return; }
    this.follow(cx);
  }

  async close() {
    this.closed = true;
    this.watch?.cancel();
    try { await fs.unlink(this.req); } catch {}
  }

  follow(cx) {
    const dir = this.p.path.replace(/[\\/][^\\/]+$/, "");
    // Herdr watches folders on this computer only, so a transcript on another machine (a
    // \\wsl.localhost share), or one whose watch is refused, is read again on a timer.
    const poll = () => cx.timer.every(POLL_MS, (cx) => cx.spawn(async (cx) => {
      if (this.closed || this.loading) return;
      this.loading = true;
      await this.load();
      this.loading = false;
      cx.notify();
    }));
    cx.spawn(async (cx) => {
      if (/^[\\/]{2}/.test(dir)) { await this.load(); cx.notify(); poll(); return; }
      while (!this.closed) {
        // Watch first, then read, so nothing written in between is missed.
        this.watch = watchFolder(dir);
        await this.load();
        cx.notify();
        try { await this.watch; } catch { poll(); return; }
      }
    });
  }

  async load() {
    try {
      await fs.mkdir(`${appHome()}/data/endfield`, { recursive: true });
      await fs.writeFile(this.req, JSON.stringify({ cmd: "render", path: this.p.path, from: this.to }));
      const r = await exec("node", [`${appHome()}/mods/endfield/tools/probe.mjs`, this.req], { timeout: 60000 });
      if (r.code !== 0) { this.state = "failed"; return; }
      const out = JSON.parse(r.stdout);
      if (out.missing) { this.state = "missing"; return; }
      if (out.to < this.to) { this.entries = []; this.dropped = 0; }
      this.to = out.to;
      if (out.entries.length) {
        this.entries.push(...out.entries);
        if (this.entries.length > KEEP) { this.dropped += this.entries.length - KEEP; this.entries = this.entries.slice(-KEEP); }
        this.newest = true;
      }
      this.state = "ready";
    } catch {
      this.state = "failed";
    }
  }

  order() {
    const p = props() ?? this.p;
    const status = agents().find((a) => a.address === p.parent)?.status ?? null;
    return { ...relayOrder({ parent: p.parent, status, id: p.id, title: p.title ?? base(p.path), text: this.input.value() }), status };
  }

  trySend(cx) {
    const shown = this.shown ?? this.order();
    const notice = relayRefusal({ phase: this.send.phase, shown, now: this.order() });
    if (notice) { this.notice = notice; cx.notify(); return; }
    const { args } = shown;
    this.notice = null;
    const p = props() ?? this.p;
    const text = this.input.value().trim();
    this.send = { phase: "busy", error: null };
    cx.notify();
    cx.spawn(async (cx) => {
      const r = await deliver({
        args,
        exec: (a) => exec("hc", a, { timeout: timeoutFor({ mode: "send", delivery: "now" }) }),
        log: () => append({ at: Date.now(), from: "you", to: p.parent, kind: "msg", via: `Follow-up via ${p.via ?? p.parent} to sub-agent ${p.id}`, text }),
      });
      if (r.phase === "sent") this.input.set_value("");
      this.send = r.phase === "sent" ? { phase: "sent", error: r.logged ? null : `Typed into ${p.via ?? "its parent"}. The Comms log could not be written.` } : r;
      cx.notify();
    });
  }

  /** The foot: who carries the follow-up, the input and Send, then the exact command or why it can't go. */
  prompt() {
    const p = props() ?? this.p;
    this.shown = this.order();
    const { args, problem } = this.shown;
    const { phase, error } = this.send;
    const ready = Boolean(args) && phase !== "busy" && phase !== "uncertain";
    // Yellow marks only what is yours right now: Send, while it would go and the input has focus.
    const primary = ready && this.typing;
    const [note, tone] = this.notice ? [this.notice, C.red]
      : phase === "uncertain" ? [`${error} It may have arrived: read the parent's screen before sending again.`, C.red]
      : error ? [error, phase === "sent" ? C.muted : C.red]
      : phase === "sent" ? [`Typed into ${p.via ?? "its parent"}. Check its pane to see whether it passed it on.`, C.muted]
      : [null, null];
    return v_flex().id("transcript-prompt").flex_none().gap(8).px(14).pt(10).pb(12).border_t(1).border_color(C.rule).bg(C.raised)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_none().font_family("Geist Mono").text_size(10).text_color(C.muted).child("// FOLLOW-UP"))
        .child(div().min_w(0).truncate().font_family("Geist Mono").text_size(10).text_color(C.dim)
          .child(`SENT VIA ${String(p.via ?? "its parent").toUpperCase()}, WHO PASSES IT ON WITH SENDMESSAGE`)))
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).font_family(MONO).text_size(12).child(Input.new(this.input)))
        .child(h_flex().id("transcript-send").flex_none().h(28).px(14).items_center().rounded_full()
          .when(primary, (el) => el.bg(C.signal).text_color("#141414"))
          .when(!primary, (el) => el.border_1().border_color(C.dim).text_color(C.text))
          .when(!ready, (el) => el.opacity(0.45))
          .when(ready, (el) => el.cursor_pointer())
          .on_click((_e, cx) => this.trySend(cx))
          .child(div().text_size(12).font_semibold().child(phase === "busy" ? "Sending" : "Send"))))
      .when(Boolean(note), (el) => el.child(div().min_w(0).font_family(MONO).text_size(10.5).line_height(1.4).text_color(tone).child(note)))
      // Send runs exactly this, shown or not; why it can't go is always in view.
      .child(args
        ? commandToggle("transcript-cmd", { open: this.showCommand, flip: (_e, cx) => { this.showCommand = !this.showCommand; cx.notify(); }, lines: [commandLine(args, appWindow()?.platform)],
          fg: C.dim, face: (el) => el.font_family(MONO).text_size(10.5).line_height(1.4).text_color(C.dim) })
        : div().min_w(0).font_family(MONO).text_size(10.5).line_height(1.4).text_color(C.muted).child(problem));
  }

  entry(e, i) {
    const id = `e-${this.dropped + i}`;
    switch (e.kind) {
      case "user":
        return h_flex().id(id).gap(10).px(14).py(10).bg(C.raised).border_l(3).border_color(C.signal)
          .child(div().flex_none().font_family(MONO).text_color(C.signal).child("›"))
          .child(div().flex_1().min_w(0).child(TextView.markdown(`${id}-md`, e.text).selectable(true)));
      case "text":
        return div().id(id).px(14).py(6).child(TextView.markdown(`${id}-md`, e.text).selectable(true));
      case "tool":
        return h_flex().id(id).px(14).pt(6).gap(8).font_family(MONO).text_size(12).min_w(0)
          .child(div().flex_none().text_color(C.flow).child("●"))
          .child(div().flex_none().text_color(C.text).child(e.tool))
          .when(Boolean(e.arg), (el) => el.child(div().min_w(0).truncate().text_color(C.muted).child(e.arg)));
      default:
        return h_flex().id(id).px(14).pb(4).gap(8).font_family(MONO).text_size(11.5).min_w(0)
          .child(div().flex_none().pl(4).text_color(C.dim).child("└"))
          .child(div().min_w(0).truncate().text_color(e.error ? C.red : C.dim).child(e.text || "(no output)"));
    }
  }

  render(cx) {
    const p = props() ?? this.p;
    const compose = shared("endfield.followup");
    if (compose?.path === p.path && compose.at !== this.composed) {
      this.composed = compose.at;
      // Consumed once: the key persists in shared.json, so a restart must not refocus the box.
      cx.timer.after(COMPOSE_FOCUS_MS, () => { setShared("endfield.followup", null); this.input.focus(); });
    }
    const body = this.entries.map((e, i) => this.entry(e, i));
    if (this.newest) {
      this.newest = false;
      // +1: the first child is the "earlier entries" line or a spacer.
      this.scroll.scroll_to_item(body.length);
    }
    const note = this.state === "missing" ? "This transcript isn't there any more."
      : this.state === "failed" ? "Couldn't read the transcript (needs node on PATH)."
      : this.state === "loading" ? "Reading…" : null;
    return v_flex().id("transcript").size_full().bg(settings()?.dark ? "#141414" : "#191919").text_color(C.text).font_family("Geist").text_size(13)
      .child(h_flex().flex_none().h(30).px(14).gap(8).items_center().border_b(1).border_color(C.rule)
        .child(div().flex_none().font_family("Geist Mono").text_size(10).text_color(C.muted).child("// TRANSCRIPT"))
        .child(div().min_w(0).flex_1().truncate().text_size(12.5).font_semibold().child(p.title ?? base(p.path)))
        .child(div().flex_none().font_family("Geist Mono").text_size(10).text_color(C.dim).child(`${String(this.dropped + this.entries.length).padStart(2, "0")} ENTRIES`)))
      .child(v_flex().id("transcript-list").flex_1().min_h(0).pb(16).overflow_y_scrollbar().track_scroll(this.scroll)
        .child(this.dropped
          ? div().px(14).py(8).font_family("Geist Mono").text_size(10).text_color(C.dim).child(`${this.dropped} EARLIER ENTRIES NOT SHOWN`)
          : div().h(6))
        .children(body)
        .when(Boolean(note), (el) => el.child(div().px(14).py(10).text_color(C.muted).child(note))))
      .child(this.prompt());
  }
}
