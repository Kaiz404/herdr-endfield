// roster: the fleet as every surface sees it, from Herdr's live lists. Who each agent is
// (operator, callsign, class badge), who started it, and the squads: pinned agents first, then one
// per space, members in tree order (a parent, then its children). The rules are fleet.js; the
// squad sidebar, the report, Dispatch, pane headers and the toast all read this. The shell an
// archived chat leaves behind (shared "endfield.archived", set by actions.js) stays out. A linked
// helper sits under its lead (shared "endfield.links", links.json as linkdialog.js last read it).

import { agents, terminals, spaces, shared } from "herdr";
import { IDENTITY } from "./kit.js";
import { buildRoster, BY } from "./fleet.js";

// The last cast, and the slots the agents list's sub-agents hold. Module code runs once and is
// shared by every copy of the mod, so each surface draws from the same memory and casts alike.
let last = null;
let crew = [];

/** The agents list's shown sub-agents hold these slots (fleet.js held()); a new pane agent skips them. */
export const holdCrew = (slots) => { crew = slots; };

/** See buildRoster() in fleet.js. `sort` orders siblings (BY.priority or BY.order). Models, session ids and waiting: the agents list's session poller publishes them. */
export const roster = (sort = BY.priority) => {
  const R = buildRoster({ listed: agents(), terms: terminals(), spaces: spaces(), identity: IDENTITY, models: shared("endfield.models") ?? {}, sessions: shared("endfield.sessionIds") ?? {}, waiting: shared("endfield.waiting") ?? [], prev: last, avoid: crew, sort, hidden: shared("endfield.archived") ?? [], links: shared("endfield.links") ?? [] });
  last = R.cast;
  return R;
};
