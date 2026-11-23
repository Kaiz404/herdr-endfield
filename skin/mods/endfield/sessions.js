// sessions: what a Claude Code session behind an agent terminal is doing, one parsed shape
// per terminal. Sources, first wins:
//   1. a sidecar a Claude Code statusline writes: data/endfield/sessions/<session_id>.json
//      {session_id, terminal, cwd, transcript_path, model:{id, display_name}, context:{used, total, pct}, updated_at}
//   2. the transcript itself, ~/.claude/projects/<cwd slug>/<session>.jsonl. Without a sidecar the
//      terminal is matched to its folder's most recently written transcript: approximate, since
//      two sessions in one folder can't be told apart (`approx`).
// Transcripts run to tens of MB and readTextFile stops at 1 MiB, so tools/probe.mjs (node)
// reads them, folding only the lines appended since its last run.
//
// Session = {sessionId, terminal, cwd, transcriptPath, approx, model:{id, display, short} | null,
//   ctx:{used, total, pct} | null, tokens:{total, delta} | null, tools, turns, effort, mode,
//   lastAction:{tool, arg} | null, lastAt, startedAt, question, subagents: Sub[]}
// Sub = {id, path, title, model, tools, status: working | done | idle, lastAt, lastAction}

import * as fs from "fs/promises";
import { exec, readTextFile, appHome, watchFolder, home, checking } from "herdr";

const DATA = () => `${appHome()}/data/endfield`;
const SIDECARS = () => `${DATA()}/sessions`;
const PROBE = () => `${appHome()}/mods/endfield/tools/probe.mjs`;
// A sub-agent counts as working while its transcript was written this recently.
const LIVE_MS = 20000;
const POLL_MS = 3000;

export const isClaude = (a) => a?.program?.key === "claude" || a?.app === "claude-code";

