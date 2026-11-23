#!/usr/bin/env node
// A demo fleet for screenshots and for checking the skin at scale, with no real agent:
// each "agent" is demo-agent.mjs, a Node process that reports a status (OSC 7501) and a title.
//   node scripts/demo-fleet.mjs up [--agents 6|16|30]   spaces ef-demo-*, one tab per lead agent,
//                                                      children started with hc run --parent
//   node scripts/demo-fleet.mjs set <a03|all> <working|blocked|done|idle>
//   node scripts/demo-fleet.mjs down                    closes every space and child it made
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const DIR = join(tmpdir(), "herdr-endfield-demo");
const STATE = join(DIR, "state.json");
const MADE = join(DIR, "made.json");
const AGENT = join(dirname(fileURLToPath(import.meta.url)), "demo-agent.mjs");
const SQUADS = ["herdr-app", "api-refactor", "portfolio-site", "dotfiles", "infra", "docs-site", "mobile-app", "data-pipeline", "billing-svc", "ml-evals"];
const APP = { C: "claude-code", X: "codex", Cu: "cursor", O: "opencode", G: "gemini" };
// [squad, program, task, status, parent row or -1]
const FLEET = [
  [0, "C", "Refactor auth middleware", "working", -1], [0, "C", "Explore session store", "working", 0], [0, "Cu", "Write rotation tests", "blocked", 0],
  [0, "X", "Port cookie parser", "working", 0], [0, "C", "Bump deps, run CI", "working", -1],
  [1, "X", "Run migration 0042", "blocked", -1], [1, "C", "Backfill session rows", "working", -1], [1, "Cu", "Check index usage", "done", 6],
  [2, "O", "README badges", "idle", -1], [2, "C", "Image pipeline to AVIF", "working", -1],
  [3, "G", "Dotfiles audit", "idle", -1],
  [4, "X", "Terraform plan: VPC", "blocked", -1], [4, "C", "Rotate CI secrets", "working", -1], [4, "Cu", "Helm chart lint", "idle", -1],
  [5, "C", "Lint the docs site", "done", -1], [5, "O", "Fix broken anchors", "working", -1],
  [6, "Cu", "Rename prop drilling", "working", -1], [6, "C", "Snapshot test sweep", "working", 16], [6, "X", "Android build flake", "blocked", -1],
  [7, "C", "Partition events table", "working", -1], [7, "X", "Schema drift report", "done", -1], [7, "G", "Summarize RFC 0007", "idle", -1],
  [8, "C", "Stripe webhook retries", "working", -1], [8, "Cu", "Invoice PDF layout", "idle", -1], [8, "C", "Dunning email copy", "done", -1],
  [9, "C", "Eval harness: refusals", "working", -1], [9, "C", "Grade 400 transcripts", "working", 25], [9, "X", "Plot pass rates", "idle", 25],
  [9, "O", "Dedupe prompts", "idle", -1], [9, "G", "Write eval README", "done", -1],
];

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const app = (command, args) => JSON.parse(sh("herdr-app", ["do", command, ...Object.entries(args).flatMap(([k, v]) => [`--${k}`, typeof v === "string" ? v : JSON.stringify(v)])]));
const name = (i) => `a${String(i + 1).padStart(2, "0")}`;
const save = (state) => writeFileSync(STATE, JSON.stringify(state, null, 1));
const [verb, ...rest] = process.argv.slice(2);

if (verb === "up") {
  if (existsSync(MADE)) throw new Error(`a demo fleet is already up (${MADE}); run down first`);
  const n = Number(rest[rest.indexOf("--agents") + 1]) || 16;
  mkdirSync(DIR, { recursive: true });
  const rows = FLEET.slice(0, n);
  save(Object.fromEntries(rows.map(([, , title, state], i) => [name(i), { state, title, lines: [`> ${title}`, ""] }])));
  const made = { spaces: {}, children: [], terminals: {} };
  writeFileSync(MADE, JSON.stringify(made));
  rows.forEach(([squad, prog, , , parent], i) => {
    const argv = ["node", AGENT, STATE, name(i), APP[prog]];
    const folder = join(DIR, SQUADS[squad]);
    mkdirSync(folder, { recursive: true });
    if (parent >= 0) {
      const r = JSON.parse(sh("hc", ["run", "--bg", "--json", "--no-notify", "--parent", made.terminals[parent], "--cwd", folder, "--", ...argv]));
      made.terminals[i] = r.address;
      made.children.push(r.address);
    } else if (!made.spaces[squad]) {
      const r = app("space.new", { name: `ef-demo-${SQUADS[squad]}`, folder, argv, focus: false });
      made.spaces[squad] = r.space;
      made.terminals[i] = r.terminal;
    } else {
      made.terminals[i] = app("tab.new", { space: made.spaces[squad], folder, argv, focus: false }).terminal;
    }
    writeFileSync(MADE, JSON.stringify(made));
  });
  console.log(`up: ${rows.length} agents in ${Object.keys(made.spaces).length} spaces (${made.children.length} children)`);
} else if (verb === "set") {
  const [who, state] = rest;
  const all = JSON.parse(readFileSync(STATE, "utf8"));
  for (const k of who === "all" ? Object.keys(all) : [who]) all[k].state = state;
  save(all);
} else if (verb === "down") {
  const made = existsSync(MADE) ? JSON.parse(readFileSync(MADE, "utf8")) : { spaces: {}, children: [] };
  for (const t of made.children) { try { sh("hc", ["kill", t]); sh("hc", ["rm", t]); } catch {} }
  for (const id of Object.values(made.spaces)) { try { app("space.close", { id, confirmed: true }); } catch {} }
  rmSync(DIR, { recursive: true, force: true });
  console.log(`down: closed ${Object.keys(made.spaces).length} spaces, ${made.children.length} children`);
} else {
  console.log("usage: demo-fleet.mjs up [--agents N] | set <name|all> <state> | down");
}
