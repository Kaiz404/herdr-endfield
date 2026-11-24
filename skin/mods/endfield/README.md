# Endfield

The chrome of the `endfield` layout: one mod in roles (`props.role`), routed by
`ROLES` in `main.js`. Notifications are a role too: the layout names this mod as its
`toast`, and Herdr opens it with notification props and no role, which `main.js`
routes to `toast`. Paper chrome, ink terminal cards, one acid yellow that means
"you, here, now".

## Files

- `main.js` routes a role to its class: `boot`, `brand`, `footer`, `spaces`,
  `agents`, `sortmenu`, `squadmenu`, `card`, `tabs`, `pane`, `status`, `toast`,
  `cutin`, `report`, `dispatch`, `comms`, `transcript`, `action`, `archived`,
  `account`.
- Two roles open as panes, `comms` and `transcript` (`pane.split` with `mod:
  "endfield"` and the role in props). `panes()` reports a mod pane's mod but not
  its props, so `fleet.js` keeps a registry in the shared key `endfield.panes`:
  `{roles: {pane: role}, opening: {tab: role}}`. `openComms()` and Squads call
  `opening()` just before their split, which records the role of every endfield
  pane open now and the role about to open in that tab; the endfield pane that
  then appears there takes it. `paneRole()` answers for any pane, and an endfield
  pane the registry never saw is Comms. A pane of the retired
  `endfield-transcript` mod counts as a transcript, so the next click on a
  sub-agent replaces it.
- `kit.js` owns the registries every role reads: `PALETTE` (keyed `paper` /
  `night`, picked by `settings().dark`), `IDENTITY` (who an agent is drawn as;
  the casting rules are `CASTING` in `fleet.js`)
  and `MOTION` (every timing). It also holds the shared shapes (tiles, brackets,
  hatch, odometer, wipes, the selection plate and marker) and the motion helpers
  (`Entrance`, `StatusFx`).
