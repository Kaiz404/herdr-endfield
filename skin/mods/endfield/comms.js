// comms: who sent what to whom, newest first. Every message is one delivery:
// { at (ms), from, to (a terminal address, "you" or "hc"), kind: task | msg | reply | needs | error,
//   via (the transport, e.g. "Dispatch · hc send t3 --if idle"), text }.
// The source here is the skin's own log: one JSON line per Dispatch, in data/endfield/comms.jsonl.

import { readTextFile, writeTextFile, appHome } from "herdr";

const LOG = () => `${appHome()}/data/endfield/comms.jsonl`;

export async function readLog() {
  let text = "";
  try { text = (await readTextFile(LOG())) ?? ""; } catch {}
  return text.split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).reverse();
}

/** Appends one message; reads the file first so a concurrent writer is refused rather than overwritten. */
export async function append(msg) {
  let text = null;
  try { text = await readTextFile(LOG()); } catch {}
  await writeTextFile(LOG(), `${text ?? ""}${JSON.stringify(msg)}\n`, text);
}

export const KIND = {
  task: { tag: "Task", edge: "flow" },
  msg: { tag: "Message", edge: "flow" },
  reply: { tag: "Reply", edge: "lime" },
  needs: { tag: "Needs input", edge: "signal" },
  error: { tag: "Exited", edge: "red" },
};
