// sessions: what a Claude Code session behind an agent terminal is doing, one parsed shape
// per terminal. Sources, first wins:
//   1. a sidecar a Claude Code statusline writes: data/endfield/sessions/<session_id>.json
//      {session_id, terminal, cwd, transcript_path, model:{id, display_name}, context:{used, total, pct}, rate_limits, updated_at}
//   2. the transcript itself, ~/.claude/projects/<cwd slug>/<session>.jsonl. Without a sidecar the
//      terminal is matched to its folder's most recently written transcript: approximate, since
//      two sessions in one folder can't be told apart (`approx`).
// Transcripts run to tens of MB and readTextFile stops at 1 MiB, so tools/probe.mjs (node)
// reads them, folding only the lines appended since its last run, and the sidecars too (it can
// skip stale ones by mtime, which a mod can't see). The squad list owns the one poller; the
// card, the HUD footer and the report read what it publishes.
//
// Session = {sessionId, terminal, cwd, transcriptPath, approx, model:{id, display, short} | null,
//   ctx:{used, total, pct} | null, tokens:{total, delta} | null, tools, turns, effort, mode,
//   lastAction:{tool, arg} | null, lastAt, startedAt, question, subagents: Sub[]}
// Sub = {id, path, title, model, effort, ctx, tools, status: working | done | idle, lastAt, startedAt, lastAction},
//   in no order (fleet.js subagentView orders them)

import * as fs from "fs/promises";
import { exec, appHome, watchFolder, checking } from "herdr";
import { DASH, contextWindow } from "./fleet.js";

const DATA = () => `${appHome()}/data/endfield`;
const SIDECARS = () => `${DATA()}/sessions`;
const PROBE = () => `${appHome()}/mods/endfield/tools/probe.mjs`;
// A sub-agent counts as working while its transcript was written this recently.
const LIVE_MS = 20000;
const POLL_MS = 3000;
const BLIND_EVERY = 5;

export const isClaude = (a) => a?.program?.key === "claude" || a?.app === "claude-code";

