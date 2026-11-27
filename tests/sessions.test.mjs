import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";

register("./fixtures/herdr-loader.mjs", import.meta.url);
const { Sessions } = await import("../skin/mods/endfield/sessions.js");

let dir;
before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "endfield-sessions-")); });
after(() => fs.rmSync(dir, { recursive: true, force: true }));

// A Herdr view context that keeps the poll timer and awaits every spawned task.
function context() {
  const tasks = [];
  const cx = { timer: { every: (_ms, fn) => { cx.tick = () => fn(cx); } }, spawn: (fn) => { tasks.push(fn(cx)); }, notify() {} };
  cx.settle = async () => { while (tasks.length) await tasks.shift(); };
  return cx;
}

test("a machine that couldn't be asked stops being asked once its agents are gone", async (t) => {
  let probes = 0;
  globalThis.herdrStub = { home: dir, exec: async (command) => {
    if (command === "node") { probes++; return { code: 0, stdout: JSON.stringify({ sessions: {}, watch: [], missing: [] }) }; }
    return { code: 1, stdout: "" };
  } };
  let clock = Date.now();
  t.mock.method(Date, "now", () => clock);
  let targets = [{ terminal: "t1", cwd: "/a", status: "idle" }, { terminal: "box/t2", cwd: "/b", status: "idle" }];
  const s = new Sessions("test");
  const cx = context();
  s.start(cx, () => targets);
  await cx.settle();
  assert.equal(s.retry.has("box"), true, "the failed ask waits to be retried");
  targets = [targets[0]];
  cx.tick();
  await cx.settle();
  const before = probes;
  for (let i = 0; i < 10; i++) { clock += 60000; cx.tick(); await cx.settle(); }
  assert.equal(probes - before, 0, "nothing changed, and a retry for a machine with no agent left polls nothing");
});

test("a machine that couldn't be asked is asked again by the timer once its retry is due, and not before", async (t) => {
  let asks = 0;
  globalThis.herdrStub = { home: dir, exec: async (command) => {
    if (command === "node") return { code: 0, stdout: JSON.stringify({ sessions: {}, watch: [], missing: [] }) };
    asks++;
    return { code: 1, stdout: "" };
  } };
  let clock = Date.now();
  t.mock.method(Date, "now", () => clock);
  const targets = [{ terminal: "box/t2", cwd: "/b", status: "idle" }];
  const s = new Sessions("test-retry");
  const cx = context();
  s.start(cx, () => targets);
  await cx.settle();
  assert.equal(asks, 1);
  const due = s.retry.get("box").at;
  clock = due - 1000;
  cx.tick();
  await cx.settle();
  assert.equal(asks, 1, "not due yet: the tick asks nothing");
  clock = due;
  cx.tick();
  await cx.settle();
  assert.equal(asks, 2, "due: the tick polls and asks the machine again");
});

async function subCtx(raw) {
  globalThis.herdrStub = { home: dir, exec: async (command) => (command === "node"
    ? { code: 0, stdout: JSON.stringify({ sessions: { t1: raw }, watch: [], missing: [] }) }
    : { code: 1, stdout: "" }) };
  const s = new Sessions(`ctx-${Math.random().toString(36).slice(2)}`);
  const cx = context();
  s.start(cx, () => [{ terminal: "t1", cwd: "/a", status: "working" }]);
  await cx.settle();
  s.stop();
  return s.get("t1").subagents[0].ctx;
}

test("a sub-agent's context window is its session's, from the statusline, not the 200K guess", async () => {
  const ctx = await subCtx({ model: "claude-opus-5-5", used: 188766, sidecar: { context: { used: 188766, total: 1000000, pct: 19 } },
    subagents: [{ id: "a1", model: "claude-opus-5-5", used: 50000 }] });
  assert.deepEqual(ctx, { used: 50000, total: 1000000, pct: 5 });
});

test("with no statusline, a sub-agent takes its session's window once that session is known past 200K", async () => {
  const ctx = await subCtx({ model: "claude-opus-5-5", used: 300000, sidecar: null, subagents: [{ id: "a1", model: "claude-opus-5-5", used: 50000 }] });
  assert.equal(ctx.total, 1000000);
});
