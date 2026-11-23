// endfield-transcript: a Claude Code transcript (a sub-agent's, usually) as a read-only pane.
// props: {path, title?}. The user's prompt, the assistant's words as markdown, each tool call
// as one `● Tool · arg` line and its result folded to its first line. It follows the file
// while shown and keeps the newest entry in view.
// Transcripts run to tens of MB and readTextFile stops at 1 MiB, so the endfield mod's
// tools/probe.mjs (node) reads them, from the byte it last reached.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle, TextView } from "gpui-base";
import { props, exec, appHome, watchFolder, settings, checking } from "herdr";
import * as fs from "fs/promises";

// Panes are ink cards in both appearances, so one set of terminal-side colours.
const C = { text: "#E6E6E1", muted: "#A9A9A3", dim: "#6F6F6A", rule: "#2C2C2C", flow: "#4CB8F5", signal: "#FFFA00", red: "#FF5A5E", raised: "#222222" };
const MONO = "JetBrains Mono";
// The newest entries drawn; a long run's earliest ones are counted, not drawn.
const KEEP = 400;

const base = (p) => String(p ?? "").split(/[\\/]/).pop();

export default class Transcript extends View {
  init(p, cx) {
    this.p = props() ?? p ?? {};
    this.entries = [];
    this.dropped = 0;
    this.to = 0;
    this.state = "loading";
    this.scroll = ScrollHandle.new();
    this.req = `${appHome()}/data/endfield-transcript/req-${Math.random().toString(36).slice(2, 10)}.json`;
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
    cx.spawn(async (cx) => {
      while (!this.closed) {
        // Watch first, then read, so nothing written in between is missed.
        this.watch = watchFolder(dir);
        await this.load();
        cx.notify();
        try { await this.watch; } catch { return; }
      }
    });
  }

  async load() {
    try {
      await fs.mkdir(this.req.replace(/\/[^/]+$/, ""), { recursive: true });
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
          .when(Boolean(e.arg), (el) => el.child(div().min_w(0).truncate().text_color(C.muted).child(`· ${e.arg}`)));
      default:
        return h_flex().id(id).px(14).pb(4).gap(8).font_family(MONO).text_size(11.5).min_w(0)
          .child(div().flex_none().pl(4).text_color(C.dim).child("└"))
          .child(div().min_w(0).truncate().text_color(e.error ? C.red : C.dim).child(e.text || "(no output)"));
    }
  }

  render(cx) {
    const p = props() ?? this.p;
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
        .when(Boolean(note), (el) => el.child(div().px(14).py(10).text_color(C.muted).child(note))));
  }
}
