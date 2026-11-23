// roster: the fleet as every surface sees it, from Herdr's live lists. Who each agent is
// (operator, callsign, class badge), who started it, and the squads: pinned agents first, then one
// per space, members in tree order (a parent, then its children). The rules are fleet.js; the
// squad sidebar, the report, Dispatch, pane headers and the toast all read this.

import { agents, terminals, spaces } from "herdr";
import { IDENTITY } from "./kit.js";
import { buildRoster, BY } from "./fleet.js";

/** See buildRoster() in fleet.js. `sort` orders siblings (BY.priority or BY.order). */
export const roster = (sort = BY.priority) => buildRoster({ listed: agents(), terms: terminals(), spaces: spaces(), identity: IDENTITY, sort });
