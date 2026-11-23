// Reads Claude Code transcripts for the endfield mods, which can't: readTextFile stops at
// 1 MiB and transcripts run to tens of MB. Run as `node probe.mjs <request.json>`; prints JSON.
//
//   {cmd: "sessions", cache, sidecars, registry?, targets: [{terminal, cwd}]}
//     -> {sessions: {terminal: Parsed & {sidecar, live, subagents: Parsed[]}}, watch: [the folders whose writes
//         change this answer], missing: [project folders that don't exist yet, so can't be watched]}
//     Parsed carries `final` (the turn has ended: a last message, a handback or an interrupt), `pending`
//     (a tool call with no result yet; `wait` when it only waits) and `tasks`, the background work the
//     transcript started: [{id, kind: shell | agent | monitor, description, startedAt, endedAt,
//     state: running | completed | failed | killed | stopped | ended-with-session}].
//     live: whether a Claude Code process still runs the session, from `registry` (default
//     ~/.claude/sessions/<pid>.json); null when there is no registry to ask.
//   {cmd: "render", path, from}  -> {to, size, entries: [{kind, text, tool?, arg?}]}
//
// Each transcript is folded once: the fold (a small summary) and the byte offset it reached
// are kept in `cache`, so a poll reads only the lines appended since. Entries whose file is gone,
// or that no request touched for a week, are dropped. Sidecars a statusline wrote more than a day
// ago are not read.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECTS = path.join(os.homedir(), ".claude", "projects");
const REGISTRY = path.join(os.homedir(), ".claude", "sessions");
const CHUNK = 4 << 20;
const DAY = 86400000;
const CACHE_DAYS = 7;
// Lines Claude Code writes that never matter here, and can be megabytes each.
const SKIP = /"type":"(api-request|api-request-blob|data-flow-records|file-history-snapshot)"/;
// These matter only when they carry a background task's end.
const QUEUED = /"type":"(queue-operation|attachment)"/;
const NOTICE = "<task-notification>";
// A fold made by an older probe lacks fields this one reads, so it is folded again.
const FOLD = 2;
const TASKS_KEPT = 200;

const slug = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, "-");

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function stat(p) {
  try { const s = fs.statSync(p); return { size: s.size, mtime: s.mtimeMs }; } catch { return null; }
}

/** Complete lines from `from` to `size`; `to` is the offset after the chunk's last newline. */
function* lines(p, from, size) {
  const fd = fs.openSync(p, "r");
  try {
    let pos = from, rest = "";
    while (pos < size) {
      const n = Math.min(CHUNK, size - pos);
      const buf = Buffer.alloc(n);
      fs.readSync(fd, buf, 0, n, pos);
      pos += n;
      const text = rest + buf.toString("utf8");
      const cut = text.lastIndexOf("\n");
      if (cut < 0) { rest = text; continue; }
      rest = text.slice(cut + 1);
      const consumed = pos - Buffer.byteLength(rest, "utf8");
      for (const line of text.slice(0, cut).split("\n")) if (line) yield { line, to: consumed };
    }
  } finally { fs.closeSync(fd); }
}

function parse(line) {
  const head = line.slice(0, 400);
  if (SKIP.test(head) || (QUEUED.test(head) && !line.includes(NOTICE))) return null;
  try { return JSON.parse(line); } catch { return null; }
}

const textOf = (content) => typeof content === "string" ? content
  : Array.isArray(content) ? content.filter((c) => c.type === "text").map((c) => c.text).join("\n") : "";

/** One line of what a tool was asked to do: its file, command, pattern or description. */
function argOf(name, input = {}) {
  const v = input.file_path ?? input.path ?? input.notebook_path ?? input.command ?? input.pattern ?? input.url ?? input.query
    ?? input.description ?? input.prompt ?? input.skill ?? "";
  const s = String(v).split("\n")[0].trim();
  const file = input.file_path ?? input.notebook_path;
  return file ? path.basename(String(file)) : s.length > 60 ? `${s.slice(0, 59)}…` : s;
}