/** "claude-opus-5-5" -> {display: "Claude Opus 5.5", short: "Opus 5.5"}; unknown ids pass through. */
function modelName(id, display = null) {
  const m = /(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?=$|[-[@])/i.exec(id ?? "");
  const short = m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ""}` : display ?? id ?? null;
  return { id, display: display ?? (m ? `Claude ${short}` : id), short };
}

// The window is 1M for a "[1m]" model, else 200K; a context already past 200K must be in the larger one.
function contextWindow(id, used) {
  return /\[1m\]/i.test(id ?? "") || used > 200000 ? 1000000 : 200000;
}

function shape(t, raw, sidecar, parentStatus) {
  const id = sidecar?.model?.id ?? raw?.model ?? null;
  const model = id ? modelName(id, sidecar?.model?.display_name ?? null) : null;
  const used = sidecar?.context?.used ?? raw?.used ?? null;
  const total = sidecar?.context?.total ?? (used != null ? contextWindow(id, used) : null);
  const ctx = used != null ? { used, total, pct: sidecar?.context?.pct ?? Math.round((used / total) * 100) } : null;
  const now = Date.now();
  const subs = (raw?.subagents ?? []).map((s) => ({
    id: s.id,
    path: s.path,
    title: s.description || (s.prompt ?? "").split("\n").find((l) => l.trim())?.trim() || `agent-${s.id}`,
    model: s.model ? modelName(s.model) : null,
    tools: s.tools ?? 0,
    status: now - s.mtime < LIVE_MS && (s.pending || !s.final) ? "working" : parentStatus === "idle" ? "idle" : "done",
    lastAt: s.mtime,
    lastAction: s.last,
  })).sort((a, b) => b.lastAt - a.lastAt);
  return {
    sessionId: sidecar?.session_id ?? raw?.sessionId ?? null,
    terminal: t.terminal,
    cwd: sidecar?.cwd ?? t.cwd,
    transcriptPath: sidecar?.transcript_path ?? raw?.transcript ?? null,
    approx: !sidecar && Boolean(raw?.approx),
    model,
    ctx,
    tokens: raw ? { total: raw.tokens, delta: raw.delta } : null,
    tools: raw?.tools ?? null,
    turns: raw?.turns ?? null,
    effort: raw?.effort ?? null,
    mode: raw?.mode ?? null,
    lastAction: raw?.last ?? null,
    lastAt: raw?.lastAt ?? null,
    startedAt: raw?.firstAt ?? null,
    question: raw?.pending ? raw.pending.question ?? `Allow ${raw.pending.tool}${raw.pending.arg ? ` · ${raw.pending.arg}` : ""}?` : null,
    subagents: subs,
  };
}

async function sidecars() {
  let names = [];
  try { names = await fs.readdir(SIDECARS()); } catch { return new Map(); }
  const byTerminal = new Map();
  for (const n of names.filter((n) => n.endsWith(".json"))) {
    try {
      const s = JSON.parse(await readTextFile(`${SIDECARS()}/${n}`) ?? "null");
      if (!s?.terminal) continue;
      const had = byTerminal.get(s.terminal);
      if (!had || String(s.updated_at ?? "") > String(had.updated_at ?? "")) byTerminal.set(s.terminal, s);
    } catch {}
  }
  return byTerminal;
}

/**
 * One owner's view of the sessions. `name` keeps each mod copy's probe request file its own.
 * Targets: [{terminal, cwd, status}] for Claude agents only.
 */
export class Sessions {
  constructor(name) {
    this.name = name;
    this.map = new Map();
    this.dirty = true;
    this.busy = false;
    this.key = "";
    this.watches = [];
    this.failed = false;
  }

  get(terminal) { return this.map.get(terminal) ?? null; }

  /** Seeds from a snapshot another copy already has (the card gets its row's). */
  seed(session) { if (session?.terminal) this.map.set(session.terminal, session); }

  /**
   * Polls at most every 3s, and only when `shown()` and something changed: a transcript or
   * sidecar was written (watched), the targets changed, or a live sub-agent may have gone quiet.
   */
  start(cx, targets, shown) {
    if (checking()) return;
    for (const dir of [`${home()}/.claude/projects`, SIDECARS()]) this.watch(cx, dir);
    cx.timer.every(POLL_MS, (cx) => {
      const ts = targets();
      const key = JSON.stringify(ts);
      const aging = [...this.map.values()].some((s) => s.subagents.some((k) => k.status === "working"));
      if (!shown() || !(this.dirty || aging || key !== this.key)) return;
      this.poll(cx, ts, key);
    });
    this.poll(cx, targets(), JSON.stringify(targets()));
  }

  watch(cx, dir) {
    cx.spawn(async () => {
      while (!this.stopped) {
        const w = watchFolder(dir);
        this.watches.push(w);
        try { await w; } catch { return; }
        this.watches = this.watches.filter((x) => x !== w);
        this.dirty = true;
      }
    });
  }

  stop() {
    this.stopped = true;
    for (const w of this.watches) w.cancel();
    this.watches = [];
  }

  poll(cx, targets, key) {
    if (this.busy || !targets.length) { if (!targets.length) this.map.clear(); return; }
    this.busy = true;
    this.dirty = false;
    this.key = key;
    cx.spawn(async (cx) => {
      try {
        const side = await sidecars();
        const req = `${DATA()}/probe-${this.name}.json`;
        await fs.mkdir(DATA(), { recursive: true });
        await fs.writeFile(req, JSON.stringify({
          cmd: "sessions",
          cache: `${DATA()}/probe-cache.json`,
          targets: targets.map((t) => ({ terminal: t.terminal, cwd: t.cwd, transcript: side.get(t.terminal)?.transcript_path ?? null })),
        }));
        const r = await exec("node", [PROBE(), req], { timeout: 20000 });
        const raw = r.code === 0 ? JSON.parse(r.stdout).sessions ?? {} : {};
        this.failed = r.code !== 0;
        const next = new Map();
        for (const t of targets) next.set(t.terminal, shape(t, raw[t.terminal], side.get(t.terminal), t.status));
        this.map = next;
      } catch {
        this.failed = true;
      }
      this.busy = false;
      cx.notify();
    });
  }
}

// ---- formatting the card and rows share

export const DASH = "—";

/** 151000 -> "151K", 1200000 -> "1.2M". */
export function fmtTokens(n) {
  if (n == null) return DASH;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

/** 252000 ms -> "04m 12s"; hours as "2h 06m". */
export function longDuration(ms) {
  if (ms == null || ms < 0) return DASH;
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  const p = (n) => String(n).padStart(2, "0");
  return h ? `${h}h ${p(m % 60)}m` : `${p(m)}m ${p(s % 60)}s`;
}

export function ago(at) {
  if (!at) return DASH;
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
}
