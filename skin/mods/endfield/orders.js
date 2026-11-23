// orders: what Dispatch runs and what happened, with no Herdr in it (tests/orders.test.mjs runs it in
// node). The dialog (dispatch.js) only draws these and passes the person's choices in.

/** hc send: the typed text always follows `--`, so text starting with "-" is never read as an option. */
export function sendArgs({ target, delivery, task }) {
  return ["send", target, ...(delivery === "idle" ? ["--if", "idle"] : []), ...(delivery === "wait" ? ["--wait"] : []), "--", task];
}

/** hc run: a new terminal in a space, its program's argv after `--`, the task as its last argument. */
export function runArgs({ parent, outlive, machine, folder, space, tab, argv, task }) {
  return ["run", "--bg", "--keep", "--json", ...(parent ? ["--parent", parent] : ["--no-parent"]), ...(parent && outlive ? ["--outlive-parent"] : []),
    ...(machine ? ["--on", machine] : []), ...(folder ? ["--cwd", folder] : []),
    "--label", `herdr.space=${(space ?? "").replace(/^.*\//, "")}`, "--label", `herdr.tab=${tab}`, "--", ...argv, ...(task ? [task] : [])];
}

/** Why the text can't go as typed, or null. An agent program would read a leading "-" as its own flag. */
export function taskProblem({ mode, shell, task }) {
  if (mode === "new" && !shell && task.startsWith("-")) return "A task can't start with \"-\": the program would read it as a flag.";
  return null;
}

const SAFE = /^[\w./:=+@-]+$/;

/**
 * One argument as Windows PowerShell 5.1 passes it to a native program. Single quotes stop $ and `
 * expansion. PowerShell drops an empty argument (so it goes as a quoted pair) and wraps one holding
 * whitespace in double quotes without escaping; the program's C runtime then reads backslashes
 * before a quote, so those are escaped here. tests/orders.test.mjs round-trips it through powershell.
 */
export function psQuote(s) {
  if (s === "") return `'""'`;
  if (SAFE.test(s) && !s.startsWith("@")) return s;
  const wrapped = /\s/.test(s);
  let out = s.replace(/(\\*)"/g, (_m, bs) => `${bs}${bs}\\"`);
  if (wrapped) out = out.replace(/(\\+)$/, "$1$1");
  return `'${out.replace(/'/g, "''")}'`;
}

export const shQuote = (s) => (s !== "" && SAFE.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`);

/** The command line that runs exactly `args`, for the shell the person would paste it into. */
export const commandLine = (args, platform) => `hc ${args.map(platform === "windows" ? psQuote : shQuote).join(" ")}`;

// hc's refusals that type nothing: usage (2), not_found (3), needs_target (7), blocked (9),
// status_mismatch (10). Any other failure may come after the text was pasted.
const REFUSED = new Set([2, 3, 7, 9, 10]);

/** How long each kind of order may take: a send can hold for the person's draft (60s), --wait for a turn. */
export function timeoutFor({ mode, delivery }) {
  return mode === "send" ? (delivery === "wait" ? 600000 : 120000) : 60000;
}

const said = (r) => /"message":"([^"]+)"/.exec(`${r.stderr ?? ""}${r.stdout ?? ""}`)?.[1] ?? (`${r.stderr ?? ""}`.trim() || `${r.stdout ?? ""}`.trim() || `hc exited ${r.code}`);

/**
 * Runs one order and says what became of it. phase:
 *   sent       hc exited 0: delivered. Never sent again, whatever the log does.
 *   refused    hc typed nothing (error says why): the person may fix it and Dispatch again.
 *   uncertain  hc failed or never answered after it may have typed: Dispatch becomes Close.
 * `log` runs only once sent, and its failure is reported as `logged: false`, never as a failed send.
 */
export async function deliver({ args, exec, log }) {
  let r;
  try { r = await exec(args); } catch (e) { return { phase: "uncertain", error: `hc did not answer: ${String(e?.message ?? e)}` }; }
  if (r.code !== 0) return { phase: REFUSED.has(r.code) ? "refused" : "uncertain", error: said(r) };
  let logged = true;
  try { await log(r); } catch { logged = false; }
  return { phase: "sent", logged, out: `${r.stdout ?? ""}` };
}
