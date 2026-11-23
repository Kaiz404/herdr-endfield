import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relayOrder, relayMessage, deliver } from "../skin/mods/endfield/orders.js";

const mods = new URL("../skin/mods/", import.meta.url);
const text = (rel) => readFileSync(new URL(rel, mods), "utf8").replace(/\r\n/g, "\n");

test("the transcript pane's copies of orders.js and messages.js match the endfield mod's", () => {
  for (const f of ["orders.js", "messages.js"]) {
    assert.ok(text(`endfield-transcript/${f}`) === text(`endfield/${f}`), `copy skin/mods/endfield/${f} to skin/mods/endfield-transcript/${f}`);
  }
});

const order = (o) => relayOrder({ parent: "t3", status: "idle", id: "a1f0", title: "Review x.rs", text: "also check y.rs", ...o });

test("an idle parent gets the relay with --if idle, so a turn that started meanwhile types nothing", () => {
  const r = order({});
  assert.equal(r.problem, null);
  assert.deepEqual(r.args, ["send", "t3", "--if", "idle", "--", relayMessage({ id: "a1f0", title: "Review x.rs", text: "also check y.rs" })]);
});

test("a parent that finished its turn (done, which --if idle refuses) gets a plain send, never --force", () => {
  const r = order({ status: "done" });
  assert.equal(r.problem, null);
  assert.deepEqual(r.args.slice(0, 3), ["send", "t3", "--"]);
  assert.ok(!r.args.includes("--force"));
});

test("a working, blocked, gone or unknown parent is refused with a reason and no command", () => {
  for (const [o, why] of [[{ status: "working" }, /working/], [{ status: "blocked" }, /needs input/], [{ status: null }, /isn't running/], [{ parent: null }, /parent/]]) {
    const r = order(o);
    assert.equal(r.args, null);
    assert.match(r.problem, why);
  }
});

test("nothing to send is refused", () => {
  assert.equal(order({ text: "   " }).args, null);
});

test("the relay names the sub-agent for SendMessage and carries the text word for word, on one line", () => {
  const m = relayMessage({ id: "a1f0", title: "Review\nx.rs", text: "-h then\nstop" });
  assert.match(m, /SendMessage/);
  assert.match(m, /a1f0/);
  assert.ok(m.endsWith("-h then stop"));
  assert.ok(!m.includes("\n"));
  assert.equal(order({ text: "--force" }).args.at(-2), "--");
});

test("a parent that turned working between click and send is refused by hc (10) and may be retried", async () => {
  const r = await deliver({ args: order({}).args, exec: async () => ({ code: 10, stdout: "", stderr: '{"error":{"kind":"status_mismatch","message":"t3 is working"}}' }), log: async () => { throw new Error("must not log"); } });
  assert.deepEqual(r, { phase: "refused", error: "t3 is working" });
});
