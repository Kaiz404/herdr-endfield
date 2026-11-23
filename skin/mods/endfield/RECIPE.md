# Endfield

A Herdr layout styled as a well-run factory's wayfinding system. The chrome is
warm paper (`#EEEDEC`), terminals sit on ink cards (`#191919`), and one acid
yellow (`#FFFA00`) marks only what is yours right now: the active tab, the
selected space's edge, the focused pane, an agent that needs input, and primary
buttons. Status is always a word plus a glyph. Things move only where work
happens. A night appearance swaps the paper for `#141414` and keeps the rest.

`preview.png` is not included yet. Take one of a demo session before sharing.

## What you see

- **Sidebar, left, 248px**, paper ground with a 1px `#D9D9D9` divider.
  - Brand, 64px: a 30px ink tile with three rising bars and a half-strength
    ramp (click: command palette), "HERDR" in the wide face at 15px, the mono
    micro-label "FIELD OPS · LOCAL · V<version>", and the window's only
    tri-colour bar (28×3px, `#FF1AAC` 5px, `#00FFA2` 5px, `#FFFA00` 18px)
    right-aligned 10px above the bottom hairline.
  - Spaces: header "// Spaces" (Geist 13 semibold), a mono count and a `+`.
    Rows are 38px: `// name` (Geist 13 medium, the `//` muted) over a mono
    10px label (tab count, repo, branch, ↑ahead ↓behind). The selected row is
    inverted (ink, `#F2F2F2` text) with a 2px yellow left edge: one ink block
    for the whole list that slides to the selected row. At the right:
    marching `▶▶` for working, a yellow "Input" pill for blocked, a lime disc
    with an ink ✓ plus an orange diamond for unseen done, nothing for idle.
    Machine groups (once a remote machine exists) get a wide-caps header, a
    hairline running to the right, a connection lamp and a chevron.
  - Agents, 50px rows: header "// Agents", mono `03/05 ACTIVE`, a round sort
    button. A 26px raised tile with the program icon and a 2px status bar on
    its bottom edge; the title (the agent's live title or its tab's name);
    under it the status word plus glyph, the model's short name (`OPUS 5.5`,
    Claude Code only) and a mono `space / tab`; elapsed time top right (a pin
    button on hover) over a 5-block context gauge (5x6px blocks, 2px apart;
    lit blocks red `#C42126` from 75%). Blocked rows carry a 3px hazard tick on
    the left edge. The focused agent's row sits on the list's sliding ink
    block. Sub-agents hang below their parent with right-angle hairlines:
    first Claude Code's own (read from its transcript: title, status, model,
    tool count; every working one, else the newest 4, with `+N` on the parent
    for the rest), then terminals the agent started with `hc run`.
  - Session card, 330px, beside the sidebar while an agent row is hovered:
    white slab, 1px hairline, radius 4, large shadow, a 3px status-colour edge.
    `// Session · T1` and the session's age; the title (15px semibold); a
    status chip and `space / tab`; Model (name and id) | Effort · Mode;
    Context: the % in the wide face at 22px, `used / total`, and 20 blocks
    (10x8, 3px apart, lit in ink, red past 75%); Tool calls | Tokens (▲ last
    turn) | Turns; Flow (`folder ▶▶ N sub-agents`, or the last target) and
    `● Tool · arg · 8s ago`; a mono question block with a yellow left edge
    when blocked; yellow Answer/Focus ▶▶, ghost Peek and Pin, and the
    sub-agent count. Unknown fields (any non-Claude agent) read `—`.
  - Footer, 40px: settings (with an orange diamond when an update is ready),
    add machine, fold sidebar, and the palette key in mono.
- **Tab strip, 36px** (drags the window): tabs run full height, separated by
  hairlines; each shows a mono index `01`, the agent icon, the label and its
  status. The active tab sits on one yellow block that slides between tabs,
  with ink text and a close ×. Then an ink "+ New" button (radius 3, a 3px
  yellow tab on its left edge), the Files and Changes pills (ghost; ink buttons
  like New when open; which show is shared `workspace.panels`, set by the
  welcome), and on Windows 44px min, max/restore and close buttons drawn as
  thin vector glyphs.
- **Panes**, 8px apart on `#E5E5E5`: ink cards, radius 4, 1px `#BDBDBD`
  border, `#191919` when focused. A 30px white header: a 4px tab on its left
  edge (yellow when focused, else hairline grey), a 16px program badge,
  `// title` in Geist 12.5 semibold, a mono `T3 · folder · branch`, the
  status at the right and, focused, an L-bracket in the top-right corner.
- **Status bar, 28px**: ink with a faint 45° grain. `// space / tab`, then the
  counts in the wide face: `02 WORKING`, `01 NEEDS INPUT` (a yellow pill when
  above zero), `03 DONE`; at the right the branch, the machine and the palette
  key.
