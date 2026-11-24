import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

// The real tool in a throwaway Herdr home: it finds its data folder from where it sits.
// On macOS this would write to the login Keychain, so it runs on Windows (DPAPI) and Linux (file) only.
const TOOL = new URL("../skin/mods/endfield/tools/account.mjs", import.meta.url);
const TOKEN = "sk-ant-oat01-TESTTESTTESTTESTTEST_abc";

test("an account's token reaches the program it runs, and nowhere else", { skip: process.platform === "darwin" }, () => {
  const home = mkdtempSync(join(tmpdir(), "endfield-account-"));
  try {
    const tool = join(home, "mods", "endfield", "tools", "account.mjs");
    mkdirSync(join(home, "mods", "endfield", "tools"), { recursive: true });
    copyFileSync(TOOL, tool);
    const node = (args, opts = {}) => spawnSync(process.execPath, [tool, ...args], { encoding: "utf8", ...opts });

    // Started from PowerShell 7 (GitHub's Windows runners are), PSModulePath names modules Windows
    // PowerShell 5.1 can't load. A stand-in for 7's Microsoft.PowerShell.Security does the same here.
    const ps7 = join(home, "ps7");
    mkdirSync(join(ps7, "Microsoft.PowerShell.Security"), { recursive: true });
    writeFileSync(join(ps7, "Microsoft.PowerShell.Security", "Microsoft.PowerShell.Security.psd1"),
      "@{ ModuleVersion = '7.0.0.0'; PowerShellVersion = '7.0'; CompatiblePSEditions = @('Core'); RootModule = 'Microsoft.PowerShell.Security.dll'; CmdletsToExport = @('ConvertTo-SecureString', 'ConvertFrom-SecureString') }\n");
    const added = node([], { input: `a\nwork\n${TOKEN}\na\nbad name\n${TOKEN}\nq\n`, env: { ...process.env, PSModulePath: ps7 } });
    assert.equal(node(["list"]).stdout.trim().includes(TOKEN), false, "list prints a token");
    assert.deepEqual(JSON.parse(node(["list"]).stdout).map((a) => a.name), ["work"], `the menu said:\n${added.stdout}${added.stderr}`);
    if (process.platform === "win32") assert.equal(readFileSync(join(home, "data", "endfield", "accounts.json"), "utf8").includes(TOKEN), false, "token stored in the clear on Windows");

    const env = { ...process.env, ANTHROPIC_API_KEY: "sk-ant-api-should-go" };
    const r = node(["run", "work", "--", process.execPath, "-e", "console.log(JSON.stringify([process.env.CLAUDE_CODE_OAUTH_TOKEN, process.env.ENDFIELD_ACCOUNT, process.env.ANTHROPIC_API_KEY ?? null]))"], { env });
    assert.deepEqual(JSON.parse(r.stdout), [TOKEN, "work", null]);

    const missing = node(["run", "nope", "--", process.execPath, "-e", "1"]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /No account named nope/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("run with no name uses the default account, and leaves an outer run's choice alone", { skip: process.platform === "darwin" }, () => {
  const home = mkdtempSync(join(tmpdir(), "endfield-account-"));
  try {
    const tool = join(home, "mods", "endfield", "tools", "account.mjs");
    mkdirSync(join(home, "mods", "endfield", "tools"), { recursive: true });
    copyFileSync(TOOL, tool);
    const node = (args, opts = {}) => spawnSync(process.execPath, [tool, ...args], { encoding: "utf8", ...opts });
    const env = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: "", ENDFIELD_ACCOUNT: "" };
    const who = (extra = {}) => JSON.parse(node(["run", "--", process.execPath, "-e", "console.log(JSON.stringify([process.env.CLAUDE_CODE_OAUTH_TOKEN || null, process.env.ENDFIELD_ACCOUNT || null]))"], { env: { ...env, ...extra } }).stdout);

    const added = node([], { input: `a\nwork\n${TOKEN}\nq\n` });
    assert.deepEqual(who(), [null, null], "no default: the normal login");

    const picked = node([], { input: "d\nwork\nq\n" });
    assert.deepEqual(JSON.parse(node(["list"]).stdout).map((a) => [a.name, a.default]), [["work", true]], `the menu said:\n${added.stdout}${picked.stdout}${added.stderr}`);
    assert.deepEqual(who(), [TOKEN, "work"]);
    assert.deepEqual(who({ ENDFIELD_ACCOUNT: "outer", CLAUDE_CODE_OAUTH_TOKEN: "outer-token" }), ["outer-token", "outer"], "an outer run's account is kept");

    node([], { input: "r\nwork\nq\n" });
    node([], { input: `a\nwork\n${TOKEN}\nq\n` });
    assert.deepEqual(who(), [null, null], "removing the default account clears the default");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
