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

test("a // inside a string does not blank the rest of the line", () => {
  assert.deepEqual(lines('micro("see // here", C.muted); micro("a · b");'), [1]);
  assert.deepEqual(lines("const u = 'x // y'; const t = `${x} · ${y}`;"), [1]);
  assert.deepEqual(lines('const t = "a // b · c";'), [1]);
});

test("a stray /* in a line comment, string or regex does not swallow code", () => {
  assert.deepEqual(lines('// see /* here\nconst t = "a · b";\n// end */'), [2]);
  assert.deepEqual(lines('const g = "/*";\nconst t = "a · b";\nconst e = "*/";'), [2]);
  assert.deepEqual(lines("const re = /\\/*x/;\nconst t = 'a · b';"), [2]);
  assert.deepEqual(lines("const re = /[/*]/;\nconst t = 'a · b';"), [2]);
});

test("inner lines of a multi-line template are checked", () => {
  assert.deepEqual(lines("const t = `first\nsecond · dot\nthird`;"), [2]);
  assert.deepEqual(lines("const t = `first\nsecond | pipe\nthird`;"), [2]);
  assert.deepEqual(lines("const t = `a\n${x}\n${y} | ${z}`;"), [3]);
  assert.deepEqual(lines("const t = `a ${f(`b · c`)} d`;"), [1]);
  assert.deepEqual(lines("const t = `a ${ {x: 1}.x } b\n// not a comment · here`;"), [2]);
});

test("the pipe rule pairs quotes: joined calls and separate strings pass", () => {
  assert.deepEqual(lines('const v = f("a") | g("b");'), []);
  assert.deepEqual(lines("const v = f('a') | g('b');"), []);
  assert.deepEqual(lines('const v = f("a | b") | g("c");'), [1]);
  assert.deepEqual(lines("const v = \"it's\" | \"x\";"), []);
});

test("the line numbers point at the source, past a multi-line comment", () => {
  const found = dividers("/*\n * x · y\n */\nconst t = \"a · b\";");
  assert.deepEqual(found, [{ line: 4, text: 'const t = "a · b";' }]);
});
