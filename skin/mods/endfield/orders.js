// orders: what Dispatch and the transcript pane's follow-up box run and what happened, with no Herdr
// in it (tests/orders.test.mjs and tests/relay.test.mjs run it in node). The dialog (dispatch.js) and
// the pane (transcript.js) only draw these and pass the person's choices in.

/** hc send: the typed text always follows `--`, so text starting with "-" is never read as an option. */
export function sendArgs({ target, delivery, task }) {
  return ["send", target, ...(delivery === "idle" ? ["--if", "idle"] : []), ...(delivery === "wait" ? ["--wait"] : []), "--", task];
}

const oneLine = (s) => `${s ?? ""}`.replace(/\s*[\r\n]+\s*/g, " ").trim();

/** What a Claude Code parent is asked to type into SendMessage for its sub-agent `id`. */
export function relayMessage({ id, title, text }) {
  return `Use SendMessage to send your sub-agent ${id} (${oneLine(title)}) this follow-up, word for word: ${oneLine(text)}`;
}

const BLOCKED = "Needs input. hc refuses a blocked agent without --force, which is never used here. Answer it first.";

// [gate, words] per agent status, for "Only if idle" and for a plain send. gate is the hc delivery
// ("idle": --if idle, "now": plain) or null when nothing may go. Done is Claude Code after a turn,
// waiting at its prompt until someone looks: --if idle refuses it (exit 10) and hc has no --if done,
// so it goes plain either way.
const PLAN = {
  idle: { only: ["idle", "Idle. Delivered now."], any: ["now", "Idle. Delivered now."] },
  done: { only: ["now", "Finished its turn and waiting at its prompt. Delivered now."], any: ["now", "Finished its turn and waiting at its prompt. Delivered now."] },
  working: { only: [null, "Generating. Only if idle sends nothing while it works."], any: ["now", "Generating. Sent now; it reads the message at its next step."] },
  error: { only: [null, "Stopped on an error. Only if idle sends nothing to it."], any: ["now", "Stopped on an error. Sent now."] },
  blocked: { only: [null, BLOCKED], any: [null, BLOCKED] },
};

/**
 * The one rule for sending to an agent with `status` (null: Herdr doesn't list it), shared by
 * Dispatch and the transcript pane's relay. enabled is gate !== null; preview says what happens
 * when it goes, reason why it can't.
 */
export function deliverPlan(status, onlyIfIdle) {
  const [gate, words] = PLAN[status]?.[onlyIfIdle ? "only" : "any"] ?? [null, "Not running."];
  return { gate, enabled: gate !== null, preview: gate ? words : null, reason: gate ? null : words };
}

/**
 * A follow-up for a Claude Code sub-agent (the transcript pane). It has no terminal, so its parent is
 * asked to pass the text on with SendMessage, and only while the parent waits at its prompt:
 * deliverPlan(status, true). Returns {args, problem}: exactly one is null.
 */
export function relayOrder({ parent, status, id, title, text }) {
  const plan = deliverPlan(status, true);
  const problem = !parent ? "This pane doesn't know the sub-agent's parent. Close it and open it again from Squads."
    : !plan.enabled ? `Its parent: ${plan.reason}`
    : !oneLine(text) ? "Type a follow-up."
    : null;
  if (problem) return { args: null, problem };
  return { args: sendArgs({ target: parent, delivery: plan.gate, task: relayMessage({ id, title, text }) }), problem: null };
}

/**
 * Why a click on the relay's Send runs nothing, or null to run `shown.args`. shown is the order the
 * pane last drew and now the one it would draw at the click ({args, problem, status}); a parent whose
 * status moved in between changes the command, so the person sees the new one before anything goes.
 */
export function relayRefusal({ phase, shown, now }) {
  if (phase === "busy") return "Still sending the last one.";
  if (phase === "uncertain") return "Not sent. The last follow-up may have arrived: read the parent's screen, then change the text to send again.";
  if (!shown.args) return `Not sent. ${shown.problem}`;
  if (JSON.stringify(now.args) === JSON.stringify(shown.args)) return null;
  return now.status !== shown.status
    ? `Not sent. Its parent went from ${shown.status} to ${now.status ?? "not running"} after this command was shown. Check the new one and send again.`
    : "Not sent. The command changed after it was shown. Check it and send again.";
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
