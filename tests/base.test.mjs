import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHomeBase } from "../skin/mods/endfield/base.js";

const HOME = "/home/<name>";
const has = (...folders) => async (p) => folders.includes(p);

test("unset: Projects under home when it exists", async () => {
  assert.deepEqual(await resolveHomeBase(undefined, HOME, has("/home/<name>/Projects")), { folder: "/home/<name>/Projects", note: null });
});

test("unset: home when there is no Projects folder", async () => {
  assert.deepEqual(await resolveHomeBase(null, HOME, has()), { folder: HOME, note: null });
});

test("set and present: that folder, with ~ meaning home", async () => {
  assert.deepEqual(await resolveHomeBase("/srv/work", HOME, has("/srv/work", "/home/<name>/Projects")), { folder: "/srv/work", note: null });
  assert.deepEqual(await resolveHomeBase("~/code", HOME, has("/home/<name>/code")), { folder: "/home/<name>/code", note: null });
});

test("set but missing: home, and a reason that names the folder", async () => {
  const b = await resolveHomeBase("/srv/gone", HOME, has("/home/<name>/Projects"));
  assert.equal(b.folder, HOME);
  assert.match(b.note, /\/srv\/gone/);
});

test("a check that throws counts as missing", async () => {
  const b = await resolveHomeBase("D:/work", HOME, async () => { throw new Error("outside home"); });
  assert.equal(b.folder, HOME);
  assert.ok(b.note);
});

test("Windows home: Projects joins with a backslash", async () => {
  assert.equal((await resolveHomeBase(undefined, "C:\\Users\\<name>", has("C:\\Users\\<name>\\Projects"))).folder, "C:\\Users\\<name>\\Projects");
});

test("Windows home: ~/ in the setting gives one kind of separator", async () => {
  const W = "C:\\Users\\<name>";
  assert.deepEqual(await resolveHomeBase("~/code/app", W, has(`${W}\\code\\app`)), { folder: `${W}\\code\\app`, note: null });
});

test("a remote machine keeps its own home: no folder at all", async () => {
  assert.equal(await resolveHomeBase("/srv/work", HOME, has("/srv/work"), "vps"), null);
  assert.equal(await resolveHomeBase(undefined, HOME, has("/home/<name>/Projects"), "vps"), null);
});