- **Toasts**: a white slab with a 3px edge and a round glyph in the level's
  colour (an agent's own status wins: done lime, blocked yellow), title,
  body, `// space` top right, a yellow "Open ▶▶" pill and a 2px countdown.
- Terminals: JetBrains Mono 14 at weight 500 on `#191919`, foreground
  `#E6E6E1`, yellow cursor, an original 16-colour set tuned to the status hues.

## How it behaves

- Working: `▶▶` steps through (300ms a beat) in flow blue, and a 1px blue
  segment rides the agent row's floor. Blocked: yellow "Needs input" pill, the
  hazard tick breathes (opacity 0.55 to 1, 1400ms), and the row flickers once
  when it enters the state. Done: lime disc pops from 0 and the row flickers
  once; it turns idle when looked at. Idle: `zZ Idle` in muted text, still.
- Start: an ink screen over faint contour lines, a 10px yellow gauge fills the
  left edge, a yellow wipe crosses, then the screen fades (1.5s, click skips).
  Then the regions flicker in 200ms apart: brand, spaces and tabs, agents and
  panes, status. The mark's bars rise one after another and the tri-colour
  bar wipes in.
- Spaces: click selects (the ink fill wipes in, the yellow edge grows down);
  drag reorders within a machine (a 2px line shows where); right-click opens
  the space menu; the machine header folds its group. Hover wipes a sunken
  layer in.
- Agents: click focuses the pane (the ink block slides there, 300ms); the tile folds sub-agents; hover shows pin;
  a sub-agent without a pane opens as a peek. The sort button opens Priority
  or Grouped by space. `alt-up` / `alt-down` follow the list's order.
- Tabs: click selects (the yellow block slides there, 300ms, over left and
  width), double-click renames, drag reorders, right-click opens the tab menu,
  the wheel switches tabs. Hover grows a 24px, 2px underline from the left
  (14px in, 5px up). Close buttons grow a red disc behind the ×.
- Ink buttons: on hover the yellow side tab fades as a yellow ▶ fades in and
  slides from 2px to 9px, and the label slides 5px right (200ms).
- Footer: the round icon buttons fill signal yellow on hover (a disc grows
  from the centre) and the glyph turns ink.
- Rows (spaces, agents, sub-agents): hover wipes a sunken layer in and slides
  the label 4px right; an agent tile's status bar grows from 2px to 4px.
- Session card: after 250ms on an agent row it fades in and slides 16px right
  (300ms) and the context blocks light one after another (18ms apart). Moving
  onto the card keeps it; leaving both closes it after 160ms. Answer/Focus
  runs `agent.focus`, Peek `terminal.peek`, Pin `terminal.pin`.
- A Claude Code sub-agent row: working while its transcript was written in
  the last 20s and its last step is a tool call or not a final answer; else
  done, or idle once its parent is idle. Click (once per second at most) opens
  its transcript in a read-only pane right of the parent
  (`mods/endfield-transcript`): the prompt on a yellow edge, the assistant's
  words as markdown, each tool call as `● Tool · arg` with its result folded
  to its first line; it follows the file and keeps the newest entry in view.
- Pane header: click focuses; on focus the yellow tab grows and the bracket
  drops in; on hover a tray opens with split right, split down, zoom and close
  fading in 40ms apart.
- Status bar counts roll like an odometer. Clicking the palette hint or the
  brand mark opens the command palette.
- Folding the sidebar below 160px turns the lists into a rail: numbered 28px
  squares in the wide face (the selected one inverted with a yellow edge, a
  status bar along each bottom) and an agents rail with `»` to unfold.

## Built from

- `layouts/endfield.json`: root row, `titlebar: none`, theme
  `{light: "endfield", dark: "endfield-night"}`, `font` JetBrains Mono 14/500,
  `ui_font` Geist, `toast: "endfield-toast"`, terminal padding `[8, 10]`.
  `sidebar` (column, 248px, min 44, max 480) holds `brand` (64px, window drag),
  `sidebar-lists` (`spaces` weight 1, `agents` weight 1.2) and
  `sidebar-footer` (40px). `work` holds `tabs` (36px, window drag), `work-body`
  (`main` with the pane frame, and the hidden `panel` → `panel-body` stack of
  the shipped `files` and `changes`), and `status` (28px). Every chrome block
  is `{mod: "endfield", props: {role}}`; the pane header is
  `{mod: "endfield", props: {role: "pane"}}`, 30px, top, always.
- `mods/endfield`: `kit.js` holds the palette table and the status table every
  role reads. Behaviour is ported from the shipped `spaces`, `agents`, `tabs`,
  `pane`, `workspace-chrome`, `workspace-status` and `toast` mods.
- `herdr` calls: `spaces`, `agents`, `terminals`, `panes`, `focused`,
  `machines`, `layout`, `settings`, `keys`, `updates`, `fonts`, `shared`,
  `setShared`, `setAgentOrder`, `openOverlay`, `closeOverlay`, `run`, `exec`
  (git; `node mods/endfield/tools/probe.mjs` for transcripts), `hc` (machine
  list, reconnect), `watchFolder` (repos, `~/.claude/projects`, the sidecar
  folder), `readTextFile` (sidecars), `fs/promises` (the probe's request file).
- Data read outside the mod: Claude Code transcripts under
  `~/.claude/projects/` and a statusline's sidecars in
  `data/endfield/sessions/<session_id>.json` (`{session_id, terminal, cwd,
  transcript_path, model:{id, display_name}, context:{used, total, pct},
  updated_at}`). Without a sidecar a terminal is matched to the newest
  transcript in its folder's project, which is approximate (the card marks
  it ≈).
- `mods/endfield-transcript`: the transcript pane, props `{path, title}`.
- The session card is the `endfield` mod as an overlay window (`kind:
  "window"`, `frame: "none"`, props `{role: "card", terminal, title, where,
  snap}`). Shared keys: `endfield.card.open` (written by the agents list: the
  one card it owns; any other card closes itself) and `endfield.card.hot`
  (written by the card: the pointer is on it).
- Commands: `space.select/move/new`, `tab.select/move/rename/close`,
  `pane.focus/split/zoom/close`, `terminal.pin/peek`, `layout.resize/show/hide/select`,
  `app.palette`, `app.settings`, `mod.open`, `window.minimize/maximize/close`.
- Shipped overlays reused: `menu`, `new-menu`, `files`, `changes`, `picker`,
  `machine-add`, `worktree`.
- Art: `art/*.svg` from `tools/make_art.py`; the font from Saira (OFL).

## Watch out

- Windows registers the font family "Endfield Wide" as "Endfield"; look the
  name up with `fonts()`.
- Theme `background` is the terminals' background and the shipped Files and
  Changes panels' background; theme `foreground` is their text. So the theme's
  overlay colours (popover, raised, foreground) are ink-side in both
  appearances, and only `chrome`, `canvas`, `border` and `input` are paper.
- The focused pane border uses the theme's `solid` (ink on paper, paper at night).
- There is no colour transition: hover and selection fills are absolute layers
  whose width transitions, measured from each list's `on_size_change`.
- `.loop` goes there and back, so the working conveyor travels back and forth.
- Flicker is a `.loop("opacity")` that a one-shot timer removes after three
  pulses; no repeating timer drives any motion.
- The toast's slide-out runs only when it is clicked; the host's timeout
  closes it without one.
- Hover effects need a pointer; `herdr-app shot` can't show them.
- Selection blocks need fixed row heights (spaces 38, machine header 28,
  login guidance 48, notes 30; agents 50, sub-agents 40, group header 28).
- `openOverlay` `at` and mouse `bounds` are logical px; `herdr-app shot` is
  physical (1.25x on the build machine).
- A window overlay's id isn't visible from outside and `overlay.close`
  without one doesn't close it: a card left behind by a hot reload closes
  itself because `endfield.card.open` no longer names it.
- Herdr docks a new mod folder into the shown layout the moment it sees one
  without a `mod.json`: write `mod.json` (`"place": "none"`) first.
- Transcripts reach tens of MB and `readTextFile` stops at 1 MiB, so a node
  script reads them, folding each file once and caching the fold and byte
  offset. Claude Code writes an assistant message as one line per content
  block, each repeating the usage, so usage counts once per message id.
  Context used = input + cache creation + cache read of the latest message;
  the window is 1M when the id says `[1m]` or the context is already past
  200K. Bulk lines (`api-request*`, `data-flow-records`) are skipped before
  parsing; some are megabytes.
- The toast's countdown doesn't pause on hover: the host closes a toast at
  its `timeout` whatever the mod draws, so a paused bar would lie.

## Done when

- `herdr-app check mods/endfield` and `herdr-app check mods/endfield-toast` pass,
  there is no `*.error` file and `herdr-app status` lists no errors.
- `herdr-app do layout.switch --name endfield` shows the boot, then every
  region, in light and in dark appearance.
- With two spaces, two tabs, a split and an agent reporting `blocked`, the
  sidebar, tab strip and status bar show it as described; `layout.resize
  {id: "sidebar", px: 44}` shows the rail.
- An agent reaching `done` in a tab you aren't looking at posts a toast with a
  lime edge.
- `grep -n "timer.every" mods/endfield` lists only the data timers.
- `herdr-app check mods/endfield-transcript` passes, and `pane.split
  {direction: "right", pane, mod: "endfield-transcript", props: {path}}` on a
  sub-agent transcript shows its entries and grows as the file does.
- `node mods/endfield/tools/probe.mjs <req.json>` with `{"cmd": "sessions",
  "cache": "<file>", "targets": [{"terminal": "t1", "cwd": "<folder>"}]}`
  prints a session whose `used` matches the Claude Code statusline's context.
