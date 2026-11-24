import { test } from "node:test";
import assert from "node:assert/strict";
import { relayOrder, relayMessage, relayRefusal, deliverPlan, deliver } from "../skin/mods/endfield/orders.js";

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
  for (const [o, why] of [[{ status: "working" }, /Generating/], [{ status: "blocked" }, /Needs input/], [{ status: null }, /Not running/], [{ parent: null }, /parent/]]) {
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

test("deliverPlan: one rule for Dispatch and the relay, per status and Only if idle", () => {
  const cases = [
    ["idle", true, "idle"], ["idle", false, "now"],
    ["done", true, "now"], ["done", false, "now"],
    ["working", true, null], ["working", false, "now"],
    ["error", true, null], ["error", false, "now"],
    ["blocked", true, null], ["blocked", false, null],
    [null, true, null], [null, false, null], ["gone", false, null],
  ];
  for (const [status, only, gate] of cases) {
    const p = deliverPlan(status, only);
    assert.equal(p.gate, gate, `${status} only=${only}`);
    assert.equal(p.enabled, gate !== null);
    assert.ok(gate ? p.preview && !p.reason : p.reason && !p.preview, `${status} only=${only} says one thing`);
  }
});

test("Only if idle to a finished agent does not promise what --if idle would refuse (#22)", () => {
  const p = deliverPlan("done", true);
  assert.notEqual(p.gate, "idle");
  assert.doesNotMatch(p.preview, /^Idle/);
  assert.match(p.preview, /Finished/);
  assert.equal(deliverPlan("idle", true).preview, "Idle. Delivered now.");
});

test("the relay's gating is deliverPlan(status, true)", () => {
  for (const status of ["idle", "done", "working", "error", "blocked", null]) {
    const plan = deliverPlan(status, true);
    const r = order({ status });
    assert.equal(Boolean(r.args), plan.enabled, String(status));
    if (r.args) assert.equal(r.args.includes("--if"), plan.gate === "idle");
    else assert.ok(r.problem.endsWith(plan.reason));
  }
});

const shownAs = (status, o = {}) => ({ ...order({ status, ...o }), status });

test("Send runs only the command that was shown: a parent that moved since is refused with the reason", () => {
  assert.equal(relayRefusal({ phase: "edit", shown: shownAs("idle"), now: shownAs("idle") }), null);
  assert.equal(relayRefusal({ phase: "refused", shown: shownAs("done"), now: shownAs("done") }), null);
  assert.match(relayRefusal({ phase: "edit", shown: shownAs("idle"), now: shownAs("done") }), /idle to done/);
  assert.match(relayRefusal({ phase: "edit", shown: shownAs("done"), now: shownAs("working") }), /done to working/);
  assert.match(relayRefusal({ phase: "edit", shown: shownAs("idle"), now: shownAs(null) }), /not running/);
  assert.match(relayRefusal({ phase: "edit", shown: shownAs("idle", { text: "a" }), now: shownAs("idle", { text: "b" }) }), /command changed/);
});

test("a click with nothing to run, or after an uncertain send, says why instead of doing nothing", () => {
  assert.match(relayRefusal({ phase: "edit", shown: shownAs("working"), now: shownAs("idle") }), /^Not sent\. Its parent: Generating/);
  assert.match(relayRefusal({ phase: "uncertain", shown: shownAs("idle"), now: shownAs("idle") }), /may have arrived/);
  assert.match(relayRefusal({ phase: "busy", shown: shownAs("idle"), now: shownAs("idle") }), /Still sending/);
});
