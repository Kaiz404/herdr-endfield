// Whether Claude Code already trusts a folder, read-only: `node trust.mjs <folder>` prints
// {"trusted": true | false | null, "repo": bool}; null when it can't tell. Dispatch shows a hint when false.
//
// Claude Code keeps trust in ~/.claude.json (projects[<path>].hasTrustDialogAccepted), which running
// sessions rewrite all the time, so nothing here ever writes it. Its rule
// (code.claude.com/docs/en/permissions, "Project allow rules and workspace trust"): inside a git
// repository trust is keyed on the repository root; outside one, trusting a folder covers everything
// below it except a git repository nested inside. Trust in the home folder itself is never saved.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Claude Code has written both C:\a\b and C:/a/b, and Windows paths match whatever their case.
const key = (p, windows) => {
  const s = `${p}`.replace(/\\/g, "/").replace(/(.)\/+$/, "$1");
  return windows ? s.toLowerCase() : s;
};

/** Every folder from `folder` up to its root, nearest first. */
export const ancestors = (folder) => {
  const out = [];
  for (let p = path.resolve(folder); ; p = path.dirname(p)) {
    out.push(p);
    if (path.dirname(p) === p) return out;
  }
};

/**
 * Trust as Claude Code decides it. projects: ~/.claude.json's `projects`; repo: the git repository
 * root holding folder, or null. A child entry with hasTrustDialogAccepted false doesn't undo a
 * trusted parent: Claude Code writes such entries for folders that never needed asking.
 */
export function isTrusted({ folder, repo, projects, windows, home = null }) {
  const accepted = new Set(Object.entries(projects ?? {}).filter(([, v]) => v?.hasTrustDialogAccepted === true).map(([k]) => key(k, windows)));
  if (home) accepted.delete(key(home, windows));
  if (repo) return accepted.has(key(repo, windows));
  return ancestors(folder).some((p) => accepted.has(key(p, windows)));
}

/**
 * The repository root trust is keyed on, or null outside one: the nearest folder at or above `folder`
 * holding `.git`. A linked worktree's `.git` is a file naming its git dir, whose `commondir` leads to
 * the main checkout's `.git`; Claude Code keys a worktree on that main checkout.
 */
export function repoRoot(folder) {
  const root = ancestors(folder).find((p) => fs.existsSync(path.join(p, ".git")));
  if (!root) return null;
  const dotgit = path.join(root, ".git");
  if (fs.statSync(dotgit).isDirectory()) return root;
  const gitdir = path.resolve(root, /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotgit, "utf8"))?.[1]?.trim() ?? ".");
  const common = path.join(gitdir, "commondir");
  return fs.existsSync(common) ? path.dirname(path.resolve(gitdir, fs.readFileSync(common, "utf8").trim())) : root;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let trusted = null;
  let repo = null;
  try {
    const folder = process.argv[2];
    const projects = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8")).projects;
    if (folder && fs.existsSync(folder)) {
      repo = repoRoot(folder);
      trusted = isTrusted({ folder, repo, projects, windows: process.platform === "win32", home: os.homedir() });
    }
  } catch {}
  process.stdout.write(JSON.stringify({ trusted, repo: Boolean(repo) }));
}
