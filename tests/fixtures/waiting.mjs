// Claude Code transcripts for waiting.test.mjs, in the line shapes version 2.1.330 writes, trimmed
// to the fields the probe reads. Every id is made up. Built here and written out by the test,
// because a transcript file never ships (scripts/verify.mjs).
//
// transcripts: {path under a projects folder: the file's text}

// Each transcript's lines are a second apart; a sub-agent's begin a few seconds into its session's.
const START = Date.parse("2026-02-01T10:00:00.000Z");
let clock = START;
let messages = 0;
const ts = () => new Date((clock += 1000)).toISOString();
const base = (sub) => (sub ? { isSidechain: true, agentId: sub } : { isSidechain: false });
const usage = { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 20 };
const assistant = (sub, block, stop) => ({ ...base(sub), type: "assistant", timestamp: ts(),
  message: { model: "claude-opus-5-5", id: `msg_${++messages}`, role: "assistant", content: [block], stop_reason: stop, usage } });

const prompt = (sub, text) => ({ ...base(sub), type: "user", message: { role: "user", content: text }, timestamp: ts() });
const say = (sub, text) => assistant(sub, { type: "text", text }, "end_turn");
const use = (sub, id, name, input) => assistant(sub, { type: "tool_use", id, name, input }, "tool_use");
const result = (sub, id, content, toolUseResult) => ({ ...base(sub), type: "user", message: { role: "user", content: [{ tool_use_id: id, type: "tool_result", content }] },
  timestamp: ts(), ...(toolUseResult ? { toolUseResult } : {}) });
const notice = (id, toolUse, status, summary) => `<task-notification>\n<task-id>${id}</task-id>\n<tool-use-id>${toolUse}</tool-use-id>\n`
  + `<output-file><temp>\\tasks\\${id}.output</output-file>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`;
const queued = (session, text) => ({ type: "queue-operation", operation: "enqueue", timestamp: ts(), sessionId: session, content: text });
const attached = (sub, attachment) => ({ ...base(sub), attachment, type: "attachment", timestamp: ts() });
const PREAMBLE = "[SYSTEM NOTIFICATION - NOT USER INPUT]\nThis is an automated background-task event, NOT a message from the user.\n\n";

const shell = (sub, id, task, command, description) => [
  use(sub, id, "Bash", { command, description, run_in_background: true }),
  result(sub, id, `Command running in background with ID: ${task}. Output is being written to: <temp>\\tasks\\${task}.output`,
    { stdout: "", stderr: "", interrupted: false, isImage: false, noOutputExpected: false, backgroundTaskId: task }),
];
const agent = (sub, id, task, description) => [
  use(sub, id, "Agent", { description, prompt: "Do the work.", run_in_background: true }),
  result(sub, id, [{ type: "text", text: "Async agent launched successfully." }],
    { isAsync: true, status: "async_launched", agentId: task, description, resolvedModel: "claude-opus-5-5", canReadOutputFile: true, canContinueAgent: true }),
];

export const transcripts = {};
function write(rel, lines) {
  clock = START + (rel.includes("subagents") ? 5000 : 0);
  transcripts[rel] = `${lines().map((l) => JSON.stringify(l)).join("\n")}\n`;
}

// A live session: its turn has ended with an agent, a resumed agent and one shell still running.
write("session-live.jsonl", () => [
  prompt(null, "Render the promos and start the preview."),
  ...agent(null, "toolu_m1", "asubwaiting", "Render promos"),
  ...agent(null, "toolu_m2", "asubresumed", "Review the stack"),
  ...shell(null, "toolu_m3", "bserver", "npm run dev", "Start the preview server"),
  ...shell(null, "toolu_m4", "bfailed", "npm run build", "Build the site"),
  ...shell(null, "toolu_m5", "bstopped", "npm run watch", "Watch the sources"),
  // The build fails: the notification is queued, then delivered as an attachment.
  queued("session-live", notice("bfailed", "toolu_m4", "failed", "Background command \"Build the site\" failed (exit code 1)")),
  { type: "queue-operation", operation: "dequeue", timestamp: ts(), sessionId: "session-live" },
  attached(null, { type: "queued_command", prompt: notice("bfailed", "toolu_m4", "failed", "Background command \"Build the site\" failed (exit code 1)"), commandMode: "task-notification" }),
  // TaskStop writes no notification.
  use(null, "toolu_m6", "TaskStop", { task_id: "bstopped" }),
  result(null, "toolu_m6", "{\"message\":\"Successfully stopped task: bstopped (npm run watch)\"}",
    { message: "Successfully stopped task: bstopped (npm run watch)", task_id: "bstopped", task_type: "local_bash", command: "npm run watch" }),
  // The reviewing agent ends, and SendMessage wakes it again.
  prompt(null, notice("asubresumed", "toolu_m2", "completed", "Agent \"Review the stack\" finished")),
  use(null, "toolu_m7", "SendMessage", { to: "asubresumed", message: "One more pass." }),
  result(null, "toolu_m7", [{ type: "text", text: "{\"success\":true}" }], { success: true, message: "Resuming agent asubres", resumedAgentId: "asubresumed" }),
  // A monitor the waiting sub-agent started ends here, in the main transcript.
  queued("session-live", notice("bmonitor", "toolu_w2", "completed", "Monitor \"render log\" stream ended")),
  // A prompt snapshot quotes the tag without being a notification.
  attached(null, { type: "prompt_snapshot", systemPrompt: ["A <task-notification> arrives when background work ends."] }),
  say(null, "The agents are running. I'll report when they finish."),
]);

