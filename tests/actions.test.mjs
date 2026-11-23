import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, actionsFor, gate, valuesProblem, actionSteps, stepLine, modeOnScreen } from "../skin/mods/endfield/orders.js";

test("every typed action goes through hc send --if idle, never --force", () => {
  for (const [program, table] of Object.entries(ACTIONS)) {
    for (const [key, action] of Object.entries(table)) {
      const values = Object.fromEntries((action.fields ?? []).map((f) => [f.key, f.list?.[0] ?? "x"]));
      for (const step of actionSteps(action, { target: "t3", tab: "tb1", values, alsoSession: true })) {
        if (!step.hc) continue;
        assert.ok(!step.hc.includes("--force"), `${program}.${key} forces`);
        if (step.hc[0] === "send") assert.deepEqual(step.hc.slice(0, 5), ["send", "t3", "--if", "idle", "--"], `${program}.${key} is not gated on idle`);
        else assert.equal(step.hc[0], "keys", `${program}.${key} runs hc ${step.hc[0]}`);
      }
    }
  }
});

test("model and effort type the exact slash command; a bare picker is never sent", () => {
  const [model] = actionSteps(ACTIONS.claude.model, { target: "t3", values: { model: "opus" } });
  assert.deepEqual(model.hc, ["send", "t3", "--if", "idle", "--", "/model opus"]);
  assert.equal(valuesProblem(ACTIONS.claude.model, { model: "" }), "Model is empty.");
  assert.ok(valuesProblem(ACTIONS.claude.effort, { level: "turbo" }));
  assert.equal(valuesProblem(ACTIONS.claude.effort, { level: "xhigh" }), null);
  const [codex] = actionSteps(ACTIONS.codex.model, { target: "t3", values: { model: "gpt-5-codex", level: "high" } });
  assert.equal(codex.hc.at(-1), "/model gpt-5-codex --reasoning=high");
  assert.ok(valuesProblem(ACTIONS.codex.model, { model: "gpt 5", level: "high" }), "a model with a space would be read as two arguments");
});

test("rename is Herdr's tab.rename, and types /rename only when asked", () => {
  const only = actionSteps(ACTIONS.claude.rename, { target: "t3", tab: "tb1", values: { name: " fix login " } });
  assert.deepEqual(only, [{ herdr: "tab.rename", args: { id: "tb1", name: "fix login" } }]);
  const both = actionSteps(ACTIONS.claude.rename, { target: "t3", tab: "tb1", values: { name: "fix login" }, alsoSession: true });
  assert.deepEqual(both[1].hc, ["send", "t3", "--if", "idle", "--", "/rename fix login"]);
  assert.ok(valuesProblem(ACTIONS.claude.rename, { name: "a\nb" }), "a newline would submit half a name");
  assert.ok(valuesProblem(ACTIONS.claude.rename, { name: "   " }), "bare /rename makes up a name");
});

test("a name with quotes or a leading dash is one argument after --", () => {
  const [, send] = actionSteps(ACTIONS.claude.rename, { target: "t3", tab: "tb1", values: { name: `-it's "done"` }, alsoSession: true });
  assert.deepEqual(send.hc.slice(-2), ["--", `/rename -it's "done"`]);
  assert.equal(stepLine(send, "linux"), `hc send t3 --if idle -- '/rename -it'\\''s "done"'`);
});

test("only an idle agent takes typed actions; done says to look first", () => {
  assert.equal(gate("idle"), null);
  assert.match(gate("done"), /Peek or Focus/);
  assert.ok(gate("working"));
  assert.ok(gate("blocked"));
});

test("the card's actions per program", () => {
  assert.deepEqual(actionsFor("claude").map((a) => a.key), ["rename", "plan", "mode", "model", "effort", "archive"]);
  assert.deepEqual(actionsFor("codex").map((a) => a.key), ["rename", "model", "archive"]);
  assert.deepEqual(actionsFor("cursor").map((a) => a.key), ["rename", "plan", "archive"]);
  assert.deepEqual(actionsFor("nvim"), []);
});

test("the mode is read from Claude Code's own line under the prompt", () => {
  const screen = "❯\n────\n  // repo · Opus 5.5 High · ctx 6%\n  ⏸ plan mode on (shift+tab to cycle) · ← 1 agent\n";
  assert.equal(modeOnScreen(screen), "plan");
  assert.equal(modeOnScreen("  ⏵⏵ accept edits on (shift+tab to cycle)"), "acceptEdits");
  assert.equal(modeOnScreen("  ⏸ manual mode on · ← 1 agent"), "default");
  assert.equal(modeOnScreen("hello"), null);
});
