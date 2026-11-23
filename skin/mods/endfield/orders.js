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

// ---- chat actions: what the session card's buttons type into an agent (actions.js draws them).

/** A slash command, typed only while the agent is idle: hc refuses any other status and waits for the person's draft. */
export const slashArgs = ({ target, text }) => ["send", target, "--if", "idle", "--", text];
/** Named key presses. hc keys has no --if, so the dialog checks the status right before it runs this. */
export const keysArgs = ({ target, keys }) => ["keys", target, ...keys];

const CLAUDE_MODELS = ["opus", "sonnet", "haiku", "fable", "opusplan", "default"];
const CLAUDE_EFFORT = ["low", "medium", "high", "xhigh", "max"];
const CODEX_REASONING = ["minimal", "low", "medium", "high"];
const word = (v) => `${v ?? ""}`.trim();

const RENAME = {
  label: "Rename",
  fields: [{ key: "name", kind: "text", label: "Name", placeholder: "fix login" }],
  // The tab's name is Herdr's and needs no idle agent; the session's own name is typed, so it is optional.
  session: (v) => `/rename ${word(v.name)}`,
  read: null,
  note: "Renames the tab in Herdr. The session name is the one /resume lists.",
};

/**
 * What each program's chat can be asked to do, as data. An action types `text(values)` with
 * hc send --if idle, or presses `keys`, or (rename) runs Herdr's tab.rename and optionally types
 * `session(values)`. `read` names what the dialog reads back afterwards (null: it says "sent").
 * An `archive` action ends the program; the dialog then records the chat (archive.js).
 */
export const ACTIONS = {
  claude: {
    rename: RENAME,
    plan: { label: "Plan", text: () => "/plan", read: "mode", note: "Turns on plan mode: it plans and asks before it edits." },
    mode: { label: "Next mode", keys: ["shift+tab"], read: "mode",
      note: "One Shift+Tab: manual, accept edits, plan, auto, then manual again. A mode set at launch (don't ask, bypass) leaves the cycle once passed." },
    model: { label: "Model", fields: [{ key: "model", kind: "choice", label: "Model", list: CLAUDE_MODELS }], text: (v) => `/model ${word(v.model)}`, read: "model",
      note: "Typed /model also saves it as your default model for new sessions." },
    effort: { label: "Effort", fields: [{ key: "level", kind: "choice", label: "Effort", list: CLAUDE_EFFORT }], text: (v) => `/effort ${word(v.level)}`, read: "effort",
      note: "Also saved as this model's default effort for new sessions." },
    archive: { label: "Archive", text: () => "/exit", archive: true, read: null,
      note: "Ends Claude Code with /exit. The transcript stays, and Report > Archived resumes it with claude --resume." },
  },
  codex: {
    rename: RENAME,
    model: { label: "Model", fields: [{ key: "model", kind: "text", label: "Model", placeholder: "gpt-5-codex" }, { key: "level", kind: "choice", label: "Reasoning", list: CODEX_REASONING }],
      text: (v) => `/model ${word(v.model)} --reasoning=${word(v.level)}`, read: null, note: "Codex's model can't be read back here, so the card says sent, not done." },
    archive: { label: "Archive", text: () => "/quit", archive: true, read: null, note: "Ends Codex with /quit. Report > Archived resumes the newest Codex chat." },
  },
  cursor: {
    rename: RENAME,
    plan: { label: "Plan", text: () => "/plan", read: null, note: "Cursor's mode can't be read back here, so the card says sent, not done." },
    archive: { label: "Archive", text: () => "/quit", archive: true, read: null, note: "Ends the Cursor agent with /quit. Report > Archived resumes the newest Cursor chat." },
  },
};

/** The actions a program offers, in card order; none for a program not in the table. */
export const actionsFor = (programKey) => Object.entries(ACTIONS[programKey] ?? {}).map(([key, a]) => ({ key, ...a }));

/** Why a typed action can't run now, or null. */
export function gate(status) {
  if (status === "idle") return null;
  return {
    done: "Finished while you weren't looking. Peek or Focus it first: actions type only into an idle agent.",
    working: "Working. Typed actions wait until it is idle.",
    blocked: "Needs input. Answer it first.",
  }[status] ?? "Not idle. Typed actions wait until it is.";
}

/** Why these values can't be sent, or null: every field filled, on one line, a choice from its list. */
export function valuesProblem(action, values) {
  for (const f of action.fields ?? []) {
    const raw = `${values[f.key] ?? ""}`;
    const v = word(raw);
    if (!v) return `${f.label} is empty.`;
    if (/[\r\n]/.test(raw)) return `${f.label} must be one line.`;
    if (f.kind === "choice" && !f.list.includes(v)) return `${f.label} must be one of ${f.list.join(", ")}.`;
    if (f.key !== "name" && /\s/.test(v)) return `${f.label} can't contain spaces.`;
  }
  return null;
}

/** The steps one action runs, in order: {herdr: command, args} or {hc: argv}. Rename types only when `alsoSession`. */
export function actionSteps(action, { target, tab, values = {}, alsoSession = false }) {
  if (action.session) return [{ herdr: "tab.rename", args: { id: tab, name: word(values.name) } }, ...(alsoSession ? [{ hc: slashArgs({ target, text: action.session(values) }) }] : [])];
  if (action.keys) return [{ hc: keysArgs({ target, keys: action.keys }) }];
  return [{ hc: slashArgs({ target, text: action.text(values) }) }];
}

/** One step as the person would run it: an hc line for this shell, or the Herdr command and its arguments. */
export const stepLine = (step, platform) => (step.hc ? commandLine(step.hc, platform) : `${step.herdr} ${JSON.stringify(step.args)}`);

// Claude Code's own mode line under its prompt (measured on 2.1.330), e.g. "⏸ plan mode on (shift+tab to cycle)".
const MODE_LINE = [[/plan mode on/i, "plan"], [/accept edits on/i, "acceptEdits"], [/auto mode on/i, "auto"], [/manual mode on/i, "default"], [/don't ask on/i, "dontAsk"], [/bypass permissions on/i, "bypassPermissions"]];

/** The permission mode Claude Code shows in its last screen lines, or null. The transcript records a change only at the next turn. */
export function modeOnScreen(text) {
  const lines = `${text ?? ""}`.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).reverse();
  for (const l of lines) for (const [re, mode] of MODE_LINE) if (re.test(l)) return mode;
  return null;
}
