import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The real uninstall script on a throwaway Herdr home that holds only an install record and programs.json.
const SCRIPT = fileURLToPath(new URL("../scripts/uninstall.mjs", import.meta.url));
const WRAPPER = ["node", "<home>\\.config\\herdr-app\\mods\\endfield\\tools\\account.mjs", "run", "--", "claude"];

function uninstall(programs) {
  const home = mkdtempSync(join(tmpdir(), "endfield-uninstall-"));
  try {
    mkdirSync(join(home, ".endfield-install"), { recursive: true });
    writeFileSync(join(home, ".endfield-install", "ledger.json"), JSON.stringify({ created: [] }));
    const file = join(home, "programs.json");
    writeFileSync(file, programs);
    const r = spawnSync(process.execPath, [SCRIPT, "--force"], { encoding: "utf8", env: { ...process.env, HERDR_APP_HOME: home } });
    assert.equal(r.status, 0, r.stderr);
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  } finally { rmSync(home, { recursive: true, force: true }); }
}

test("uninstall takes the account wrapper out of programs.json and keeps the person's other entries", () => {
  const after = uninstall(JSON.stringify({ programs: { claude: { name: "Claude", run: WRAPPER }, lazygit: { name: "Git" } }, shells: ["xonsh"] }));
  assert.deepEqual(JSON.parse(after), { programs: { claude: { name: "Claude" }, lazygit: { name: "Git" } }, shells: ["xonsh"] });
});

test("uninstall deletes programs.json when the wrapper was all it held", () => {
  assert.equal(uninstall(JSON.stringify({ programs: { claude: { run: WRAPPER } } })), null);
});

test("uninstall leaves a claude command of the person's own, and a broken file, as they were", () => {
  const own = JSON.stringify({ programs: { claude: { run: ["my-claude"] } } });
  assert.equal(uninstall(own), own);
  assert.equal(uninstall("{ not json"), "{ not json");
});
