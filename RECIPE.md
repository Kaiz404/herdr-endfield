# Endfield

A Herdr layout styled as a well-run factory's wayfinding system. The chrome is
warm paper (`#EEEDEC`), terminals sit on ink cards (`#191919`), and one acid
yellow (`#FFFA00`) marks only what is yours right now: the active tab, the
selected space's edge, the focused pane, an agent that needs input, and primary
buttons. Status is always a word plus a glyph. Things move only where work
happens. A night appearance swaps the paper for near-black (`#141414` chrome,
`#0E0E0E` canvas) and keeps the rest.

![Endfield](preview.png)

`preview.png` is the layout's settings preview (`skin/layouts/endfield.svg`)
rendered at 4x. It is a schematic, not a screenshot.

## What you see

- **Sidebar, left, 248px** (min 44, max 480), paper ground with a 1px
  `#D9D9D9` divider.
  - Brand, 64px, drags the window: a 30px ink tile with three rising bars (click:
    command palette), "Herdr" in the wide face at 15px, the mono micro-label
    "Field ops · local · v<version>", and the window's only tri-colour bar
    (28x3px: `#FF1AAC` 5px, `#00FFA2` 5px, `#FFFA00` 18px) right-aligned 10px
    above the bottom hairline.
  - Spaces: header "// Spaces" (Geist 13 semibold), a mono count and a `+`.
    Rows are 38px: `// name` (Geist 13 medium, the `//` muted) over a mono
    10px label (tab count, repo, branch, ↑ahead ↓behind). The selected row is
    inverted (ink, `#F2F2F2` text) in one frame; a 2px yellow marker travels
    to it (300ms). At the right:
    marching `▶▶` for working, a yellow block with an ink `!` for blocked, a lime disc
    with an ink ✓ plus an orange diamond for unseen done, nothing for idle.
    Machine groups (once a remote machine exists) get a wide-caps header, a
    hairline running to the right, a connection lamp and a chevron.
  - Squads: header "// Squads", mono `03/05 ACTIVE`, a `Priority ▾` pill
    (Priority or Tab order, within each squad). One squad per space, numbered
    like its space: a 22x16 ink number box, the space name in wide caps, a
    hairline, a yellow `!` box when someone needs input, the count, a round `+`
    (Dispatch a new agent there) and `▾`. Clicking the header folds it (rows
    close, 300ms) and a stack of its operators' 16px chips stands in for them.
    Agent rows, 56px (children 50px): a party chip (36px, children 28px: the
    operator's round portrait in a 2px white ring, yellow when it needs input,
    a 1px halo in the operator's accent, a class badge bottom right: `C`
    Claude Code, `X` Codex, `Cu` Cursor, `O` OpenCode, `G` Gemini); the
    callsign in wide caps 10px (`PERLICA`; a repeat takes a spare operator,
    then `PERLICA·2`), then in mono the model and, 6px on in a dimmer grey,
    the effort level: `OPUS 5.5  MED` (effort reads LOW, MED, HIGH, XHIGH or
    MAX; an agent with no Claude Code session shows its program; no
    terminal address, no tool count); at the right of that line a clock icon
    and how long the run has gone (to now while generating, else to its
    last write: `42s`, `27m`, `1h07`, `12h`, `3d`), then "▶▶ Generating", a
    yellow "Needs input" pill or "✓ Finished". The second line is the task
    (13px medium) with, at its right, an 8-block context gauge (5x6px blocks
    2px apart; lit share = used / window, red from 75%; its tooltip reads
    `157K / 1M · 16%`; an unknown window is 1M for a `[1m]` model or a
    context past 200K, else 200K). The status and elapsed never shrink; the
    model and effort give way first, then the callsign truncates. While a
    generating row under a minute is on screen the list redraws each second
    so its seconds count; otherwise every 30 seconds. Sub-agent rows show
    the same. What isn't known is left out. Compact rows keep only the
    status glyph at the right. An idle
    row folds to one 34px line (26px compact): a 22px chip (18px compact),
    the callsign, the task at 11.5px and "zZ Idle". Blocked rows carry 4px hazard stripes on the left edge.
    Children (terminals started with `hc run`, and Claude Code's own
    sub-agents read from its transcript) hang under their parent with a 1px
    right angle from the parent chip's foot, whatever their vendor. Claude
    Code sub-agents show while working or waiting ("Waiting" beside two still
    bars in the working blue, no march), newest started first; below them a
    26px row (22px compact) reads "▾ +N earlier" and lists the finished ones
    too, newest first, or "▴ Show less" to fold them back. Each parent keeps
    its choice until the mod reloads; there is no cap, the list scrolls. From 12
    agents everything goes compact: 34px rows, 24/20px chips, callsign over
    task, a status glyph only (`▶▶`, `!`, `✓`, `zZ`); the spaces block becomes
    numbered squares, six a row; and a pinned "Needs input" box (hazard edge,
    count, three rows, then "+N more · Report ▶") sits above every squad. The
    list scrolls and says "▾ N more agents below". Without the art pack every
    chip shows its program's tile instead.
  - Session panel, 368px, beside the sidebar while a squad row is hovered,
    laid out like an AIC machine panel: the operator's bust in a dotted frame
    with a range ring and an accent foot, an ink chip naming the work
    (`// FIX LOGIN`: the tab's name, else the space's; never the terminal
    address) and a barcode, the task, `CALLSIGN / program / where`; three
    cells (Input on a dot field: the folder and model as item tiles; the
    state with its march, a tick ruler and `elapsed  turn`; Tools: tool calls
    in the wide face); Context (the input tokens of the last request, which
    is what the session carries now, `of 1M  6%`, and 20 blocks); Chat (model,
    effort and mode, then one pill per action: Claude Code Rename, Plan, Next
    mode, Model, Effort, Archive; Codex Rename, Model, Archive; Cursor Rename,
    Plan, Archive; typed ones dim with the reason when the agent isn't idle);
    Comms (the last two messages in and out, `Log ▶`); the question in
    brackets when blocked; an ink footer with the Current formula (`folder
    ▶▶ last action`), Peek, Pin, Dispatch + and Answer/Focus ▶. Unknown
    fields (any non-Claude agent) read `—`.
  - Action dialog, 560px, from a Chat pill: the field it needs (a name, a
    choice of models or levels), a Needs line (idle, or why not), a Does line
    (the side effect: `/model` and `/effort` also become your defaults for new
    sessions), and the graphite strip with the exact lines Confirm runs. After
    a send it reads back the model or effort (session data) or the mode
    (Claude Code's own line under its prompt), else says Sent.
  - Archived list, 600px, from Report's Archived pill: archived chats newest
    first, each with its folder, the exact argv Resume runs (programs.json
    `run` plus the resume arguments), a warning when it may reopen another
    chat, and **Resume** (dimmed while the chat still runs).
  - Footer, 40px: settings (with an orange diamond when an update is ready),
    add machine, fold sidebar, and the palette key in mono.
- **Tab strip, 36px**, drags the window: tabs run full height, separated by
  hairlines; each shows a mono index `01`, the agent icon, the label and its
  status. The active tab sits on a yellow plate that snaps to it while a 3px ink marker slides along its foot,
  with ink text and a close ×. Then an ink "+ New" button (radius 3, a 3px
  yellow tab on its left edge), the Files and Changes pills (ghost; ink when
  open; which show is shared `workspace.panels`), and on Windows and Linux
  44px minimise, maximise/restore and close buttons drawn as thin vector glyphs.
- **Work area**: 8px padding and 8px gaps on the canvas (`#E5E5E5`). Panes are
  ink cards, radius 4, 1px `#BDBDBD` border, `#191919` when focused, framed
  even when alone. A 34px white name plate: a 2px grey strip on its left edge
  that a 6px yellow bar grows down when focused (300ms), the program's 34px
  square tile (ink when focused), the operator's 22px chip on an agent's pane,
  the title in wide caps 12px, a mono `PERLICA · T3 · folder · branch`, the
  status at the right, and a 4px ink square in the top-right corner when
  focused. When that agent needs input while its pane has focus, the plate
  washes yellow and back (opacity 0 to .42, 1400ms), a 4px hazard rule runs
  under it and the pill turns ink with yellow text; no toast is made.
  Files and Changes open in a
  368px panel on the right (min 280, max 900), paper, radius 4.
- **Report**: the Report pill (ink, top right) swaps the work area for the
  oversight screen; the squad sidebar stays live beside it. A white panel with
  four corner brackets: `// Report` under `Oversight · every squad · last 10
  min` and a barcode; readouts with coloured left edges (Squads, Agents,
  Generating, Needs input, Finished, Tokens · 10 min); `Group · Squad` (or
  None); sortable headings (Agent, Rate, Reserves, Turn, Status; the active
  one inverts to ink with ▼/▲; Status is the default: Needs input, Finished,
  Generating, Idle); squad headers like the sidebar's with `▶▶ n ✓ n` and a
  yellow `! n need input`, folding on click; rows with the chip and callsign,
  the terminal and its link (`◀ T3 · Claude Code ▶ Cursor`, or `3 children`),
  a 16-bar output sparkline over 10 minutes (ink, never yellow), tokens a
  minute on a blue edge, context on a grey edge that turns red past 75%, the
  turn, and the status. Children stay under their parent whatever the sort.
  46px rows, 30px on one line past 12 agents; it scrolls. Output and rate exist
  for Claude Code agents only; others read `—`.
- **Dispatch**: a 660px paper dialog with two corner brackets, `// Dispatch`
  under the engine line (`hc send · to a running agent` or `hc run · new agent
  in a space`) and a barcode, a Send to agent / New agent switch and a round
  close. Send: target operators as party-chip tiles (yellow edge on the chosen
  one) and a line that says what hc will do for its status. New agent: program
  tiles on ink with a lime "installed" bar (not installed: dimmed), the
  operator it will be drawn as (automatic), the squad (click for the next
  space) and the parent. Then the task (or, for Shell, the command) in
  brackets, the delivery (Only if idle, Now, Now and wait for reply) or
  lifetime (Ends with parent, Outlives parent, No parent), and a graphite
  footer: `Current formula YOU ▶▶ PERLICA · T3`, the exact hc command, Cancel
  and the yellow Dispatch pill. Opened from a squad header's `+`, the session
  panel's Dispatch, or the empty sidebar. Errors from hc show in the dialog.
- **Comms**: the Comms pill opens a pane beside the focused one: `// Comms`,
  All / You / Reports, a line naming its sources and what it can't see, and
  message cards (time and age, sender chip ▶▶ recipient chip, the text in
  brackets, the transport underneath, the left edge by kind: blue task or
  message, lime reply, yellow needs input, red exited). YOU is the only yellow
  chip; hc notes are a grey square.
- **HUD footer, 44px**: ink with a faint 45° grain. The number of active
  agents on a 22px odometer, `// space / tab`, then `▶▶ 14 GENERATING` and
  `✓ 01 FINISHED` on odometers; the account's Claude usage limits in the
  free width, each window a block of two rows on one left edge, `5-HOUR
  54% USED` over `▰▰▰▰▱▱▱▱ RESETS 1H 40M`, the percent column shared by both
  rows, the blocks 12px either side of a hairline, no dots or pipes (label
  and `USED` in the 10px mono label voice, the percent 13px bold; the kit's
  8-block gauge, filled by percent used; countdown `<1m`, `42m`, `5h 00m`,
  `2d 5h`; the newest any statusline sidecar carries; from 80% a red `▲`
  before the label, a red gauge and a red percent; a window whose reset time
  has passed reads `5-HOUR RESET` over an empty gauge; when the width runs
  short the gauges go first, then the second window's `USED`; the rows keep
  their 13px and 10px heights at every width; absent with no Claude
  statusline data; the countdown repaints once a minute); at the right the focused agent's context (used /
  total over a 3px bar, red past 75%), its model, the branch and the machine;
  and a 176px yellow block, `04 NEEDS INPUT ▶`, that opens (300ms) while
  anyone needs input; click goes to the first.
- **Toasts**: a white slab with a 3px edge and a round glyph in the level's
  colour, title, body, `// space` top right, a yellow "Open ▶" pill and a 2px
  countdown. An agent that finished gets the Finished slip: its chip flashes
  yellow once (.9 to 0, 300ms), the callsign, a lime "Finished ✓" pill, the
  task and a "View ▶" pill.
- **Needs input, elsewhere: the cut-in.** A 440x214 ink slab at the bottom
  right, an overlay window (Herdr's toast slot is too small): a field of dots,
  a yellow diagonal band, the operator's signal duotone in a white frame with a
  yellow diamond above and a `!` badge, `// space · T3` and a barcode, a white
  caption plate that a yellow block grows across (330ms), holds and retracts to
  a 4px edge (350ms, from 630ms), revealing "PERLICA NEEDS INPUT" in wide
  caps, a hazard rule, the question from its screen in brackets, and Answer ▶ /
  Later. It stays until answered or Later, and closes itself when the agent
  stops needing input or its pane gets focus.
- **Terminals**: JetBrains Mono 14 at weight 500 on `#191919`, foreground
  `#E6E6E1`, padding 14 by 10, yellow cursor, an original 16-colour set tuned
  to the status hues (working `#31ACF0`, blocked `#FFFA00`, done `#BBCC2B`,
  idle `#6E6E6E`).

## How it behaves

- **Working:** `▶▶` steps through (300ms a beat) in flow blue. It is the only motion on a
  generating row.
- **Blocked:** a yellow "Needs input" pill and a hazard tick, both still:
  blocked waits.
- **Done:** the lime disc grows from 0 (200ms); it turns idle when looked at.
- **Idle:** `zZ Idle` in muted text, still.
- **Start:** an ink screen with range rings and four registration crosses, a
  10px yellow bar fills the left edge (650ms from 100ms), `HERDR//` types on
  glyph by glyph (50ms apart from 200ms), a yellow rule retracts to the right
  (150ms from 760ms) under `// FIELD OPS · ESTABLISHING LINK`, then the screen
  fades (225ms from 1275ms; a click skips it). The regions build in placeholder-first, each fading in (120ms) 100ms apart: brand, spaces and tabs,
  agents and panes, status. The mark's bars rise 80ms apart and the
  tri-colour bar wipes in.
- **Spaces:** click selects (the ink fill wipes in, the yellow edge grows
  down); drag reorders within a machine (a 2px line shows where); right-click
  opens the space menu; the machine header folds its group.
- **Squads:** click focuses the pane (the plate snaps, the yellow marker
  travels, 300ms); a child without a pane opens as a peek; a Claude Code
  sub-agent opens its transcript beside its parent. A squad header folds it.
  The sort pill opens Priority or Tab order. A new child draws its connector
  top-down (240ms); a newly pinned agent fades in. `alt-up` /
  `alt-down` follow the list's order.
- **Session card:** after 250ms on an agent row it fades in and slides 16px
  right (300ms) and the context blocks light 18ms apart. Moving onto the card
  keeps it; leaving both closes it after 160ms. A press outside the card
  closes it at once, except on its own row. A hover-out Herdr never reports
  closes nothing until the next press: the pointer's position is not read.
  Answer/Focus runs
  `agent.focus`, Peek `terminal.peek`, Pin `terminal.pin`.
- **Chat actions:** a Chat pill closes the card and opens its dialog; nothing
  runs from the pill. Confirm runs the shown lines once: typed text as
  `hc send <t> --if idle -- "<text>"` (never `--force`), Next mode as
  `hc keys <t> shift+tab` only if Herdr still says idle at the click, Rename
  as `tab.rename` (plus `/rename <name>` when ticked). A `done` agent counts
  as not idle: Peek or Focus it first. Each send is logged to Comms as an
  Action. Archive types `/exit` (Claude Code) or `/quit` (Codex, Cursor),
  records the chat in `data/endfield/archive.json` and keeps the terminal out
  of Squads (`endfield.archived`). Resume runs `tab.new {name, space, folder,
  argv}` with the program's `run` argv plus `--resume <id>` (Claude Code),
  `resume --last` (Codex) or `resume` (Cursor), and drops the record.
- **Claude Code sub-agent row:** read from its transcript, not from how long
  ago it wrote. Working while a tool call has no result or its turn has not
  ended. Waiting when that tool call only waits (a shell that sleeps, loops
  or reads a background task's output), or when its turn has ended with a
  background shell, agent or monitor it started still running. Else done,
  or idle once its parent is idle. A turn ends with a last message, a
  handback or an interrupt. A foreground shell call quiet past its own
  time limit (its timeout, else 2 minutes, at most 10) is over. Once the session's Claude Code process has
  exited, every sub-agent is done. Click opens its transcript
  read-only in a pane right of the parent: the prompt on a
  yellow edge, the assistant's words as markdown, each tool call as
  `● Tool · arg` with its result folded to its first line. It follows the
  file and keeps the newest entry in view. A tab has one transcript pane:
  clicking another sub-agent replaces it, clicking the one shown focuses it.
  The shown sub-agent's row wears the selected plate, and the yellow marker
  while its pane has focus. The pane's foot is a follow-up box on a raised
  ground: `// FOLLOW-UP` and `SENT VIA PERLICA, WHO PASSES IT ON WITH
  SENDMESSAGE`, a one-line input and a round Send button, then the exact `hc
  send` command in mono, wrapped. The sub-agent has no terminal, so the text
  goes to its parent, asking it to forward the text with SendMessage. Send is
  yellow only while it would go and the input has focus; otherwise outlined,
  and dimmed with the reason in place of the command when the parent is
  working, needs input or is gone. Enter sends too. Nothing sends otherwise.
- **Tabs:** click selects (the yellow block slides over left and width,
  300ms), double-click renames, drag reorders, right-click opens the tab menu,
  the wheel switches tabs. Hover grows a 24px, 2px underline from the left.
  Close buttons grow a red disc behind the ×.
- **Ink buttons:** on hover the yellow side tab fades as a yellow ▶ fades in
  and slides from 2px to 9px, and the label slides 5px right (200ms).
- **Footer:** round icon buttons fill signal yellow on hover (a disc grows from
  the centre) and the glyph turns ink.
- **Rows** (spaces, agents, sub-agents): hover wipes a sunken layer in and
  slides the label 4px right; an agent tile's status bar grows from 2px to 4px.
- **Pane header:** click focuses; on focus the yellow tab grows and the
  bracket drops in; on hover a tray opens with split right, split down, zoom
  and close fading in 40ms apart.
- **Status bar:** counts roll like an odometer. The palette hint and the brand
  mark open the command palette.
- **Folded sidebar** (below 160px): numbered 28px squares in the wide face
  (the selected one inverted with a yellow edge, a status bar along each
  bottom) and an agents rail with `»` to unfold.

## Built from

- `layouts/endfield.json`: root row, `titlebar: "none"`, `traffic_lights:
  [12, 16]`, theme `{light: "endfield", dark: "endfield-night"}`, font
  JetBrains Mono 14/500, `ui_font` Geist, `terminal_padding: [14, 10]`,
  `toast: "endfield"` (the mod's `toast` role), `preview: "layouts/endfield.svg"`.
  - `sidebar` (column, 248px, min 44, max 480, chrome): `brand` (64px,
    `window_drag`), `sidebar-lists` (`spaces` weight 1, `agents` weight 1.2,
    min 90 each), `sidebar-footer` (40px).
  - `work` (column, canvas): `tabs` (36px, `window_drag`), `work-body` (row,
    padding 8, gap 8: the `work-stack` stack, whose children are `main` with
    the pane frame and `report` (role `report`), and the hidden `panel`, 368px,
    holding the `panel-body` stack of the shipped `files` and `changes`),
    `status` (44px).
  - Every chrome block is `{mod: "endfield", props: {role}}`. The pane frame:
    background `#191919`, border 1 `input`, focus 1 `solid`, radius 4, gap 8,
    `lone: true`, header `{mod: "endfield", props: {role: "pane"}}`, 34px,
    top, always.
- `themes/endfield.json` and `themes/endfield-night.json`: terminal colours
  plus every panel colour by name.
- `mods/endfield`: one mod in roles, routed by `ROLES` in `main.js` (`boot`,
  `brand`, `footer`, `spaces`, `agents`, `sortmenu`, `card`, `tabs`, `pane`,
  `status`, `toast`, `cutin`, `report`, `dispatch`, `comms`, `transcript`). `kit.js` holds the tables every role reads: `PALETTE` (`paper`
  and `night`), `STATUS` (word, glyph, colour, entrance, rank per agent
  status), `IDENTITY` (who an agent is drawn as) and `MOTION` (every timing).
  An agent with a known model is drawn from its model's tier: `CASTING` in
  `fleet.js` maps the model id to fable, opus, sonnet or haiku, and each tier
  has a pool of operators, strongest first (docs/CASTING.md). Siblings draw
  different operators; a callsign is numbered (`YVONNE·2`) only once its pool
  is spent. An unknown model draws the Endministrator.
  Behaviour is adapted from Herdr's shipped `spaces`, `agents`, `tabs`, `pane`,
  `workspace-chrome`, `workspace-status` and `toast` mods.
- Notifications: the layout's `toast` is the `endfield` mod; Herdr opens it with
  notification props and no role, and `main.js` routes those to `toast`.
- The transcript pane is the `endfield` mod's `transcript` role, props
  `{role: "transcript", path, title, id, parent, via}` (the sub-agent's id,
  its parent's terminal and callsign). It runs `hc send` to the parent
  (`orders.js` `relayOrder`), reads `agents()` for the parent's status, and
  appends to `data/endfield/comms.jsonl`. `panes()` doesn't report a mod
  pane's props, so the shared key `endfield.panes` records which endfield
  pane is Comms and which a transcript (`fleet.js` `paneRole`).
- The session card is the `endfield` mod as an overlay window (`kind:
  "window"`, `frame: "none"`, props `{role: "card", terminal, title, where,
  snap}`). Shared keys: `endfield.card.open` (the one card the agents list
  owns), `endfield.card.hot` (the pointer is on the card),
  `endfield.card.closed` (the overlay id of a card pressed beside, or closed
  by itself; a press on the card's own row is not a dismissal),
  `endfield.identity` (the identity table changed), `endfield.models` (each
  Claude Code agent's model id, for casting), `endfield.archived` (Hides,
  `{life: "address@created", program}`, of archived chats' leftover shells,
  kept out of every roster while no agent runs there).
- A card action's dialog is `{role: "action", terminal, action, snap}`, a
  dialog with `frame: "none"`; the archived list is `{role: "archived"}`.
  The actions are data: `ACTIONS[programKey]` in `orders.js`.
- `herdr` calls: `spaces`, `agents`, `terminals`, `panes`, `focused`,
  `machines`, `layout`, `settings`, `keys`, `updates`, `fonts`, `shared`,
  `setShared`, `setAgentOrder`, `openOverlay`, `closeOverlay`, `run`, `exec`,
  `hc`, `watchFolder`, `readTextFile`, `writeTextFile`, `knownAgents`,
  `fs/promises`.
- Programs it runs: `git` (branch, ahead/behind, changes), `hc` (machine list,
  reconnect, Dispatch and card actions), and `node
  mods/endfield/tools/probe.mjs` (reads transcripts).
- Files it reads outside its folder: Claude Code transcripts under
  `~/.claude/projects/`; optional statusline sidecars in
  `data/endfield/sessions/<session_id>.json`; optional
  `art/operators/manifest.json` and `data/endfield/operators.json`. It writes
  only under `data/endfield/` (the probe's cache and request files, the Comms
  log, `archive.json`).
- Commands: `space.select/move/new`, `tab.new/select/move/rename/close`,
  `pane.focus/split/zoom/close`, `terminal.pin/peek`,
  `layout.resize/show/hide/select`, `app.palette`, `app.settings`, `mod.open`,
  `window.minimize/maximize/close`.
- Shipped overlays reused: `menu`, `new-menu`, `files`, `changes`, `picker`,
  `machine-add`, `worktree`.
- Art: every SVG in `mods/endfield/art/` is original, written by
  `tools/make_art.py`. The wide face is Saira (OFL) instanced to
  `fonts/EndfieldWide.ttf`. No character art ships; an optional art pack is
  built from the person's own images (`art-pack/`).

## Watch out

- Windows registers the font family "Endfield Wide" as "Endfield"; look the
  name up with `fonts()`.
- Theme `background` and `foreground` are the terminals' and also the shipped
  Files and Changes panels'. So the overlay colours (popover, raised,
  foreground) are ink-side in both appearances, and only `chrome`, `canvas`,
  `border` and `input` are paper.
- The focused pane border uses the theme's `solid` (ink on paper, paper at
  night).
- Mods have no colour transition: hover and selection fills are absolute
  layers whose width transitions, measured from each list's `on_size_change`.
- Selection blocks need fixed row heights (spaces 38, machine header 28,
  login guidance 48, notes 30; agents 56, children 50, idle rows 34,
  sub-agent toggle 26, squad header 28; compact 34, 34, 26, 22, 26).
- Flicker is a `.loop("opacity")` that a one-shot timer removes after three
  pulses. No repeating timer drives motion; the repeating timers are for data
  only (30s age labels, git and machine checks, a 3s session poll that runs
  only after `watchFolder` reports a change).
- Herdr docks a mod folder into the shown layout the moment it sees one
  without a `mod.json`: write `mod.json` (`"place": "none"`) first.
- A window overlay's id isn't visible from outside and `overlay.close`
  without one doesn't close it: a card left behind by a hot reload closes
  itself because `endfield.card.open` no longer names it.
- `openOverlay` `at` and mouse `bounds` are logical px; `herdr-app shot` is
  physical.
- Transcripts reach tens of MB and `readTextFile` stops at 1 MiB, so a node
  script reads them, folding each file once and caching the fold and byte
  offset. Claude Code writes an assistant message as one line per content
  block, each repeating the usage, so usage counts once per message id.
  Context used = input + cache creation + cache read of the latest message.
  Without `node` on PATH the session fields read `—`.
- Without a statusline sidecar, a terminal is matched to the newest
  transcript in its folder; two sessions in one folder can't be told apart,
  and the card marks it `≈`.
- The toast's countdown doesn't pause on hover: the host closes a toast at
  its `timeout` whatever the mod draws.
- Hover effects need a pointer; `herdr-app shot` can't show them.
- Assumes Herdr's shipped `files`, `changes`, `menu`, `new-menu`, `picker`,
  `machine-add` and `worktree` mods exist.

## Done when

- `herdr-app check` passes on `mods/endfield`, there is no `*.error` file,
  and `herdr-app status` lists no errors (`node scripts/verify.mjs` runs all of these).
- `herdr-app do layout.switch --name endfield` shows the boot, then every
  region, in light and in dark appearance.
- With two spaces, two tabs, a split and an agent reporting `blocked`, the
  sidebar, tab strip and status bar show it as described; `layout.resize
  {id: "sidebar", px: 44}` shows the rail.
- An agent reaching `done` in a tab you aren't looking at posts a toast with
  a lime edge.
- `pane.split {direction: "right", pane, mod: "endfield", props: {role:
  "transcript", path}}` on a sub-agent transcript shows its entries and grows as the file
  does. Opened from Squads, its foot shows the `hc send` to the parent for
  the typed text, and Send is disabled with a reason while the parent works.
- With `art/operators/` deleted, every surface still draws, with program
  tiles.
