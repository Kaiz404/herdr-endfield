// Reads Claude Code transcripts for the endfield mods, which can't: readTextFile stops at
// 1 MiB and transcripts run to tens of MB. Run as `node probe.mjs <request.json>`; prints JSON.
//
//   {cmd: "sessions", cache, targets: [{terminal, cwd, transcript?}]}
//     -> {sessions: {terminal: Parsed}}
//   {cmd: "render", path, from}  -> {to, size, entries: [{kind, text, tool?, arg?}]}
//
// Each transcript is folded once: the fold (a small summary) and the byte offset it reached
// are kept in `cache`, so a poll reads only the lines appended since.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECTS = path.join(os.homedir(), ".claude", "projects");
const CHUNK = 4 << 20;
// Lines Claude Code writes that never matter here, and can be megabytes each.
const SKIP = /"type":"(api-request|api-request-blob|data-flow-records|file-history-snapshot|queue-operation|attachment)"/;

const slug = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, "-");

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
  if (SKIP.test(line.slice(0, 400))) return null;
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
    last: null, final: false, pending: null, firstAt: null, lastAt: null };
}

// Folds one transcript line into the summary. Claude Code writes an assistant message as one
// line per content block, each repeating the message's usage, so usage counts once per id.
function fold(f, j) {
  const at = j.timestamp ? Date.parse(j.timestamp) : null;
  if (at) { f.firstAt ??= at; f.lastAt = at; }
  if (j.permissionMode) f.mode = j.permissionMode;
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
        f.pending = { id: c.id, tool: c.name, arg: f.last.arg, question: q };
        f.final = false;
      } else if (c.type === "text" && c.text?.trim()) {
        f.final = true;
      }
    }
  } else if (j.type === "user" && j.message) {
    const content = j.message.content;
    const results = Array.isArray(content) ? content.filter((c) => c.type === "tool_result") : [];
    if (results.some((r) => r.tool_use_id === f.pending?.id)) f.pending = null;
    const text = textOf(content).trim();
    if (!results.length && !j.isMeta && text && !text.startsWith("<")) {
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
  if (!c || s.size < c.to) c = cache[p] = { to: 0, fold: fresh() };
  if (s.size > c.to) for (const { line, to } of lines(p, c.to, s.size)) {
    const j = parse(line);
    if (j) fold(c.fold, j);
    c.to = to;
  }
  c.mtime = s.mtime;
  c.size = s.size;
  return { ...c.fold, mtime: s.mtime };
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
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

function sessions(req) {
  const cache = readJson(req.cache) ?? {};
  const out = {};
  for (const t of req.targets) {
    let transcript = t.transcript, approx = false;
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
    out[t.terminal] = { transcript, approx, sessionId: path.basename(transcript, ".jsonl"), ...main, subagents: subagents(cache, transcript) };
  }
  // Atomic replace: several mod copies may probe at once; the loser's work is only redone later.
  const tmp = `${req.cache}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(cache)); fs.renameSync(tmp, req.cache); } catch { try { fs.unlinkSync(tmp); } catch {} }
  return { sessions: out };
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
