import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { sendArgs, runArgs, taskProblem, psQuote, shQuote, commandLine, deliver, timeoutFor, accountArgv, switchArgv } from "../skin/mods/endfield/orders.js";

test("a send whose log write fails is still sent, and hc runs once", async () => {
  let runs = 0;
  const r = await deliver({ args: ["send", "t3", "--", "hi"], exec: async () => { runs++; return { code: 0, stdout: "", stderr: "" }; }, log: async () => { throw new Error("stale snapshot"); } });
  assert.equal(r.phase, "sent");
  assert.equal(r.logged, false);
  assert.equal(runs, 1);
});

test("a refusal types nothing and may be retried; an unknown failure may not", async () => {
  const ran = (code) => deliver({ args: [], exec: async () => ({ code, stdout: "", stderr: '{"error":{"kind":"x","message":"nope"}}' }), log: async () => {} });
  assert.deepEqual(await ran(10), { phase: "refused", error: "nope" });
  assert.equal((await ran(1)).phase, "uncertain");
  assert.equal((await deliver({ args: [], exec: async () => { throw new Error("timed out"); }, log: async () => {} })).phase, "uncertain");
});

test("send text that looks like an option stays text", () => {
  assert.deepEqual(sendArgs({ target: "t3", delivery: "now", task: "--force" }), ["send", "t3", "--", "--force"]);
  assert.deepEqual(sendArgs({ target: "t3", delivery: "idle", task: "-h" }), ["send", "t3", "--if", "idle", "--", "-h"]);
  assert.deepEqual(sendArgs({ target: "t3", delivery: "wait", task: "go" }), ["send", "t3", "--wait", "--", "go"]);
});

test("hc run keeps --json and puts the program after --", () => {
  const a = runArgs({ parent: "t1", outlive: true, machine: null, folder: "/w", space: "local/sp1", tab: "tb1", argv: ["claude"], task: "fix it" });
  assert.deepEqual(a, ["run", "--bg", "--keep", "--json", "--parent", "t1", "--outlive-parent", "--cwd", "/w", "--label", "herdr.space=sp1", "--label", "herdr.tab=tb1", "--", "claude", "fix it"]);
  assert.match(commandLine(a, "linux"), /--json/);
});

test("an agent task starting with - is refused before it reaches the program", () => {
  assert.ok(taskProblem({ mode: "new", shell: false, task: "--dangerously-skip-permissions" }));
  assert.equal(taskProblem({ mode: "new", shell: true, task: "-c ls" }), null);
  assert.equal(taskProblem({ mode: "send", shell: false, task: "-h" }), null);
});

test("held sends get longer than exec's 30s default", () => {
  assert.ok(timeoutFor({ mode: "send", delivery: "now" }) > 60000);
  assert.ok(timeoutFor({ mode: "send", delivery: "wait" }) >= 180000);
});

const TRICKY = ["plain", "two words", "it's", 'say "hi"', "$(calc) `whoami`", "end\\", "two words\\", 'x\\"y', "", "a,b", "@splat", "--", "--force", "50% off", "tab\there"];

const has = (cmd) => { try { execFileSync(cmd, ["-c", "exit 0"], { stdio: "ignore" }); return true; } catch { return false; } };

test("shell quoting gives back each argument exactly (sh)", { skip: !has("sh") && "no sh here" }, () => {
  for (const s of TRICKY) {
    const out = execFileSync("sh", ["-c", `printf '%s\\0' ${shQuote(s)}`], { encoding: "utf8" });
    assert.equal(out, `${s}\0`, `sh round trip of ${JSON.stringify(s)}`);
  }
});

test("PowerShell 5.1 quoting gives back each argument exactly", { skip: process.platform !== "win32" && "Windows PowerShell only" }, () => {
  const line = `& '${process.execPath}' -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' ${TRICKY.map(psQuote).join(" ")}`;
  const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", line], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(out), TRICKY);
});

test("a launch command that programs.json already wraps in the account tool is wrapped once, not twice", () => {
  const tool = "/h/mods/endfield/tools/account.mjs";
  const fromPrograms = ["node", "/h/.config/herdr-app/mods/endfield/tools/account.mjs", "run", "--", "claude"];
  assert.deepEqual(accountArgv({ tool, account: null, argv: fromPrograms }), ["node", tool, "run", "--", "claude"]);
  assert.deepEqual(accountArgv({ tool, account: "work", argv: ["claude"] }), ["node", tool, "run", "work", "--", "claude"]);
  assert.deepEqual(switchArgv({ tool, terminal: "t4", account: "work", sessionId: "s1", now: false, argv: fromPrograms }),
    ["node", tool, "switch", "t4", "work", "--session", "s1", "--", "claude"]);
});