/** "claude-opus-5-5" -> {display: "Claude Opus 5.5", short: "Opus 5.5"}; unknown ids pass through. */
function modelName(id, display = null) {
  const m = /(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?=$|[-[@])/i.exec(id ?? "");
  const short = m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ""}` : display ?? id ?? null;
  return { id, display: display ?? (m ? `Claude ${short}` : id), short };
}

// A sidecar's context (the statusline's own numbers) wins over the transcript's last usage.
function contextOf(id, used, side = null) {
  used = side?.used ?? used ?? null;
  if (used == null) return null;
  const total = side?.total ?? contextWindow(id, used);
  return { used, total, pct: side?.pct ?? Math.round((used / total) * 100) };
}

function shape(t, raw, parentStatus) {
  const sidecar = raw?.sidecar ?? null;
  const id = sidecar?.model?.id ?? raw?.model ?? null;
  const model = id ? modelName(id, sidecar?.model?.display_name ?? null) : null;
  const ctx = contextOf(id, raw?.used, sidecar?.context);
  const now = Date.now();
  const subs = (raw?.subagents ?? []).map((s) => ({
    id: s.id,
    path: s.path,
    title: s.description || (s.prompt ?? "").split("\n").find((l) => l.trim())?.trim() || `agent-${s.id}`,
    model: s.model ? modelName(s.model) : null,
    effort: s.effort ?? null,
    ctx: s.used ? contextOf(s.model, s.used) : null,
    tools: s.tools ?? 0,
    status: now - s.mtime < LIVE_MS && (s.pending || !s.final) ? "working" : parentStatus === "idle" ? "idle" : "done",
    lastAt: s.mtime,
    startedAt: s.firstAt ?? null,
    lastAction: s.last,
  }));
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

/**
 * One owner's view of the sessions (the squad list's). `name` keeps its probe request file its own.
 * Targets: [{terminal, cwd, status}] for Claude agents only.
 */
export class Sessions {
  constructor(name) {
    this.name = name;
    this.map = new Map();
    // The account's Claude usage limits, the newest any sidecar carries (probe.mjs).
    this.limits = null;
    this.dirty = true;
    this.busy = false;
    this.key = "";
    // Folder -> its pending watch; the folders are the ones the last probe said its answer reads.
    this.watches = new Map();
    // Folders whose watch was refused: polled every BLIND_EVERY ticks instead, and watched again then.
    // A project folder that doesn't exist yet (no session has run there) is polled the same way.
    this.blind = new Set();
    this.missing = false;
    this.ticks = 0;
    this.failed = false;
  }

  get(terminal) { return this.map.get(terminal) ?? null; }

  /**
   * Polls at most every 3s, and only when something changed: a watched transcript or sidecar
   * folder was written, the targets changed, a live sub-agent may have gone quiet, or a folder
   * can't be watched and its turn came.
   */
  start(cx, targets) {
    if (checking()) return;
    sweepCardRequests();
    cx.timer.every(POLL_MS, (cx) => {
      const ts = targets();
      const key = JSON.stringify(ts);
      const aging = [...this.map.values()].some((s) => s.subagents.some((k) => k.status === "working"));
      const blindTurn = (this.blind.size > 0 || this.missing) && ++this.ticks % BLIND_EVERY === 0;
      if (blindTurn) { const again = [...this.blind]; this.blind.clear(); for (const dir of again) this.watch(cx, dir); }
      if (!(this.dirty || aging || blindTurn || key !== this.key)) return;
      this.poll(cx, ts, key);
    });
    this.poll(cx, targets(), JSON.stringify(targets()));
  }

  /** Keeps one watch per folder in `dirs`, cancelling the rest. */
  follow(cx, dirs) {
    const want = new Set(dirs);
    for (const [dir, w] of this.watches) if (!want.has(dir)) { w.cancel(); this.watches.delete(dir); }
    for (const dir of want) if (!this.watches.has(dir) && !this.blind.has(dir)) this.watch(cx, dir);
  }

  watch(cx, dir) {
    cx.spawn(async () => {
      while (!this.stopped) {
        const w = watchFolder(dir);
        this.watches.set(dir, w);
        try { await w; } catch { this.watches.delete(dir); this.blind.add(dir); this.dirty = true; return; }
        if (this.watches.get(dir) !== w) return;
        this.dirty = true;
      }
    });
  }

  stop() {
    this.stopped = true;
    for (const w of this.watches.values()) w.cancel();
    this.watches.clear();
  }

  poll(cx, targets, key) {
    if (this.busy || !targets.length) { if (!targets.length) { this.map.clear(); this.limits = null; this.follow(cx, []); } return; }
    this.busy = true;
    this.dirty = false;
    this.key = key;
    cx.spawn(async (cx) => {
      try {
        const req = `${DATA()}/probe-${this.name}.json`;
        await fs.mkdir(DATA(), { recursive: true });
        await fs.writeFile(req, JSON.stringify({
          cmd: "sessions",
          cache: `${DATA()}/probe-cache.json`,
          sidecars: SIDECARS(),
          targets: targets.map((t) => ({ terminal: t.terminal, cwd: t.cwd })),
        }));
        const r = await exec("node", [PROBE(), req], { timeout: 20000 });
        const out = r.code === 0 ? JSON.parse(r.stdout) : {};
        this.failed = r.code !== 0;
        const next = new Map();
        for (const t of targets) next.set(t.terminal, shape(t, out.sessions?.[t.terminal], t.status));
        this.map = next;
        this.limits = out.limits ?? null;
        this.missing = (out.missing ?? []).length > 0;
        if (!this.stopped && out.watch) this.follow(cx, out.watch);
      } catch {
        this.failed = true;
      }
      this.busy = false;
      cx.notify();
    });
  }
}

// Earlier cards each ran a poller with a request file of their own (probe-card-o<N>.json); none
// does now, so the ones left behind go.
async function sweepCardRequests() {
  try {
    for (const n of await fs.readdir(DATA())) if (/^probe-card-.+\.json$/.test(n)) await fs.unlink(`${DATA()}/${n}`);
  } catch {}
}

// ---- formatting the card and rows share

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
