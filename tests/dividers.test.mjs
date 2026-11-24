import { test } from "node:test";
import assert from "node:assert/strict";
import { dividers } from "../scripts/dividers.mjs";

const lines = (src) => dividers(src).map((d) => d.line);

test("a dot or bullet between data fails, in any kind of string", () => {
  assert.deepEqual(lines('micro("Ctx · focused", C.muted)'), [1]);
  assert.deepEqual(lines("const a = 1;\nconst t = `${m.callsign} · ${m.title}`;"), [2]);
  assert.deepEqual(lines("const s = 'a • b';"), [1]);
  assert.deepEqual(lines('const slot = `${slug}·${n}`;'), [1], "a dot inside a name is still a dot");
});

test("comments may keep dots; a // inside a string is not a comment", () => {
  assert.deepEqual(lines("// row meta · model\n/** a · b\n * c · d */\nconst x = 1; // e · f"), []);
  assert.deepEqual(lines('const u = "https://x.dev · docs";'), [1]);
  assert.deepEqual(lines('micro(`// ${space} · ${addr}`, C.muted)'), [1]);
});

test("a pipe between data inside one string fails; code and joined strings do not", () => {
  assert.deepEqual(lines('micro("Opus | main", C.muted)'), [1]);
  assert.deepEqual(lines("const t = `${a} | ${b}`;"), [1]);
  assert.deepEqual(lines('const ok = a || b;\nconst bits = x | y;\nconst s = "a" || "b";'), []);
});

test("the line numbers point at the source, past a multi-line comment", () => {
  const found = dividers("/*\n * x · y\n */\nconst t = \"a · b\";");
  assert.deepEqual(found, [{ line: 4, text: 'const t = "a · b";' }]);
});