function fresh() {
  return { msg: null, model: null, used: 0, tokens: 0, delta: 0, tools: 0, turns: 0, prompt: null, effort: null, mode: null,
    last: null, final: false, pending: null, firstAt: null, lastAt: null, uses: {}, tasks: {}, ends: {} };
}

// A tool call that only waits: a shell that sleeps, loops or reads a background task's output.
const WAITS = /^\s*(sleep|until|while)\b|[\\/]tasks[\\/][\w-]+\.output/;
const waits = (name, input = {}) => (name === "Bash" || name === "PowerShell") && WAITS.test(String(input.command ?? ""));

const ENDED = new Set(["completed", "failed", "killed", "stopped"]);

// A background task's end, as Claude Code tells the model: its id and status lead the block.
function notices(f, text, at) {
  for (const block of String(text ?? "").split(NOTICE).slice(1)) {
    const id = /<task-id>([^<]+)<\/task-id>/.exec(block)?.[1];
    const state = /<status>([^<]+)<\/status>/.exec(block)?.[1];
    if (id && ENDED.has(state)) f.ends[id] = { state, at };
  }
}

// A tool result's structured half says when it left work running: a shell sent to the background,
// an agent launched async, a monitor. TaskStop's says it ended one, and writes no notification;
// SendMessage's that it woke one.
function launched(f, r, use, at) {
  const kind = r.backgroundTaskId ? "shell" : r.isAsync && r.agentId ? "agent" : r.taskId && (r.timeoutMs !== undefined || r.persistent !== undefined) ? "monitor" : null;
  if (kind) {
    const id = r.backgroundTaskId ?? r.agentId ?? r.taskId;
    f.tasks[id] = { id, kind, description: r.description ?? use?.description ?? null, startedAt: use?.at ?? at };
    const ids = Object.keys(f.tasks);
    for (const old of ids.slice(0, Math.max(0, ids.length - TASKS_KEPT))) if (f.ends[old]) { delete f.tasks[old]; delete f.ends[old]; }
  } else if (r.task_id && String(r.message ?? "").startsWith("Successfully stopped")) {
    f.ends[r.task_id] = { state: "stopped", at };
  } else if (f.tasks[r.resumedAgentId]) {
    // SendMessage woke an agent that had ended: it runs again from here, under the same id.
    f.tasks[r.resumedAgentId].resumedAt = at;
  }
}

// Folds one transcript line into the summary. Claude Code writes an assistant message as one
// line per content block, each repeating the message's usage, so usage counts once per id.
function fold(f, j) {
  const at = j.timestamp ? Date.parse(j.timestamp) : null;
  if (at) { f.firstAt ??= at; f.lastAt = at; }
  if (j.permissionMode) f.mode = j.permissionMode;
  if (j.type === "queue-operation") return notices(f, j.content, at);
  if (j.type === "attachment") return j.attachment?.type === "queued_command" ? notices(f, j.attachment.prompt, at) : undefined;
  if (j.type === "assistant" && j.message) {
    const m = j.message;
    if (m.model && m.model !== "<synthetic>") f.model = m.model;
    if (j.effort) f.effort = j.effort;
    if (m.id !== f.msg && m.usage) {
      f.msg = m.id;
      const u = m.usage;
      f.used = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      f.delta = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0);
      f.tokens += f.delta;
    }
    for (const c of m.content ?? []) {
      if (c.type === "tool_use") {
        f.tools++;
        f.last = { tool: c.name, arg: argOf(c.name, c.input) };
        const q = c.name === "AskUserQuestion" ? c.input?.questions?.[0]?.question ?? null : null;
        f.uses[c.id] = { at, description: c.input?.description ?? (String(c.input?.command ?? "").split("\n")[0].trim().slice(0, 120) || null) };
        // A sub-agent ends its turn by handing its report back, not with a last message.
        const handback = c.name === "SubagentHandback";
        f.pending = handback ? null : { id: c.id, tool: c.name, arg: f.last.arg, question: q, wait: waits(c.name, c.input) };
        f.final = handback;
      } else if (c.type === "text" && c.text?.trim()) {
        f.final = true;
      }
    }
  } else if (j.type === "user" && j.message) {
    const content = j.message.content;
    const results = Array.isArray(content) ? content.filter((c) => c.type === "tool_result") : [];
    if (results.some((r) => r.tool_use_id === f.pending?.id)) f.pending = null;
    if (results.length && j.toolUseResult && typeof j.toolUseResult === "object") launched(f, j.toolUseResult, f.uses[results[0].tool_use_id], at);
    for (const r of results) delete f.uses[r.tool_use_id];
    const text = textOf(content).trim();
    if (text.startsWith(NOTICE) || text.startsWith("[SYSTEM NOTIFICATION")) notices(f, text, at);
    if (text.startsWith("[Request interrupted")) {
      f.final = true;
      f.pending = null;
    } else if (!results.length && !j.isMeta && text && !text.startsWith("<")) {
      f.turns++;
      f.prompt ??= text.slice(0, 400);
      f.final = false;
    }
  }
}

