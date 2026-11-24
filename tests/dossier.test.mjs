import { test } from "node:test";
import assert from "node:assert/strict";
import { toolsView, recentView, headerOf, cardHeight, TOP_TOOLS, RECENT } from "../skin/mods/endfield/hovercard.js";

const START = Date.parse("2026-02-01T10:00:00.000Z");

test("Tools ranks the most called tools, a tie by name, each bar a share of the first", () => {
  const rows = toolsView({ Read: 16, Bash: 23, Edit: 11, Grep: 7, Glob: 7, Write: 1 });
  assert.deepEqual(rows.map((r) => [r.tool, r.count]), [["Bash", 23], ["Read", 16], ["Edit", 11], ["Glob", 7]]);
  assert.equal(rows.length, TOP_TOOLS);
  assert.equal(rows[0].share, 1);
  assert.equal(rows[3].share, 7 / 23);
  assert.deepEqual(toolsView({}), []);
  assert.deepEqual(toolsView(null), []);
});

test("an MCP tool is shown by its own name, not its server's prefix", () => {
  assert.equal(toolsView({ mcp__tracker__save_issue: 2 })[0].tool, "save_issue");
  assert.equal(recentView([{ at: START, tool: "mcp__tracker__save_issue", arg: "" }], START)[0].tool, "save_issue");
});

test("Recent lists the last calls newest first, each with its age", () => {
  const ring = [["Read", "README.md", 60000], ["Edit", "moni.tsx", 42000], ["Bash", "cd site", 18000]].map(([tool, arg, ago]) => ({ at: START - ago, tool, arg }));
  assert.deepEqual(recentView(ring, START), [
    { age: "18s", tool: "Bash", arg: "cd site" },
    { age: "42s", tool: "Edit", arg: "moni.tsx" },
    { age: "1m", tool: "Read", arg: "README.md" },
  ]);
  const long = Array.from({ length: 8 }, (_, k) => ({ at: START, tool: `T${k}`, arg: "" }));
  assert.deepEqual(recentView(long, START).map((r) => r.tool), ["T7", "T6", "T5", "T4", "T3"]);
  assert.equal(RECENT, 5);
  assert.deepEqual(recentView(undefined, START), []);
  assert.equal(recentView([{ at: null, tool: "Bash", arg: "x" }], START)[0].age, "—");
});

const run = { model: { short: "Opus 5.5" }, effort: "medium", startedAt: START - 616000, lastAt: START - 300000 };

test("a sub-agent's header names it, its parent and space, then its status, model, effort and elapsed", () => {
  const h = headerOf({ sub: true, callsign: "TYPHOEUS", program: "Claude Code", where: ["via LIFENG", "films"], title: "Moni main film", status: "working", s: run, now: START });
  assert.deepEqual(h.who, ["TYPHOEUS", "Sub-agent", "via LIFENG", "films"]);
  assert.equal(h.title, "Moni main film");
  assert.equal(h.status, "Generating");
  assert.deepEqual(h.facts, ["Opus 5.5", "med", "10m 16s"]);
});

test("a lead agent's header names its program; a run that is over stops its clock at its last write", () => {
  const h = headerOf({ callsign: "PERLICA", program: "Claude Code", where: ["films", "fix login"], title: "Fix login", status: "done", s: run, now: START });
  assert.deepEqual(h.who, ["PERLICA", "Claude Code", "films", "fix login"]);
  assert.equal(h.status, "Finished");
  assert.equal(h.facts.at(-1), "05m 16s");
});

test("a header with no session says only what it knows, and marks a folder-matched transcript", () => {
  const h = headerOf({ callsign: "PERLICA", program: "Codex", where: ["films"], title: "", status: "idle", s: null, now: START });
  assert.equal(h.title, "—");
  assert.equal(h.status, "Idle");
  assert.deepEqual(h.facts, []);
  assert.equal(headerOf({ callsign: "A", where: [], approx: true, status: "idle", now: START }).who.at(-1), "≈");
});

test("the card grows with each tool it ranks and each call it lists, up to their limits", () => {
  const sized = (tools, calls) => cardHeight({
    toolCounts: Object.fromEntries(Array.from({ length: tools }, (_, k) => [`T${k}`, k + 1])),
    recent: Array.from({ length: calls }, () => ({ at: START, tool: "Bash", arg: "" })),
  }, "working", "sub", START);
  assert.ok(sized(2, 0) > sized(1, 0));
  assert.equal(sized(TOP_TOOLS + 3, 0), sized(TOP_TOOLS, 0));
  assert.ok(sized(1, 3) > sized(1, 1));
  assert.equal(sized(1, RECENT + 4), sized(1, RECENT));
  assert.equal(sized(0, 0), sized(1, 1), "an empty list keeps one line saying so");
});
