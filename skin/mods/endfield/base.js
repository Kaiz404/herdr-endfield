// The home base: the folder new local spaces open in, so an agent started there scopes itself to
// that folder instead of the whole home folder. No Herdr import: tests/ runs it under node.

/**
 * `setting` is data/endfield/settings.json `homeBase` (unset: `<home>/Projects` if it exists, else
 * home; `~` means home). `exists(path)` may be async and may throw (counted as missing).
 * Returns { folder, note }, where note says why a set folder wasn't used, or null for a space on
 * another machine: that machine's own home applies, never a path from this one.
 */
export async function resolveHomeBase(setting, home, exists, machine = null) {
  if (machine) return null;
  const sep = home.includes("\\") ? "\\" : "/";
  const there = async (p) => { try { return Boolean(await exists(p)); } catch { return false; } };
  if (setting == null || setting === "") {
    const projects = `${home}${sep}Projects`;
    return { folder: (await there(projects)) ? projects : home, note: null };
  }
  const folder = String(setting).replace(/^~(?=$|[\\/])/, home).replace(/[\\/]/g, sep);
  if (await there(folder)) return { folder, note: null };
  return { folder: home, note: `${setting} not found, so home` };
}