/** Brings one transcript's summary up to date, reading only what was appended. */
function summary(cache, p) {
  const s = stat(p);
  if (!s) return null;
  let c = cache[p];
  if (!c || s.size < c.to || c.v !== FOLD) c = cache[p] = { to: 0, v: FOLD, fold: fresh() };
  if (s.size > c.to) for (const { line, to } of lines(p, c.to, s.size)) {
    const j = parse(line);
    if (j) fold(c.fold, j);
    c.to = to;
  }
  c.mtime = s.mtime;
  c.size = s.size;
  c.used = Date.now();
  return { ...c.fold, mtime: s.mtime };
}

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
};

/** sessionId -> {since} for each session a running Claude Code process owns; null with no registry. */
function registry(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return null; }
  const live = new Map();
  for (const n of names) {
    const s = /^\d+\.json$/.test(n) ? readJson(path.join(dir, n)) : null;
    if (s?.sessionId && alive(s.pid)) live.set(s.sessionId, { since: s.startedAt ?? 0 });
  }
  return live;
}

// A task's end may be written to another transcript of its session than the one that started it
// (a sub-agent's monitor that outlives it reports to the main one), so `ends` is the session's.
// A task with no end is running only if the process that started it still is.
function settle(f, ends, owner) {
  const { uses, ends: _own, tasks, ...rest } = f;
  return { ...rest, tasks: Object.values(tasks).map((t) => {
    const from = t.resumedAt ?? t.startedAt;
    const end = ends[t.id]?.at >= from ? ends[t.id] : null;
    const gone = !owner || from < owner.since;
    return { ...t, endedAt: end?.at ?? null, state: end?.state ?? (gone ? "ended-with-session" : "running") };
  }) };
}

function subagents(cache, transcript) {
  const dir = path.join(transcript.replace(/\.jsonl$/, ""), "subagents");
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((n) => /^agent-.+\.jsonl$/.test(n)).map((n) => {
    const p = path.join(dir, n);
    const meta = readJson(p.replace(/\.jsonl$/, ".meta.json")) ?? {};
    return { id: n.slice(6, -6), path: p, description: meta.description ?? null, agentType: meta.agentType ?? null, ...summary(cache, p) };
  });
}

/** The newest sidecar per terminal, from those written in the last day. */
function sidecars(dir) {
  const byTerminal = new Map();
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith(".json")); } catch { return byTerminal; }
  const now = Date.now();
  for (const n of names) {
    const p = path.join(dir, n);
    if (now - (stat(p)?.mtime ?? 0) > DAY) continue;
    const s = readJson(p);
    if (!s?.terminal) continue;
    const had = byTerminal.get(s.terminal);
    if (!had || String(s.updated_at ?? "") > String(had.updated_at ?? "")) byTerminal.set(s.terminal, s);
  }
  return byTerminal;
}