// Ended its turn to wait for a render it started.
write("session-live/subagents/agent-asubwaiting.jsonl", () => [
  prompt("asubwaiting", "Render the promos."),
  ...shell("asubwaiting", "toolu_w1", "brender", "npx remotion render", "Render the promo videos"),
  use("asubwaiting", "toolu_w2", "Monitor", { command: "tail -f render.log", description: "render log" }),
  result("asubwaiting", "toolu_w2", "Monitor started (task bmonitor, expires in 10m unless the source ends first).", { taskId: "bmonitor", timeoutMs: 600000, persistent: false }),
  ...shell("asubwaiting", "toolu_w3", "bquick", "npm run lint", "Lint"),
  prompt("asubwaiting", `${PREAMBLE}${notice("bquick", "toolu_w3", "completed", "Background command \"Lint\" completed (exit code 0)")}`),
  say("asubwaiting", "Renders are running. I'll wait for the completion notice before the cleanup."),
]);

// Blocked in a shell that only polls a task's output.
write("session-live/subagents/agent-asubpolling.jsonl", () => [
  prompt("asubpolling", "Wait for the render."),
  use("asubpolling", "toolu_p1", "Bash", { command: "sleep 20; tail -5 <temp>\\tasks\\brender.output", description: "Check the render" }),
]);

// In a long tool call that does real work, quiet since it began.
write("session-live/subagents/agent-asubtesting.jsonl", () => [
  prompt("asubtesting", "Run the suite."),
  use("asubtesting", "toolu_t1", "Bash", { command: "npm test", description: "Run the tests" }),
]);

// Between a tool result and its next message: the model is thinking.
write("session-live/subagents/agent-asubthinking.jsonl", () => [
  prompt("asubthinking", "Read the file."),
  use("asubthinking", "toolu_k1", "Read", { file_path: "notes.md" }),
  result("asubthinking", "toolu_k1", "notes"),
]);

// The three ways a sub-agent's turn ends for good: a last message, a handback, an interrupt.
write("session-live/subagents/agent-asubfinished.jsonl", () => [
  prompt("asubfinished", "Summarise."),
  say("asubfinished", "Here is the summary."),
]);
write("session-live/subagents/agent-asubhandback.jsonl", () => [
  prompt("asubhandback", "Review."),
  use("asubhandback", "toolu_h1", "SubagentHandback", { message: "Verdict: clean." }),
  result("asubhandback", "toolu_h1", [{ type: "text", text: "{\"success\":true,\"message\":\"Report delivered to your caller.\"}" }]),
]);
write("session-live/subagents/agent-asubstopped.jsonl", () => [
  prompt("asubstopped", "Edit the palette."),
  use("asubstopped", "toolu_x1", "Bash", { command: "npm run build", description: "Build" }),
  { ...base("asubstopped"), type: "user", message: { role: "user", content: [{ type: "text", text: "[Request interrupted by user]" }] }, timestamp: ts() },
]);

// A session whose process is gone, with a shell and a sub-agent's tool call left open.
write("session-dead.jsonl", () => [
  prompt(null, "Start the server."),
  ...shell(null, "toolu_d1", "borphan", "npm run dev", "Start the server"),
  say(null, "The server is up."),
]);
write("session-dead/subagents/agent-asuborphan.jsonl", () => [
  prompt("asuborphan", "Run the suite."),
  use("asuborphan", "toolu_o1", "Bash", { command: "npm test", description: "Run the tests" }),
]);
