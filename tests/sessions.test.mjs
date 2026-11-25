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