function sessions(req) {
  const cache = readJson(req.cache) ?? {};
  const side = req.sidecars ? sidecars(req.sidecars) : new Map();
  const out = {};
  const watch = new Set(req.sidecars ? [req.sidecars] : []);
  const missing = new Set();
  const owners = registry(req.registry ?? REGISTRY);
  if (owners) watch.add(req.registry ?? REGISTRY);
  for (const t of req.targets) {
    const sidecar = side.get(t.terminal) ?? null;
    let transcript = sidecar?.transcript_path ?? null, approx = false;
    const project = t.cwd ? path.join(PROJECTS, slug(t.cwd)) : null;
    if (project) (stat(project) ? watch : missing).add(project);
    if (transcript) watch.add(path.dirname(transcript));
    if (!transcript && t.cwd) {
      // No sidecar names the session: take the project's most recently written transcript.
      const dir = path.join(PROJECTS, slug(t.cwd));
      let best = null;
      try {
        for (const n of fs.readdirSync(dir)) {
          if (!n.endsWith(".jsonl")) continue;
          const s = stat(path.join(dir, n));
          if (s && (!best || s.mtime > best.mtime)) best = { p: path.join(dir, n), mtime: s.mtime };
        }
      } catch {}
      transcript = best?.p;
      approx = true;
    }
    const main = transcript ? summary(cache, transcript) : null;
    if (!main) continue;
    const sessionId = path.basename(transcript, ".jsonl");
    const subs = subagents(cache, transcript);
    const ends = Object.assign({}, ...[main, ...subs].map((f) => f.ends));
    // No registry at all: nothing says the session died, so its open tasks still count as running.
    const owner = owners ? owners.get(sessionId) : { since: 0 };
    out[t.terminal] = { transcript, approx, sessionId, live: owners ? owners.has(sessionId) : null, ...settle(main, ends, owner),
      subagents: subs.map((s) => settle(s, ends, owner)), sidecar };
  }
  const now = Date.now();
  for (const [p, c] of Object.entries(cache)) if (now - (c.used ?? 0) > CACHE_DAYS * DAY || !stat(p)) delete cache[p];
  // Atomic replace: several mod copies may probe at once; the loser's work is only redone later.
  const tmp = `${req.cache}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(cache)); fs.renameSync(tmp, req.cache); } catch { try { fs.unlinkSync(tmp); } catch {} }
  return { sessions: out, watch: [...watch], missing: [...missing] };
}

// ---- render: a transcript as a tidy list for the transcript pane

function firstLine(content) {
  const s = (typeof content === "string" ? content : textOf(content)).trim().split("\n")[0] ?? "";
  return s.length > 140 ? `${s.slice(0, 139)}…` : s;
}

function render(req) {
  const s = stat(req.path);
  if (!s) return { to: 0, size: 0, entries: [], missing: true };
  const from = req.from > s.size ? 0 : req.from;
  const entries = [];
  let to = from;
  for (const { line, to: end } of lines(req.path, from, s.size)) {
    to = end;
    const j = parse(line);
    if (!j?.message || j.isMeta) continue;
    const content = j.message.content;
    if (j.type === "user") {
      if (Array.isArray(content) && content.some((c) => c.type === "tool_result")) {
        for (const r of content.filter((c) => c.type === "tool_result")) entries.push({ kind: "result", text: firstLine(r.content), error: Boolean(r.is_error) });
      } else {
        const text = textOf(content).trim();
        if (text && !text.startsWith("<")) entries.push({ kind: "user", text });
      }
    } else if (j.type === "assistant") {
      for (const c of content ?? []) {
        if (c.type === "text" && c.text?.trim()) entries.push({ kind: "text", text: c.text.trim() });
        else if (c.type === "tool_use") entries.push({ kind: "tool", tool: c.name, arg: argOf(c.name, c.input) });
      }
    }
  }
  return { to, size: s.size, entries };
}

const req = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write(JSON.stringify(req.cmd === "render" ? render(req) : sessions(req)));
