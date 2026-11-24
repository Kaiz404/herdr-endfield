import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isTrusted } from "../skin/mods/endfield/tools/trust.mjs";

const TOOL = fileURLToPath(new URL("../skin/mods/endfield/tools/trust.mjs", import.meta.url));
const windows = process.platform === "win32";

// The real tool against a throwaway home: HOME and USERPROFILE both point at it.
function withHome(projects, body) {
  const home = mkdtempSync(join(tmpdir(), "endfield-trust-"));
  try {
    const claudeJson = join(home, ".claude.json");
    writeFileSync(claudeJson, JSON.stringify({ projects: projects(home) }));
    const ask = (folder) => JSON.parse(spawnSync(process.execPath, [TOOL, folder], { encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home } }).stdout);
    body({ home, ask, claudeJson });
  } finally { rmSync(home, { recursive: true, force: true }); }
}

test("a trusted base folder covers a plain subfolder, but not a git repository cloned into it", () => {
  withHome((home) => ({ [join(home, "Projects")]: { hasTrustDialogAccepted: true } }), ({ home, ask, claudeJson }) => {
    const before = readFileSync(claudeJson, "utf8");
    mkdirSync(join(home, "Projects", "notes", "deep"), { recursive: true });
    mkdirSync(join(home, "Projects", "app", ".git"), { recursive: true });
    mkdirSync(join(home, "Projects", "app", "src"), { recursive: true });
    assert.deepEqual(ask(join(home, "Projects", "notes", "deep")), { trusted: true, repo: false });
    assert.deepEqual(ask(join(home, "Projects", "app", "src")), { trusted: false, repo: true });
    assert.equal(readFileSync(claudeJson, "utf8"), before, "~/.claude.json is never written");
  });
});

test("a trusted repository root covers its subfolders and its linked worktrees", () => {
  withHome((home) => ({ [join(home, "app")]: { hasTrustDialogAccepted: true } }), ({ home, ask }) => {
    mkdirSync(join(home, "app", ".git", "worktrees", "wt"), { recursive: true });
    mkdirSync(join(home, "app", "src", "ui"), { recursive: true });
    writeFileSync(join(home, "app", ".git", "worktrees", "wt", "commondir"), "../..\n");
    mkdirSync(join(home, "elsewhere", "wt", "src"), { recursive: true });
    writeFileSync(join(home, "elsewhere", "wt", ".git"), `gitdir: ${join(home, "app", ".git", "worktrees", "wt")}\n`);
    assert.deepEqual(ask(join(home, "app", "src", "ui")), { trusted: true, repo: true });
    assert.deepEqual(ask(join(home, "elsewhere", "wt", "src")), { trusted: true, repo: true });
  });
});

test("an untrusted folder, a missing folder and a missing ~/.claude.json read as untrusted, unknown, unknown", () => {
  withHome(() => ({}), ({ home, ask, claudeJson }) => {
    mkdirSync(join(home, "scratch"));
    assert.deepEqual(ask(join(home, "scratch")), { trusted: false, repo: false });
    assert.equal(ask(join(home, "gone")).trusted, null);
    rmSync(claudeJson);
    assert.equal(ask(join(home, "scratch")).trusted, null);
  });
});

test("an entry for the home folder covers nothing: Claude Code never saves trust there", () => {
  withHome((home) => ({ [home]: { hasTrustDialogAccepted: true } }), ({ home, ask }) => {
    mkdirSync(join(home, "notes"));
    assert.deepEqual(ask(join(home, "notes")), { trusted: false, repo: false });
  });
});

test("an entry Claude Code wrote as not accepted under a trusted parent doesn't undo the parent", () => {
  const base = windows ? "C:\\work" : "/work";
  const projects = { [base]: { hasTrustDialogAccepted: true }, [join(base, "probe")]: { hasTrustDialogAccepted: false } };
  assert.equal(isTrusted({ folder: join(base, "probe"), repo: null, projects, windows }), true);
});

test("Windows keys match with either slash and any case", { skip: !windows }, () => {
  const projects = { "D:/Work/Projects": { hasTrustDialogAccepted: true } };
  assert.equal(isTrusted({ folder: "d:\\WORK\\Projects\\notes", repo: null, projects, windows: true }), true);
  assert.equal(isTrusted({ folder: "D:\\Work\\Other", repo: null, projects, windows: true }), false);
});
