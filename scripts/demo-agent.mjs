#!/usr/bin/env node
// A stand-in agent for demo-fleet.mjs: a plain Node process that reports a status over OSC 7501
// and sets its title, so Herdr lists it as an agent. It runs no model and touches no files but
// its own state file. node demo-agent.mjs <state.json> <name> <app>
import { readFileSync, existsSync, watchFile } from "node:fs";

const [file, name, app] = process.argv.slice(2);
const ESC = "\x1b";
let last = null;

function apply() {
  if (!existsSync(file)) process.exit(0);
  let me;
  try { me = JSON.parse(readFileSync(file, "utf8"))[name]; } catch { return; }
  if (!me || JSON.stringify(me) === last) return;
  const first = last === null;
  last = JSON.stringify(me);
  process.stdout.write(`${ESC}]0;${me.title}\x07${ESC}]7501;state=${me.state}:app=${app}${ESC}\\`);
  if (first) for (const line of me.lines ?? []) process.stdout.write(`${line}\r\n`);
  process.stdout.write(me.state === "blocked" ? `\r\n? ${me.question ?? "Continue? (y/n)"}\r\n` : `\r\n▶▶ ${me.state}\r\n`);
}

apply();
watchFile(file, { interval: 400 }, apply);