- `roster.js` is the fleet every surface reads, built by `fleet.js` from Herdr's
  live lists: each agent's identity and callsign (a repeated operator draws the
  next free one in its pool, then a spare, then a number, `PERLICA-2`; each agent keeps its draw so it never hops),
  its `label` (what its Squads row, pane plate, Report, toast, cut-in, Dispatch and Comms
  call it: `programLabel`, numbered among siblings by `siblingLabels` only when two would
  read the same row; a Claude Code sub-agent's row uses `subLabel` on its type), its
  parent and depth, and squads in tree order: pinned agents first (they also lead
  `agent.next`), then one per space. Priority ranks an agent by the most urgent
  status in its tree. A member's `status` is Herdr's, except that `fleet.js
  memberStatus` reads an idle or done Claude Code agent as `waiting` while its
  session waits on background work (the agents list publishes those addresses
  as `endfield.waiting`). Sends and typed actions gate on `herdrStatus`, Herdr's own.
  The session card's Tasks section and the Squads task count read `fleet.js
  taskView` over `tasksOf(session)`.
- Eight modules hold the rules with no Herdr import, so `tests/` runs them under
  `node --test` (CI and `verify.mjs --static` too): `fleet.js` (the `STATUS`
  table, agent status to word, glyph kind, bar colour, entrance effect and rank,
  and the roster), `orders.js` (Dispatch's argv and the transcript pane's
  follow-up relay, the command line each shows, what became of a run, and the
  session card's `ACTIONS` per program), `archive.js` (the archived chats file
  and the command each resumes with), `messages.js` (which Comms screen tags count, how
  many are kept, the log's size cap), `base.js` (the home base: which folder a
  new local space opens in), `usage.js` (the HUD footer's Claude usage limits:
  which windows show, when one has reset, how time to reset reads),
  `hovercard.js` (which rows get a session card and what each kind offers, the
  card's view model: `headerOf`, `toolsView` and `recentView`, whose card is up, when a press takes it away, and `cardPlace`: where its window goes
  and how tall it is for a window height) and
  `squads.js` (below).
- The session card's window has a fixed place and height, set when it opens:
  Herdr has no call that moves or resizes an open overlay, and tells the card
  nothing when the app window changes size. So the agents list, which is
  rendered again on a window resize or a zoom, reads the window's height at each
  render (`window.viewport_size()` over `settings().zoom`) and opens the card
  again when it differs from the height the card was placed for
  (`hovercard.js` `resized`). Not checked in a live window: that the viewport is
  in unzoomed px (`tabs.js` divides Herdr's own window px the same way), and
  that the pointer still counts as on the card after it is replaced.
- One card, two kinds. Both draw the same dossier: the header strip, Context,
  Tools, Recent and Tasks. `cardHeight` adds up the sections' heights
  (`SECTION_H`), counting the rows Tools and Recent will list, so the list can
  place the card before it draws. `hovercard.js` `CARD_KINDS` is the table: an agent's card
  has the Chat row, Comms and Peek, Pin, Dispatch and Focus; a Claude Code
  sub-agent's card (`props.sub`) is the same `card.js` panel without them, with
  Follow-up and Open transcript. A row's key names its kind (`ag-<terminal>`,
  `sa-<sub-agent id>`). A sub-agent's card reads its `Sub` out of its parent's
  session, and its two buttons ask the list through `endfield.card.ask`, since
  only the list knows which transcript pane each tab shows.
- A right-click holds the card: the list opens it as a popup, not a window, so
  Herdr itself closes it on Esc and on a press beside it, and `card.js`
  `close()` reports that. `wantedCard` keeps a held card whatever hover says,
  and `dismissed` lets it go on any reported close, its own row's press too.
  Not checked in a live window: a popup with `frame: "none"` placed with `at`,
  and that the keyboard goes back to the terminal when it closes (the squad
  header's menu is a popup opened the same way).
- The session card closes on events, not on where the pointer is. A press
  outside the card closes it at once (`on_mouse_down_out` in `card.js`, reported
  through `endfield.card.closed`), unless the press is on the card's own row.
  Folding the sidebar to the rail and the hovered agent going away close it
  after the usual delay. A hover-out that Herdr never delivers, with no press
  after it, still leaves the card up: closing it would need the pointer's
  position, and reading that against the row's and the card's rectangles has
  not been checked in a live window.
- `kit.js` `newSpace()` is the one way a space is made: every New space control in
  `spaces.js` and the `endfield.newSpace` key command (handled by the `status` role,
  which every Endfield window shows once). On this computer it passes the home base as
  the folder; on another machine it passes none, so that machine's home applies.
- Spaces folds to its header through `spaces.js` `toggleSpaces()`: its chevron and the
  `endfield.toggleSpaces` key (the `status` role again) flip the shared key
  `endfield.spacesFolded`, keeping the block's share in `endfield.spacesOpen`. Every render
  the spaces role sizes its block with `layout.resize` from `spacesize.js` (no Herdr in it,
  `tests/spacesize.test.mjs`): folded wins over the compact fit, and the rail ignores the fold.
  The layout's `spaces` min is the header's 38px, or Herdr would hold a folded block taller.
- `squads.js` holds the squad list's rules with no Herdr in them
  (`tests/squads.test.mjs`): the `space.move` or `tab.move` a dropped or
  stepped squad or chat runs (it takes the target's place, within one
  machine, past empty spaces and tabs with no agent), where every block is
  drawn while one is held (`holding`: the gap opens at the nearest slot it can
  drop in), how a squad's rows group into the chats that drag
  (`chatBlocks`), and a squad header's right-click items. `squadmenu.js` is the popup that draws them.
  A squad menu's Rename squad reaches the list through the shared key
  `endfield.squad.rename` (`{id, at}`), since only the list holds the header's
  name field. GPUI's drag helpers here carry files or dock tabs only, so a
  squad or chat drags on mouse down, move and up, as Spaces does. Squads and
  rows are drawn at computed tops (`agents.js` `arrange`), so a drag shifts
  tops with `MOTION.drag` and no height changes.
- `brand.js` (brand, footer, boot), `spaces.js`, `agents.js` (squads, sort menu),
  `card.js` (the session panel), `actions.js` (a card action's confirm dialog
  and the Archived list), `dispatch.js` (the Dispatch dialog), `tabs.js`, `pane.js` (the name plate), `status.js` (the HUD footer),
  `toast.js` (notifications; it decides between the cut-in, the Finished slip and
  the plain slab), `cutin.js` (the needs-input skill caption), `comms.js` (the
  message log Dispatch writes and the Comms pane), `report.js` (the oversight screen: a block in the
  layout's `work-stack`, beside `main`, so it covers the work area at any size;
  `toggleReport()` selects it).
- `transcript.js` is the transcript pane: a Claude Code sub-agent's transcript,
  read-only, with a follow-up box at its foot that sends to the parent
  (`relayOrder()` in `orders.js`). `tools/probe.mjs` reads the file for it.
- `sessions.js` is the data layer for Claude Code sessions: one parsed shape per
  agent terminal (model, context, tokens, tools, turns, calls per tool, the last
  five tool calls, pending question, sub-agents). Sources, first wins: a statusline sidecar in
  `data/endfield/sessions/<session_id>.json` (matched by its `terminal`), else the
  newest transcript in `~/.claude/projects/<cwd slug>/` (approximate: two sessions
  in one folder can't be told apart; the card marks it `≈`).
- `tools/account.mjs` keeps Claude logins by name and runs a program on one: the
  token goes in as `CLAUDE_CODE_OAUTH_TOKEN` (DPAPI on Windows, the Keychain on
  macOS, a user-only file elsewhere), with `ENDFIELD_ACCOUNT` set so the statusline
  records the account. `switch` runs in a tab of its own: it waits for an agent's
  turn with `hc wait` (or presses Esc with `hc interrupt`), ends it with `hc kill`
  (an `hc send` of `/exit` from a terminal arrives tagged, as a message), and
  resumes the session there. The `account` role in `actions.js` is its dialog,
  Dispatch's Account box uses `run`, and `orders.js` builds both argvs
  (`accountArgv`, `switchArgv`, `switchPlan`). Tokens never pass through the mod:
  it reads names only (`account.mjs list`), and Manage accounts opens the tool's
  own menu in a tab.
- `tools/trust.mjs <folder>` tells Dispatch whether Claude Code already trusts
  a folder, so New agent can say it will ask. It only reads `~/.claude.json`:
  running sessions rewrite that file constantly, and Claude Code has no
  official way to trust a folder in advance. Inside a git repository it checks
  the repository root (a linked worktree's main checkout); outside one, the
  folder and every folder above it. `tests/trust.test.mjs` runs it against a
  throwaway home.
- `tools/probe.mjs` reads transcripts for `sessions.js` and for
  `transcript.js`. It runs under `node` because `readTextFile` stops at
  1 MiB and transcripts reach tens of MB. It folds each file once and keeps the
  fold and byte offset in `data/endfield/probe-cache.json`, so a poll reads only
  appended lines. The fold carries a version (`FOLD`): a cached fold from an
  older probe, which lacks a field this one adds, is folded again from the start. Without `node` on PATH the rows and card show `—`.
- `art/` SVGs, all generated by `tools/make_art.py`.
- `fonts/EndfieldWide.ttf` and `fonts/OFL.txt`.

## Assets

Every SVG in `art/` is original and written by `tools/make_art.py`. Edit the
shapes there and rerun it:

```sh
python mods/endfield/tools/make_art.py
```

- Tinted with the text colour (`svg()`): `diamond`, `plus`, `close`,
  `chevron-down`, `chevron-right`, `settings`, `server`, `monitor`,
  `sidebar`, `pin`, `pin-off`, `clock`, `layers`, `split-right`, `split-down`,
  `zoom`, `unzoom`, `win-min`, `win-max`, `win-restore`, `win-close`, and the
  geometric layer: `dots` (6px dot field), `barcode`, `cross` (registration),
  `ticks` (a ruler, major every 20px), `rings` (range rings). Each has one helper
  in `kit.js` (`dots()`, `barcode()`, `cross()`, `ticks()`, `rings()`); the dot
  field is an SVG `<pattern>` fill drawn large and clipped by its parent. The
  cut-in's diagonal band is a native path (`band()`).
- Full colour: `grid` (the 48px blueprint grid, mid grey at 14%), the `work-body`
  node's background image in the layout, so it shows in the gutters between panes.
- Hazard stripes are drawn natively (`hazard()` in `kit.js`, a 45° pattern), not an asset.
- The brand mark in the sidebar is drawn from divs (its bars rise).
- `layouts/endfield.svg` is the settings preview, drawn by hand.

## Operators

`IDENTITY.resolve(program, terminal, { parent, model })` in `kit.js` is the one place
surfaces ask who an agent is. It returns `{ operator, name, accent, avatar, badge, fallbackIcon, pool }`,
where `avatar` holds the paths `32`, `64`, `128`, `round`, `bust` and `signal`, `badge`
is the class badge (`C`, `X`, `Cu`, `O`, `G`), `fallbackIcon` is the program, drawn
as its tile inside the chip when `avatar` is null, and `pool` is the draw order.
`chip()` draws every party chip.

The rules are pure, in `fleet.js`, and `tests/casting.test.mjs` runs them:
`CASTING` maps a model id to a tier and a tier to a pool of operators (see
[docs/CASTING.md](../../../docs/CASTING.md)); `choose()` picks the slug and pool;
`cast()` draws the first operator of the pool no other agent holds and names the
callsign, numbering (`YVONNE-2`) only once the pool is spent. `castCrew()`
casts a crew from the last render's cast: each member keeps its operator while
it stays and draws from the same pool, and newcomers draw in start order.
`buildRoster()` casts the pane agents that way, in creation order, with newcomers
skipping the slots shown sub-agents hold; a same-program child with no model of
its own runs its parent's. The agents list casts each Claude Code session's
sub-agents around the fleet the same way. `roster.js` keeps the last cast and
the sub-agents' slots (`holdCrew()`) in module scope, which every copy of the
mod shares, so every surface casts alike. The agents list's session poller
publishes each Claude Code agent's model id as the shared key `endfield.models`.

Two files feed it, both optional:

- `art/operators/manifest.json`, the local art pack: each operator's files and
  accent, and `default_assignment` (program key to operator). The art is
  Hypergryph/Gryphline's and stays local; see `art/operators/CREDITS.md`.
- `data/endfield/operators.json`, the person's overrides:

  ```json
  {
    "programs": { "claude": "perlica", "codex": null, "sub-agent": "ardelia", "shell": "ember" },
    "terminals": { "t3": "laevatain" }
  }
  ```

  The installed seed is empty, so the model decides. An optional
  `"spares": ["laevatain"]` lists the operators a repeat takes after its pool and
  before callsigns get numbers (default: the manifest's `unassigned`).
  `programs` maps a program key (`program.key`: `claude`, `codex`, ...) to an
  operator slug and wins over the model. `sub-agent` is used for sub-agents.
  `terminals` maps one terminal address to a slug and wins over everything.
  `null` means no operator: that agent keeps its program tile. Unknown slugs
  also fall back to the tile.

Resolution order: `terminals[address]`, then the person's `programs["sub-agent"]`
for a child of the same program (a cross-vendor child keeps its own program's
operator), then the person's `programs[program.key]`, then the model's pool (only
the operators the pack has), then the manifest's `default_assignment`:
`sub-agent` for a same-program child, the program key, `shell`. A model no rule
knows draws `CASTING.fallback`. A pinned terminal never takes a spare. An
operator whose avatar files are missing is dropped, so deleting `art/operators/` leaves every surface as it
was. The agents list rereads both files on start and every 30 s; the table is
rebuilt, and every copy redrawn, only when their text changed (mods have no
file `stat`, so the cache is keyed by content, not mtime).

## Orchestration: what hc really offers

Dispatch and Comms are UI over herdr-core's `hc`; the skin adds no engine of its
own. Checked against hc on this machine (`hc --help`, `hc --skill`, `hc <cmd> --help`,
and harmless runs in a throwaway `ef-*` space whose terminal was a plain PowerShell):

- `hc send <t> <text>` pastes the text and presses Enter. It waits for an unfinished
  draft the person is typing (up to `draft_wait`, 60s by default). `--if idle|working`
  is a check, not a queue: on any other status it types nothing and fails
  (`status_mismatch`, exit 10; a plain shell reports "is silent, not idle").
  `--wait` then waits for the turn the send started (`--timeout`, default 180s).
  A blocked agent is refused unless `--force`; Dispatch never forces. Verified:
  plain send and the `--if idle` refusal.
- `hc run [--bg] [--keep] [--parent <t> | --no-parent] [--outlive-parent] [--no-notify]
  [--cwd <dir>] [--on <machine>] [--label k=v]... -- <argv> [task]` starts a terminal.
  Run from a terminal, the parent defaults to that terminal. With
  `--label herdr.space=<id> --label herdr.tab=<id>` it appears in Herdr; a tab id
  Herdr doesn't know becomes a new tab in that space. Verified: a new tab appeared in
  the `ef-*` space running the command.
- `hc read <t> [--lines N]` prints the screen plus N lines of history (`--json` too).
- `hc wait <t>` / `hc wait --children any|all` block until something stops working.
- `hc events [--terminal t] [--children-of t] [--label k=v]` streams fact changes as
  JSON lines. A mod can't hold a stream open (`exec` returns at exit, at most 10
  minutes), so Comms doesn't use it.
- Reports: an agent that receives a child's `hc send` sees it tagged
  `<hc from="t7 name">...</hc>`, and hc types notes into a parent when a child blocks,
  errors or exits (unless `notes = false`). A plain shell receives sends untagged
  (verified: a child's `hc send` to its shell parent arrived as plain text), so the
  tag path is implemented from the documented format and not verified here.
- `hc templates` is empty on this machine; Dispatch passes the program's own argv
  (`knownAgents()` `run`) and the task as its last argument.

The design board's "When idle" meant "queued until the turn ends". hc has no queue,
so the option is "Only if idle" and the dialog says what happens when it isn't.
`deliverPlan(status, onlyIfIdle)` in `orders.js` is the one rule for what a send to
an agent runs and what the dialog says, and the transcript pane's relay uses it too:

| Status | Only if idle | Now |
| --- | --- | --- |
| idle | `--if idle` | plain |
| done | plain | plain |
| working | disabled | plain |
| error | disabled | plain |
| blocked | disabled | disabled |
| not listed | disabled | disabled |

`done` goes plain because `--if idle` refuses it (exit 10) and hc has no
`--if done`, while a Claude Code agent that finished its turn waits at its prompt
until someone looks at it.

Dispatch runs an order once. When hc exits 0 the order is sent: the Comms log is
written in its own step, and a failure there is shown but never re-enables
Dispatch (the action becomes Close). hc's refusals (exit 2, 3, 7, 9, 10) typed
nothing, so the person may fix and Dispatch again; any other failure may come
after the text was pasted, so it also ends in Close. Send text always follows
`--`. The command line under the dialog is the exact argv, quoted for Windows
PowerShell 5.1 (on Windows) or sh, and wrapped rather than cut.

## Card actions: what was tested

The session card's Chat pills (Rename, Plan, Next mode, Model, Effort, Archive)
open a dialog like Dispatch's: it shows the exact lines and runs them once, on
Confirm. Typed text always goes as `hc send <t> --if idle -- <text>`, never
`--force`. Herdr's `done` is not `idle`, so hc refuses it (exit 10, "t40 is
done, not idle") and the card says to look at the agent first. Checked on
Claude Code 2.1.330 in a throwaway terminal started with `hc run --bg --keep`
outside any space:

- A pasted `/model opus` plus Enter runs as a command ("Set model to Opus 5.5
  and saved as your default for new sessions"). It does write
  `~/.claude/settings.json`, as the dialog warns. Sent from an agent's own
  terminal, hc wraps the text in `<hc from="...">`, which turns a slash command
  into a message. The skin runs hc from Herdr, with no sending terminal: a
  task sent with Dispatch reached the transcript untagged.
- `/effort high` persists: Claude Code saves it per model, as
  `modelSettings.<model id>.effortLevel` in `~/.claude/settings.json`.
- `hc keys <t> shift+tab` works on Windows. The cycle seen: don't ask (the
  launch mode) to manual, accept edits, plan, auto, manual again. The
  transcript records a mode only at the next turn, so the dialog reads the mode
  from Claude Code's line under its prompt (`hc read`).
- `/plan` turns on plan mode at once.
- `hc kill` on a `--keep` terminal ends it for good: state `finished`, reason
  `killed`, no shell put in its place. Archive still uses `/exit` through
  `--if idle`: hc waits for any draft the person left, nothing mid-turn is
  dropped, and `kill` would be the only ungated action on the card.

Not tested live: Codex and Cursor (`/rename`, `/model --reasoning`, `/plan`,
`/quit`, their resume commands), `/rename` in Claude Code, `claude --resume`
from the Archived list, and what Herdr lists after `/exit` in a terminal Herdr
started with `tab.new` (its shell stays; `endfield.archived` keeps that
terminal out of Squads either way).

Comms reads `<hc from>` tags off screens, which any program there could print. A
tag counts only when its sender is a live terminal other than the recipient
(never "you" or "hc"), each is marked Unverified, its text is cut at 280
characters, and the pane keeps the newest 200. With "Now, wait for reply" the
log records the last screen line after the turn as a "Screen line", not a
reply: it may be a prompt, a spinner or a draft.

### Follow-ups to a sub-agent (the transcript pane)

The transcript pane's foot takes a follow-up for the sub-agent it shows. Which
agents can take one:

- An `hc`-started child is a terminal. Squads focuses its pane (or peeks it) and
  never opens a transcript for it, so its follow-up goes the usual ways: type in
  its pane, or Dispatch with "Only if idle". The box is not offered for it.
- A Claude Code Task sub-agent has no terminal, so nothing can type into it. The
  box asks its parent instead: `hc send <parent> -- "Use SendMessage to send your
  sub-agent <id> (<description>) this follow-up, word for word: <text>"`. The
  pane says so ("sent via PERLICA") and shows that exact command before Send.
  `<id>` is the transcript's `agent-<id>.jsonl` name. That this is the id
  SendMessage takes is an assumption, not checked against Claude Code.

The parent must be waiting at its prompt: `deliverPlan(status, true)`, the
Dispatch rule above with "Only if idle". Idle goes with `--if idle`, done goes
plain, and any other status leaves Send disabled with the reason. The pane never
forces. Send runs exactly the command the pane last drew. The pane reads the
parent's status while it draws, so Herdr redraws it when that status changes. A
click that lands before the redraw, while a send may already have arrived, or
with nothing to run, sends nothing and says why (`relayRefusal()`). The run and
its refusals are `relayOrder()` and `deliver()` in `orders.js`, as for Dispatch:
a refusal (exit 2, 3, 7, 9, 10) may be retried, any other failure leaves Send
disabled until the text changes. Each sent follow-up is a Comms `Message` from
you to the parent, `via` "Follow-up via CLAUDE to sub-agent `<id>`" (`via` is the parent's label).

A done parent has a race that `--if idle` would close for an idle one. Between
the status read and hc's paste, the parent can start a turn (a background task
reporting in, say), and the relay is then typed mid-turn. Claude Code is believed
to queue input typed during a turn and read it when the turn ends. That is not
tested. After a send the pane says only that the text was typed into the parent,
not that the parent passed it on.

Not verified live: that Claude Code's SendMessage takes the transcript's id and
reaches a finished sub-agent, how the parent words what it does with the relay,
and what Claude Code does with a relay typed mid-turn.

## Native limits

What the design boards draw that Herdr's mod API can't, and what stands in:

- Corner brackets on the focused pane (`gw-brk`): the terminal body is native, and a
  mod draws only the pane header. The header's yellow focus bar stands in.
- "When idle" as a queue: hc has none (above). The option is "Only if idle".
- The toast slot's place and size are Herdr's. The needs-input cut-in is an overlay
  window of its own, opened above the slot so a toast never covers it.
- Files can't be stat'ed from a mod, so `tools/probe.mjs` (node) reads transcripts
  and sidecars and prunes by mtime.
- Without the art pack, agents keep their program tiles and program callsigns; the
  board's accent ring with initials is not drawn.

## Sounds

Three original cues in `sounds/`, synthesised by `tools/make_sounds.py` with
ffmpeg (sines, no samples): `needs-input.mp3`, `claimed.mp3` and `tick.mp3`.
`cue(name)` in `kit.js` is the one place that plays them. The two alerts play
when the toast role meets an agent that needs input (with its cut-in) or has
finished, and only when Herdr's own attention sounds are off
(`settings.json` `sounds.enabled: false`), so one event never sounds twice. To
hear them with Herdr's sounds on, point Herdr at them instead:

```json
{ "sounds": { "enabled": true, "blocked": "mods/endfield/sounds/needs-input.mp3", "done": "mods/endfield/sounds/claimed.mp3" } }
```

`data/endfield/settings.json` (installed from `settings.example.json`, never
overwritten) holds the skin's own switches: `sounds.alerts` (default `true`)
and `sounds.ticks` (default `false`: very quiet clicks when Dispatch sends and
when a panel opens), and `homeBase`, the folder new local spaces open in (unset:
`<home>/Projects` if it exists, else home; `~` means home; a missing folder falls
back to home and the Spaces header says `NOT FOUND`). It is reread every 30 s and
on every New space.

## Fonts and licences

`fonts/EndfieldWide.ttf` is a static instance of Saira (wdth 125, wght 600),
from the google/fonts repository (`ofl/saira/Saira[wdth,wght].ttf`), renamed
to the family "Endfield Wide". Saira is under the SIL Open Font License 1.1,
copied in `fonts/OFL.txt`. Saira declares no Reserved Font Name. Windows files
the family as "Endfield" (it reads "Wide" as a width), so `kit.js` asks
`fonts()` which name it took.

To regenerate it (fonttools 4.x):

```sh
python tools/instance_font.py "Saira[wdth,wght].ttf" EndfieldWide.ttf
```

Geist, Geist Mono and JetBrains Mono ship with Herdr.

## Motion

Every timing is a row of `MOTION` in `kit.js`, named as on the design's motion
board (`select.edge`, `row.wipe`, `pane.pulse`, `cut.grow`, `boot.rule`, ...) and
shaped as the native policy it feeds, so a surface writes
`.transition("top", MOTION.select.edge)` and never a number.

Only native motion: `.transition` on opacity, width, height, left and top,
`.loop`, and `.frames`. No colour ever transitions. One-shot `cx.timer.after`
calls end a transient state (the boot, a Finished flash, the card's open delay).
The repeating timers are for data only: the agents list's 30s age labels (and a
one-second redraw while a generating row is under a minute old, so its seconds count), the
session card's one-second clock for running tasks (it repaints only when a shown value
changes), the HUD footer's one-minute reset countdown, the spaces list's git and machine checks, Comms' 15s screen scan (one at a time, six
reads at once, 5s each), and the 3s session poll. That poll runs only when a
watched folder changed (`watchFolder` on the sidecars and on the target agents'
own project folders, the ones `probe.mjs` reports), a sub-agent may have gone
quiet, or, every 15s, when a folder can't be watched (refused, or not created
yet). It runs whether the sidebar is wide, a rail or hidden, since the HUD
footer, the report and the session card read it. A glyph whose state has
nothing in it draws still (`glyph(..., { still })`): an idle fleet repaints
nothing.

Plates snap; only the yellow marker travels. A list's selection is a plate
(`plate()`, child 0 of its scroll area, under the rows) that jumps to the
selected row with no transition, and a 2px yellow marker (`marker()`, the last
child, over the rows) whose `top` moves there. That needs every row's height to
be fixed: the `H` tables in `spaces.js` and `agents.js`. The tab strip does the
same: its yellow plate jumps, and a 3px ink marker along its foot slides over the
widths each tab reports. Scroll indexes (`scroll_to_item`) are one higher than
the row index because of the plate.

Regions build in placeholder-first after the boot (`Entrance`): drawn at
opacity 0, then each fades in (`build.in`), `build.stagger` apart.
