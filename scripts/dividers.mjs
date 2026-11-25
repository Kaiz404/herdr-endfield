// The "no dots between data" design rule (CONTRIBUTING.md), as a check verify.mjs runs on skin code.
// A small scanner, not a parser: it walks the source once, tracking whether it is in code, a comment,
// a quoted string, a template (with nested ${ } code) or a regex literal. A middle dot or bullet fails
// anywhere outside a comment. " | " fails inside one string or one piece of template text, so
// `f("a") | g("b")` and `a || b` pass. Line numbers come from the walk itself.

const GLYPH = /[·•]/;
const PIPE = / \| /;
// A "/" after one of these starts a regex; after an identifier, number, ")" or "]" it divides.
const REGEX_AFTER = /[(,=:[!&|?{};+\-*%<>~^]$|(?:^|[^\w$.])(?:return|typeof|case|in|of|do|else|void|delete|throw|new)$/;

/** Lines of `src` that separate data with a glyph: [{ line, text }]. */
export function dividers(src) {
  const rows = src.split("\n");
  const hit = new Set();
  const flag = (line) => hit.add(line);
  const templates = [];
  let line = 1, i = 0, before = "", state = "code", quote = "", braces = 0, inClass = false;

  const checkText = (str, startLine) => str.split("\n").forEach((part, k) => { if (PIPE.test(part)) flag(startLine + k); });
  let text = "", textLine = 1;
  const openText = (q) => { state = q === "`" ? "template" : "string"; quote = q; text = ""; textLine = line; };
  const closeText = () => { checkText(text, textLine); state = "code"; };

  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === "\n") line++;
    if (state === "line") { if (c === "\n") state = "code"; i++; continue; }
    if (state === "block") { if (c === "*" && n === "/") { state = "code"; i += 2; } else i++; continue; }
    if (GLYPH.test(c)) flag(line);
    if (state === "string" || state === "template") {
      if (c === "\\") { text += c + (n ?? ""); if (n === "\n") line++; i += 2; continue; }
      if (c === quote) { closeText(); before += c; i++; continue; }
      if (state === "template" && c === "$" && n === "{") {
        checkText(text, textLine);
        templates.push(braces); braces = 0; state = "code"; before += "${"; i += 2; continue;
      }
      if (c === "\n" && state === "string") { state = "code"; i++; continue; }
      text += c; i++; continue;
    }
    if (state === "regex") {
      if (c === "\\") { i += 2; continue; }
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) state = "code";
      else if (c === "\n") state = "code";
      i++; continue;
    }
    if (c === "/" && n === "/") { state = "line"; i += 2; continue; }
    if (c === "/" && n === "*") { state = "block"; i += 2; continue; }
    if (c === "/" && REGEX_AFTER.test(before.trimEnd().slice(-12)) || c === "/" && !before.trim()) { state = "regex"; inClass = false; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { openText(c); i++; continue; }
    if (c === "{") braces++;
    if (c === "}") {
      if (braces === 0 && templates.length) { braces = templates.pop(); state = "template"; quote = "`"; text = ""; textLine = line; i++; continue; }
      braces--;
    }
    if (!/\s/.test(c)) before = (before + c).slice(-12);
    i++;
  }
  if (state === "string" || state === "template") checkText(text, textLine);
  return [...hit].sort((a, b) => a - b).map((l) => ({ line: l, text: rows[l - 1].trim() }));
}
