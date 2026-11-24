// The "no dots between data" design rule (CONTRIBUTING.md), as a check verify.mjs runs on skin code.
// No parser: comments are blanked first (a line comment only after whitespace or at line start, so
// "https://" and a "// title" string stay code), then any middle dot or bullet left fails, and so does
// " | " inside one quoted string. Line numbers survive because blanking keeps the newlines.

const GLYPH = /[·•]/;
const PIPE = /(["'`])(?:(?!\1)[^\\\n]|\\.)* \| (?:(?!\1)[^\\\n]|\\.)*\1/;

const uncomment = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
  .replace(/(^|\s)\/\/.*$/gm, "$1");

/** Lines of `src` that separate data with a glyph: [{ line, text }]. */
export function dividers(src) {
  const lines = src.split("\n");
  return uncomment(src).split("\n").flatMap((code, i) => (GLYPH.test(code) || PIPE.test(code) ? [{ line: i + 1, text: lines[i].trim() }] : []));
}
