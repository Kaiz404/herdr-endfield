// sessions: what a Claude Code session behind an agent terminal is doing, one parsed shape
// per terminal. Sources, first wins:
//   1. a sidecar a Claude Code statusline writes: data/endfield/sessions/<session_id>.json
//      {session_id, terminal, cwd, transcript_path, model:{id, display_name}, effort, context:{used, total, pct}, rate_limits, account, updated_at}
//      The statusline runs again right after /model or /effort; the transcript shows them only at the next turn.
//   2. the transcript itself, ~/.claude/projects/<cwd slug>/<session>.jsonl, in the home of the agent's
//      machine (wslpath gives a WSL machine's as a \\wsl.localhost path; an SSH machine's can't be read,
//      so its agents get no session). Without a sidecar the terminal is matched to its folder's
//      most recently written transcript: approximate, since two sessions in one folder can't be
//      told apart (`approx`).
// Transcripts run to tens of MB and readTextFile stops at 1 MiB, so tools/probe.mjs (node)
// reads them, folding only the lines appended since its last run, and the sidecars too (it can
// skip stale ones by mtime, which a mod can't see). The squad list owns the one poller; the
// card, the HUD footer and the report read what it publishes.
//
// Session = {sessionId, terminal, cwd, transcriptPath, approx, model:{id, display, short} | null,
//   ctx:{used, total, pct} | null, tokens:{total, delta} | null, tools, turns, effort, mode,
//   toolCounts: {tool name: calls}, recent: [{at, tool, arg}] (its last 5 tool calls, oldest first),
//   lastAt, startedAt, question, live: boolean | null, tasks: Task[],
//   waiting (its turn ended with background work or a sub-agent still in flight), subagents: Sub[]}
// Sub = {id, path, title, type (its Claude Code agent type, "pstack:poteto-agent", or null), model, effort, ctx, status: working | waiting | done | idle (fleet.js runStatus),
//   tools, turns, toolCounts, recent, lastAt, startedAt, tasks: Task[]}, in no order (fleet.js subagentView orders them)
// Task = background work a transcript started: {id, kind: shell | agent | monitor, description, startedAt,
//   expiresAt (a monitor's timeout, else null), endedAt,
//   state: running | completed | failed | killed | stopped | timed-out | ended-with-session}

import * as fs from "fs/promises";
import { exec, appHome, watchFolder, checking } from "herdr";
import { DASH, contextWindow, runStatus, inFlight, pollPace } from "./fleet.js";
import { machineOf } from "./dock.js";

