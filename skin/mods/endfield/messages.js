// messages: the Comms rules with no Herdr in them (tests/messages.test.mjs runs them in node).
// What a screen tag may claim, how many are kept, and how the Dispatch log stays small.
// endfield-transcript logs its follow-ups with a byte-identical copy; tests/relay.test.mjs fails when they differ.

/** The Dispatch log is kept under this many bytes; past it, the oldest lines go. */
export const LOG_MAX = 512 * 1024;
/** Screen tags kept in memory per Comms pane; past it, the oldest seen go. */
export const TAGS_MAX = 200;
/** A tag's text is cut to this many characters. */
export const TEXT_MAX = 280;

const TAG = /<hc from="([^"\s]+)[^"]*"[^>]*>(.*?)<\/hc>/g;

/** UTF-8 length, without TextEncoder (the mod runtime may not have it). */
function bytes(s) {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/** The log with one line appended, its oldest lines dropped to three quarters of `max` once it passes `max`. */
export function appendCapped(text, line, max = LOG_MAX) {
  const next = `${text ?? ""}${line}\n`;
  if (bytes(next) <= max) return next;
  const lines = next.split("\n").filter(Boolean);
  const keep = [];
  let size = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    size += bytes(lines[i]) + 1;
    if (size > max * 0.75 && keep.length) break;
    keep.unshift(lines[i]);
  }
  return `${keep.join("\n")}\n`;
}

/**
 * The `<hc from="t7 name">text</hc>` reports on one recipient's screen. Screen text is anyone's to
 * print, so a tag counts only when its sender is a live terminal in the fleet other than the
 * recipient: never "you" or "hc". Every entry is marked unverified, since the screen, not hc, says so.
 * live: Set of live terminal addresses; kids: the recipient's children (their tags are replies).
 */
export function readTags(screen, { to, live, kids = [] }) {
  const out = [];
  for (const [, from, raw] of `${screen ?? ""}`.matchAll(TAG)) {
    if (from === to || !live.has(from)) continue;
    const text = raw.trim();
    out.push({ from, to, kind: kids.includes(from) ? "reply" : "msg", unverified: true, text: text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text });
  }
  return out;
}

/** Adds tags not seen before (stamped `now`: a tag has no time of its own), keeping the newest `max`. */
export function remember(seen, found, now, max = TAGS_MAX) {
  for (const t of found) {
    const key = `${t.from}>${t.to}:${t.text}`;
    if (!seen.has(key)) seen.set(key, { ...t, at: now });
  }
  for (const key of seen.keys()) {
    if (seen.size <= max) break;
    seen.delete(key);
  }
  return seen;
}
