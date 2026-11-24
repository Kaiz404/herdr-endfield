#!/usr/bin/env node
// account: Claude Code logins kept by name, so each agent can run on its own one.
//   node account.mjs                                   menu: list, add, remove, default
//   node account.mjs list                              the names and which is the default, as JSON (never a token)
//   node account.mjs run [<name>] -- <argv...>         runs argv with that account's token. With no name: the
//       default account; argv as it is when there is none, or when an outer run already chose one
//       (ENDFIELD_ACCOUNT is set), so Herdr's launcher can be this wrapper and Dispatch can still wrap it.
//   node account.mjs switch <terminal> <name> [--session <id>] [--now] -- <argv...>
//       In a new tab: waits for <terminal>'s turn to end (--now: presses Esc first), ends it, then
//       runs argv plus --resume <id> on <name> here. The old tab closes when its terminal ends.
// The token reaches Claude Code as CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token` makes one), with
// ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN removed, since Claude Code prefers those. Every account
// shares one Claude config folder, so a session started on one resumes on another.
// Where tokens live: Windows, encrypted with DPAPI (only this Windows user can read it); macOS, the
// login Keychain; elsewhere, data/endfield/accounts.json itself, readable only by you.
// data/endfield/accounts.json = {accounts: [{name, added, dpapi? | keychain? | token?}], default?: name}
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FILE = path.join(HOME, "data", "endfield", "accounts.json");
const SERVICE = "herdr-endfield";
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/;
const TOKEN = /^[A-Za-z0-9._~+/=-]{20,}$/;
const CONTINUE = "Continue where you stopped. This session moved to another Claude account.";

const die = (msg) => { console.error(msg); process.exit(1); };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
const load = () => read().accounts ?? [];
const defaultOf = () => { const f = read(); return (f.accounts ?? []).some((a) => a.name === f.default) ? f.default : null; };
function save(accounts, def = defaultOf()) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const kept = accounts.some((a) => a.name === def) ? def : undefined;
  fs.writeFileSync(FILE, `${JSON.stringify({ accounts, default: kept }, null, 1)}\n`, { mode: 0o600 });
  try { fs.chmodSync(FILE, 0o600); } catch {}
}