const DATA = () => `${appHome()}/data/endfield`;
const SIDECARS = () => `${DATA()}/sessions`;
const PROBE = () => `${appHome()}/mods/endfield/tools/probe.mjs`;
const POLL_MS = 3000;
const SLOW_EVERY = 5;

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
    type: s.agentType ?? null,
    model: s.model ? modelName(s.model) : null,
    effort: s.effort ?? null,
    ctx: s.used ? contextOf(s.model, s.used) : null,
    status: runStatus({ ...s, live: raw.live, now }, parentStatus),
    tools: s.tools ?? null,
    turns: s.turns ?? null,
    toolCounts: s.counts ?? {},
    recent: s.recent ?? [],
    lastAt: s.mtime,
    startedAt: s.firstAt ?? null,
    tasks: s.tasks ?? [],
  }));
  // A sub-agent in flight holds its session up as a running task does, whatever the session was last told of it.
  const held = [...(raw?.tasks ?? []), ...subs.filter((k) => inFlight(k.status)).map(() => ({ state: "running" }))];
  return {
    sessionId: sidecar?.session_id ?? raw?.sessionId ?? null,
    terminal: t.terminal,
    cwd: sidecar?.cwd ?? t.cwd,
    transcriptPath: sidecar?.transcript_path ?? raw?.transcript ?? null,
    approx: !sidecar && Boolean(raw?.approx),
    // The login it runs on (tools/account.mjs): a name, "" for the default login, null with no sidecar to say.
    account: sidecar ? sidecar.account ?? "" : null,
    model,
    ctx,
    tokens: raw ? { total: raw.tokens, delta: raw.delta } : null,
    tools: raw?.tools ?? null,
    turns: raw?.turns ?? null,
    effort: sidecar?.effort ?? raw?.effort ?? null,
    mode: raw?.mode ?? null,
    toolCounts: raw?.counts ?? {},
    recent: raw?.recent ?? [],
    lastAt: raw?.lastAt ?? null,
    startedAt: raw?.firstAt ?? null,
    question: raw?.pending ? raw.pending.question ?? `Allow ${raw.pending.tool}${raw.pending.arg ? ` (${raw.pending.arg})` : ""}?` : null,
    live: raw?.live ?? null,
    tasks: raw?.tasks ?? [],
    waiting: Boolean(raw) && runStatus({ ...raw, tasks: held, now }, parentStatus) === "waiting",
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
    // Claude usage limits, the newest any sidecar carries, and the newest per account (probe.mjs).
    this.limits = null;
    this.accountLimits = {};
    this.dirty = true;
    this.busy = false;
    this.key = "";
    // Folder -> its pending watch; the folders are the ones the last probe said its answer reads.
    this.watches = new Map();
    // Folders whose watch was refused: polled every SLOW_EVERY ticks instead, and watched again then.
    // A project folder that doesn't exist yet (no session has run there) is polled the same way.
    this.blind = new Set();
    this.missing = false;
    // Machine -> its home as a path this computer reads, or null when it has none (not WSL).
    // Absent until asked; a machine that couldn't be asked is asked again at a later poll.
    this.homes = new Map();
    this.asking = new Set();
    this.ticks = 0;
    this.failed = false;
  }

  get(terminal) { return this.map.get(terminal) ?? null; }

  /**
   * Polls at most every 3s, and only when something changed: a watched transcript or sidecar
   * folder was written, the targets changed, a working sub-agent may have gone quiet, or, every
   * SLOW_EVERY ticks, a wait may have ended unseen (fleet.js pollPace) or a folder can't be watched.
   */
  start(cx, targets) {
    if (checking()) return;
    sweepCardRequests();
    cx.timer.every(POLL_MS, (cx) => {
      const ts = targets();
      const key = JSON.stringify(ts);
      const slowTurn = ++this.ticks % SLOW_EVERY === 0;
      const pace = pollPace([...this.map.values()]);
      const aging = pace === "fast" || (pace === "slow" && slowTurn);
      const blindTurn = (this.blind.size > 0 || this.missing) && slowTurn;
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

  /** Asks `machine` for its home once, beside the polls, so a slow machine never holds up local agents. */
  ask(cx, machine) {
    if (this.homes.has(machine) || this.asking.has(machine)) return;
    this.asking.add(machine);
    cx.spawn(async () => {
      try {
        const r = await exec("hc", ["exec", "--on", machine, 'wslpath -w "$HOME"'], { timeout: 10000 });
        // 127: the machine's shell has no wslpath, so it isn't WSL. Any other failure (hc couldn't
        // reach it) is asked again at the next poll, which this doesn't bring forward.
        const home = r.code === 0 && r.stdout.trim() ? r.stdout.trim() : r.code === 127 ? null : undefined;
        if (home !== undefined) { this.homes.set(machine, home); this.dirty = true; }
      } catch {}
      this.asking.delete(machine);
    });
  }

  stop() {
    this.stopped = true;
    for (const w of this.watches.values()) w.cancel();
    this.watches.clear();
  }

  poll(cx, targets, key) {
    if (this.busy || !targets.length) { if (!targets.length) { this.map.clear(); this.limits = null; this.accountLimits = {}; this.follow(cx, []); } return; }
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
          // An agent on a machine whose home this computer can't read is left out: its cwd would
          // otherwise be matched against this computer's projects folder.
          targets: targets.flatMap((t) => {
            const machine = machineOf(t.terminal);
            if (!machine) return [{ terminal: t.terminal, cwd: t.cwd }];
            this.ask(cx, machine);
            const home = this.homes.get(machine);
            return home ? [{ terminal: t.terminal, cwd: t.cwd, home }] : [];
          }),
        }));
        const r = await exec("node", [PROBE(), req], { timeout: 20000 });
        const out = r.code === 0 ? JSON.parse(r.stdout) : {};
        this.failed = r.code !== 0;
        const next = new Map();
        for (const t of targets) next.set(t.terminal, shape(t, out.sessions?.[t.terminal], t.status));
        this.map = next;
        this.limits = out.limits ?? null;
        this.accountLimits = out.accountLimits ?? {};
        this.email = out.email ?? null;
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

// ---- formatting for the card

export function ago(at) {
  if (!at) return DASH;
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
}
