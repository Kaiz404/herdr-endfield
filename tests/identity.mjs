// IDENTITY (kit.js) without Herdr: choose() over a given art pack and overrides.
import { choose } from "../skin/mods/endfield/fleet.js";

const title = (slug) => slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export function identityOf({ operators = [], defaults = {}, overrides = {}, terminals = {}, spares = [] } = {}) {
  const pack = { operators: Object.fromEntries(operators.map((s) => [s, true])), defaults, overrides, terminals, spares };
  const as = (slug, program, pinned = false) => ({ operator: slug && pack.operators[slug] ? slug : null, name: slug && pack.operators[slug] ? title(slug) : program?.name ?? "", pinned });
  return {
    as,
    resolve(program, terminal = null, opts = {}) {
      const c = choose(pack, program, terminal, opts);
      return { ...as(c.slug, program, c.pinned), pool: c.pool, claim: c.claim };
    },
  };
}
