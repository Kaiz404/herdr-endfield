import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHomeBase } from "../skin/mods/endfield/base.js";

const HOME = "/home/op";
const has = (...folders) => async (p) => folders.includes(p);

test("unset: Projects under home when it exists", async () => {
  assert.deepEqual(await resolveHomeBase(undefined, HOME, has("/home/op/Projects")), { folder: "/home/op/Projects", note: null });
});

test("unset: home when there is no Projects folder", async () => {
  assert.deepEqual(await resolveHomeBase(null, HOME, has()), { folder: HOME, note: null });
});

test("set and present: that folder, with ~ meaning home", async () => {
  assert.deepEqual(await resolveHomeBase("/srv/work", HOME, has("/srv/work", "/home/op/Projects")), { folder: "/srv/work", note: null });
  assert.deepEqual(await resolveHomeBase("~/code", HOME, has("/home/op/code")), { folder: "/home/op/code", note: null });
});

test("set but missing: home, and a reason that names the folder", async () => {
  const b = await resolveHomeBase("/srv/gone", HOME, has("/home/op/Projects"));
  assert.equal(b.folder, HOME);
  assert.match(b.note, /\/srv\/gone/);
});

test("a check that throws counts as missing", async () => {
  const b = await resolveHomeBase("D:/work", HOME, async () => { throw new Error("outside home"); });
  assert.equal(b.folder, HOME);
  assert.ok(b.note);
});

test("Windows home: Projects joins with a backslash", async () => {
  assert.equal((await resolveHomeBase(undefined, "C:\\Users\\op", has("C:\\Users\\op\\Projects"))).folder, "C:\\Users\\op\\Projects");
});

test("a remote machine keeps its own home: no folder at all", async () => {
  assert.equal(await resolveHomeBase("/srv/work", HOME, has("/srv/work"), "vps"), null);
  assert.equal(await resolveHomeBase(undefined, HOME, has("/home/op/Projects"), "vps"), null);
});