// The secret goes through stdin, never argv, so no process list shows it.
function ps(script, input) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { input, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`powershell: ${(r.stderr || r.error?.message || "failed").trim()}`);
  return r.stdout.trim();
}
function security(args, input) {
  const r = spawnSync("security", args, { input, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`security: ${(r.stderr || r.error?.message || "failed").trim()}`);
  return r.stdout.trim();
}

const STORE = {
  win32: {
    put: (name, token) => ({ dpapi: ps("$t = [Console]::In.ReadToEnd().Trim(); ConvertTo-SecureString $t -AsPlainText -Force | ConvertFrom-SecureString", token) }),
    get: (a) => ps("$s = [Console]::In.ReadToEnd().Trim() | ConvertTo-SecureString; [Net.NetworkCredential]::new('', $s).Password", a.dpapi),
    drop: () => {},
  },
  // `security -i` reads its command from stdin. Names and tokens are checked against NAME and TOKEN, so neither needs quoting.
  darwin: {
    put: (name, token) => { security(["-i"], `add-generic-password -U -s ${SERVICE} -a ${name} -w ${token}\n`); return { keychain: true }; },
    get: (a) => security(["find-generic-password", "-s", SERVICE, "-a", a.name, "-w"]),
    drop: (a) => { try { security(["delete-generic-password", "-s", SERVICE, "-a", a.name]); } catch {} },
  },
  other: {
    put: (_name, token) => ({ token }),
    get: (a) => a.token,
    drop: () => {},
  },
};
const store = STORE[process.platform] ?? STORE.other;

function tokenOf(name) {
  const a = load().find((x) => x.name === name);
  if (!a) die(`No account named ${name}. Run: node ${path.relative(process.cwd(), fileURLToPath(import.meta.url))}`);
  const t = store.get(a);
  if (!TOKEN.test(t ?? "")) die(`The token for ${name} could not be read. Remove the account and add it again.`);
  return t;
}

/** Runs argv on the account in this terminal, and exits with its code. */
function launch(name, argv) {
  if (!argv.length) die("Nothing to run: put the program after --.");
  name ??= process.env.ENDFIELD_ACCOUNT ? null : defaultOf();
  const env = name ? { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: tokenOf(name), ENDFIELD_ACCOUNT: name } : { ...process.env };
  if (name) { delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; }
  // Ctrl+C reaches every process in the terminal. It is Claude Code's to handle; this wrapper only waits.
  process.on("SIGINT", () => {});
  const child = spawn(argv[0], argv.slice(1), { stdio: "inherit", env });
  child.on("error", (e) => die(`Could not start ${argv[0]}: ${e.message}`));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

function hc(args) {
  const r = spawnSync("hc", [...args, "--json"], { encoding: "utf8" });
  try { return JSON.parse(r.stdout); } catch { return null; }
}
const stateOf = (t) => {
  const g = hc(["get", t]);
  return { live: g?.state === "live", status: g?.status?.state ?? null };
};

function switchTo(terminal, name, { session, now }, argv) {
  tokenOf(name); // fail here, before the old agent is touched
  const resume = [...argv, ...(session ? ["--resume", session] : ["--continue"])];
  let s = stateOf(terminal);
  let stopped = false;
  if (s.live && now && s.status === "working") {
    console.log(`Pressing Esc in ${terminal}. Finished tool calls stay in the session.`);
    spawnSync("hc", ["interrupt", terminal], { stdio: "ignore" });
    stopped = true;
  }
  let told = null;
  for (s = stateOf(terminal); s.live && (s.status === "working" || s.status === "blocked"); s = stateOf(terminal)) {
    const say = s.status === "blocked" ? `${terminal} needs input. Answer it there; the switch goes on once it is idle.` : `Waiting for ${terminal} to end its turn. Close this tab to cancel.`;
    if (say !== told) { console.log(say); told = say; }
    if (s.status === "working") spawnSync("hc", ["wait", terminal, "--timeout", "600"], { stdio: "ignore" });
    else sleep(2000);
  }
  // Idle at its prompt: every message is already in the transcript. hc send from here would arrive as a
  // tagged message, not as /exit, so the terminal is ended instead. Its tab closes with it.
  if (s.live) {
    console.log(`Ending ${terminal}.`);
    spawnSync("hc", ["kill", terminal], { stdio: "ignore" });
    for (let i = 0; i < 20 && stateOf(terminal).live; i++) sleep(500);
    if (stateOf(terminal).live) die(`${terminal} is still running, so the session was not resumed here (it would be open twice).`);
  }
  console.log(`Resuming on ${name}.`);
  launch(name, stopped ? [...resume, CONTINUE] : resume);
}

// Lines in order, so piped input works too. A hidden answer is not echoed: readline types through _writeToOutput.
function prompter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  const lines = rl[Symbol.asyncIterator]();
  const echo = rl._writeToOutput;
  return {
    async ask(q, hidden = false) {
      process.stdout.write(q);
      if (hidden) rl._writeToOutput = () => {};
      const { value, done } = await lines.next();
      rl._writeToOutput = echo;
      if (hidden) process.stdout.write("\n");
      return done ? null : value.trim();
    },
    close: () => rl.close(),
  };
}

async function menu() {
  const p = prompter();
  for (;;) {
    const accounts = load();
    const def = defaultOf();
    console.log(`\nClaude accounts for Herdr Endfield (${accounts.length})`);
    accounts.forEach((a, i) => console.log(`  ${i + 1}. ${a.name}${a.name === def ? "  (default)" : ""}`));
    if (!def) console.log("  No default: an agent started without a name runs on your normal Claude login.");
    const c = (await p.ask("\n[a] add  [r] remove  [d] default  [q] quit: "))?.toLowerCase() ?? "q";
    if (c === "q" || c === "") break;
    if (c === "a") {
      console.log("Make a token with `claude setup-token` while signed in to that account.");
      const name = (await p.ask("Name (letters, digits, - or _): ")) ?? "";
      if (!NAME.test(name)) { console.log("Not a valid name."); continue; }
      const token = (await p.ask("Token (hidden): ", true)) ?? "";
      if (!TOKEN.test(token)) { console.log("That does not look like a token. Nothing saved."); continue; }
      try {
        const kept = { name, added: new Date().toISOString(), ...store.put(name, token) };
        save([...accounts.filter((a) => a.name !== name), kept]);
        console.log(`Saved ${name}.`);
      } catch (e) { console.log(`Not saved: ${e.message}`); }
    } else if (c === "r") {
      const which = (await p.ask("Number or name to remove: ")) ?? "";
      const a = accounts[Number(which) - 1] ?? accounts.find((x) => x.name === which);
      if (!a) { console.log("No such account."); continue; }
      store.drop(a);
      save(accounts.filter((x) => x !== a));
      console.log(`Removed ${a.name}.`);
    } else if (c === "d") {
      const which = (await p.ask("Number or name for the default (empty: none): ")) ?? "";
      const a = accounts[Number(which) - 1] ?? accounts.find((x) => x.name === which);
      if (which && !a) { console.log("No such account."); continue; }
      save(accounts, a?.name ?? null);
      console.log(a ? `New agents start on ${a.name}.` : "No default: new agents use your normal Claude login.");
    }
  }
  p.close();
}

const [cmd, ...rest] = process.argv.slice(2);
const cut = rest.indexOf("--");
const args = cut < 0 ? rest : rest.slice(0, cut);
const argv = cut < 0 ? [] : rest.slice(cut + 1);

if (!cmd) await menu();
else if (cmd === "list") { const def = defaultOf(); console.log(JSON.stringify(load().map((a) => ({ name: a.name, added: a.added, default: a.name === def })))); }
else if (cmd === "run") launch(args[0] ?? null, argv);
else if (cmd === "switch") {
  const [terminal, name] = args;
  const at = args.indexOf("--session");
  if (!terminal || !name) die("Usage: switch <terminal> <name> [--session <id>] [--now] -- <argv...>");
  switchTo(terminal, name, { session: at < 0 ? null : args[at + 1], now: args.includes("--now") }, argv);
} else die(`Unknown command ${cmd}. Commands: list, run, switch, or none for the menu.`);
