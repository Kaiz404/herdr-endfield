# Changelog

## Unreleased

### New

- **Home base.** New spaces on this computer open in a workspace folder instead of your home folder, so an agent you start there treats that folder as its project, not your whole home folder. The default is `Projects` in your home folder if it exists. Set `homeBase` in `data/endfield/settings.json` to choose another folder. If that folder is missing, spaces open in your home folder and the sidebar says so. Spaces on other machines still open in that machine's home. The Spaces header shows the base, and the key command `endfield.newSpace` opens a space there. See [Home base](docs/SETUP.md#9-choose-where-new-spaces-open).
- **The whole roster.** The operator catalogue grows from 8 to all 36 playable operators, each from the official site with its sha256. `node scripts/fetch-operators.mjs --accept` fetches the new ones (about 30 MB in all) and skips the ones you have.
- **Agents are cast by model.** A stronger model draws a stronger operator: Fable draws from the top 6★ meta (Arcane, Argent Flow, Mi Fu and more), Opus from high-tier 6★ (Laevatain, Yvonne, Ardelia and more), Sonnet from mid-tier 5★, and Haiku from the 4★ operators. GPT, Gemini, Grok, Cursor Composer, DeepSeek, Kimi, Qwen, GLM, MiniMax, Mistral and small local models map to the same four tiers. Claude Code sub-agents draw different operators from each other, so five Sonnet sub-agents are five different operators, not `ARDELIA·2` to `ARDELIA·5`. A callsign gets a number only when every operator in the pool is taken. Every agent keeps its operator when another agent closes or another agent's model arrives; only a change to its own model tier draws it again. A model the skin does not recognise draws the Endministrator. See [Casting](docs/CASTING.md).

- **Follow up with a sub-agent.** The transcript pane of a Claude Code sub-agent has a box at its foot. Type a follow-up and click **Send** or press Enter. A Claude Code sub-agent has no terminal to type into, so the box sends your text to its parent agent and asks the parent to pass it on with its SendMessage tool. The pane says so (**Sent via PERLICA**) and shows the exact `hc send` command before you send. It sends only when the parent is waiting for you (idle or finished). While the parent is working or needs input, **Send** is disabled and the pane says why. Each follow-up appears in Comms. Agents started with `hc` have their own terminal, so you type in their pane or use Dispatch, as before.

- **Usage limits in the HUD footer.** The footer shows your Claude 5-hour and weekly limits, each as two short rows: the percent used on top (`5-HOUR 54% USED`), a small bar and the time to reset below (`RESETS 1H 40M`). From 80% a window turns red with a `▲`. A window that has reset since Claude Code last reported it reads `RESET` over an empty bar, not its old numbers. In a narrow window the bars go first, then the weekly window's `USED`. The numbers come from the [Claude Code statusline](extras/claude-statusline/README.md), so copy the updated `statusline-endfield.sh` to `~/.claude/` again to get them. Without it the section is not shown.

- **Chat actions in the session panel.** A new **Chat** row shows the agent's model, effort and mode, and has one button per action: Rename, Plan, Next mode, Model, Effort and Archive for Claude Code; Rename, Model and Archive for Codex; Rename, Plan and Archive for Cursor. Each button opens a dialog that shows the exact `hc` command, what it needs and what it changes, and runs it only when you click **Confirm**. Anything typed into the agent goes with `hc send --if idle`, so a working, blocked or finished agent is never typed into; the button says why it is dimmed. `/model` and `/effort` also become your Claude Code defaults, and the dialog says so. Afterwards the dialog shows the new model, effort or mode when the skin can read it. See [Change a chat](docs/SETUP.md#change-a-chat-from-its-session-panel).
- **Arrange squads.** Drag a squad's header in Squads to reorder the squads. A line shows where it lands. Double-click a header to rename the squad in place, and press Enter to save. Right-click a header for **Rename squad**, **Move up** and **Move down**. A squad is a Herdr space, so the new order and name are Herdr's (`space.move`, `space.rename`) and the Spaces list shows them too. Right-click an agent row for **Rename**, **Pin to the top** and **Archive**. Rename and Archive open the session panel's dialogs, so nothing runs until you confirm. Squads can't move a chat to another squad, because Herdr has no command that moves a tab to another space. See [Arrange squads](docs/SETUP.md#arrange-squads-and-chats-in-squads).
- **Archive and Resume.** **Archive** ends a chat with `/exit` (`/quit` for Codex and Cursor), keeps its transcript, takes it out of Squads and records it. **Report > Archived** lists those chats; **Resume** opens a new tab in the chat's folder running `claude --resume <session id>`. The [statusline](extras/claude-statusline/README.md) now also records the effort level, so copy `statusline-endfield.sh` to `~/.claude/` again to see a changed effort at once.

### Changed

- **The session panel shows context once.** The **Output** number, which counted every token the session ever processed, is gone. **Context** shows the input tokens of the last request, which is what the session carries now, with its 20-block gauge. The panel's chip names the tab (or the space) instead of the terminal address, and the third cell counts tool calls.
- **The transcript pane is part of the `endfield` mod.** It used to be a separate mod, `endfield-transcript`, with its own copies of the Dispatch rules. `install.mjs`, `sync.mjs` and `uninstall.mjs` remove the old `mods/endfield-transcript` folder. A transcript pane left open from before the update can show an error. Click a sub-agent in Squads to replace it, or close it.
- **Operator overrides start empty.** `data/endfield/operators.json` used to be seeded with one operator per program, which would hide casting by model. The seed is now empty. `node scripts/install.mjs` replaces your copy if you never edited it, and keeps it if you did. Your own `programs` and `terminals` entries still win over the model. With no known model, Codex now defaults to Laevatain instead of the Endministrator.
- **Waiting sub-agents stay in Squads.** A Claude Code sub-agent that waits on background work it started (a shell, an agent or a monitor), or sits in a long tool call, used to read **Finished** after 20 seconds without output, and Squads hid it. It now reads **Waiting**, with two still bars in place of the moving triangles, and stays under its parent like a Generating one. A sub-agent reads Finished only when its turn has ended and nothing it started still runs. Squads reads this from the transcript and from whether the session's Claude Code process still runs, not from how long ago the sub-agent wrote.
- **One transcript pane per tab.** Clicking a Claude Code sub-agent in Squads opens its transcript right of its parent, as before. Clicking another sub-agent now replaces that pane instead of splitting the tab again, and clicking the one shown focuses it. The shown sub-agent's row is marked as selected.
- **Claude Code sub-agents.** Squads used to show at most four sub-agents under a parent, picked in no useful order. Now it shows every working sub-agent, newest first. A row under them, **+N earlier**, lists the finished ones too, newest first. **Show less** folds them away again. Each parent remembers its choice until Herdr reloads the skin. A long list scrolls.
- **Squads rows say how a run is going.** Each agent and each Claude Code sub-agent keeps two lines. The first line has the callsign, the model, and the effort level in a dimmer grey, for example `OPUS 5.5  MED`. At its right are a clock with how long the run has gone, then the status: `◷ 43m  ▶▶ Generating`. A run under a minute counts seconds (`42s`), then `27m`, `1h07`, `12h` and `3d`. The second line has the task, with an 8-block context gauge at its right that runs red past 75%. Hover the gauge for the numbers, such as `157K / 1M · 16%`. The time since the last state change, the terminal address (`T3H`) and the tool count are gone from the row. The session panel still shows the address and tool count.
- **Claimed is now Finished.** The status word for an agent that finished its turn reads **Finished** in Squads, the Report, the HUD footer (`01 FINISHED`) and the slip a finished agent gets. The status words are now Generating, Needs input, Finished, Idle and Error. The sound file keeps its name, `claimed.mp3`, so a `sounds.done` setting that points at it still works.
- **Idle agents take one line.** An idle agent's row folds to its callsign, task and **Idle**, so the agents that are working get the room. Generating, Needs input, Finished and Error rows keep two lines.
- **One motion per working agent.** A generating row in Squads no longer has a blue segment sliding along its floor. The status glyph still animates, so a sidebar full of working agents is calmer.
- **Dispatch's Only if idle and finished agents.** With **Only if idle**, a target that finished its turn used to read "Idle. Delivered now.", and then hc refused the send. A finished agent waits at its prompt, so it now gets a plain send, and the preview says it finished its turn. While the target is generating or stopped on an error, **Only if idle** now disables **Dispatch** and says why, instead of letting hc refuse. The sub-agent follow-up box uses the same rule.

### Fixed

- **The session panel no longer stays open after you move on.** It closes when you click anywhere outside it, such as on Files, Comms or Report, and when you fold the sidebar. Clicking the agent's own row keeps its panel. One case is not fixed: if the pointer leaves the row or the panel and Herdr does not report it, the panel stays until your next click.

## 0.2.0

The game-UI release. Agents are now drawn as Arknights: Endfield operators in squads, and you can send them work from the skin. Follow [docs/SETUP.md](docs/SETUP.md) to install or update.

### New

- **Squads.** The sidebar groups agents by space, one numbered squad per space. Each agent is a party chip: the operator's round portrait, a yellow ring when it needs input, and a badge for its program (`C` Claude Code, `X` Codex, `Cu` Cursor, `O` OpenCode, `G` Gemini). Each has a callsign such as `PERLICA` over its task. Sub-agents hang under their parent, whatever program they run. Click a squad header to fold it to a stack of portraits. Status words follow the game: Generating, Needs input, Claimed and Idle.
- **Operator portraits on screen.** With the art pack, the portraits show in the sidebar, the pane name plates, the session panel, Dispatch, Comms, the Report and the needs-input cut-in. Without it, every surface shows the program's tile, as before.
- **Many agents.** From 12 agents the sidebar goes compact, spaces become numbered squares, and agents that need input are pinned above every squad. The list scrolls and says how many agents are below.
- **Needs-input cut-in.** When an agent needs you and you are looking elsewhere, a banner shows its portrait, its callsign, the question from its screen, and **Answer** and **Later**. If its pane already has focus, the pane's name plate flashes yellow instead. A finished agent gets a short **Claimed** slip.
- **Session panel.** Hover an agent to see its bust portrait, folder, model, state, elapsed time, turn, tokens, context, recent messages and its last action, with Peek, Pin, Dispatch and Answer.
- **Report.** The **Report** pill opens one screen with every squad: totals, then one row per agent with output over the last 10 minutes, token rate, context, turn and status. Click a column heading to sort.
- **Dispatch.** Send a task to a running agent, or start a new agent in a squad, from a dialog. The dialog shows the exact `hc` command before you click **Dispatch**. It runs that command once, and only when you click.
- **Comms.** The **Comms** pill opens a pane with what you dispatched and the messages agents sent each other through `hc`. Messages read from an agent's screen are marked Unverified.
- **Name-plate pane headers, HUD footer and boot.** Pane headers carry the program tile, the operator chip and the title in wide capitals. The status bar is a 44px HUD with live counts and a **Needs input** block. Herdr starts with a short type-on screen.
- **Original sounds.** A needs-input alert, a Claimed chime and quiet clicks, made for the skin. They never play on top of Herdr's own sounds.
- **Setup guide.** [docs/SETUP.md](docs/SETUP.md) goes from a fresh machine to the full setup, with checks, undo steps and troubleshooting.
- **Demo fleet.** `node scripts/demo-fleet.mjs up --agents 30` fills Herdr with stand-in agents to try the layout. `down` removes them.
- **Tests.** The roster, Dispatch and Comms rules run under `node --test`, in CI and in `verify.mjs`.

### Changed

- **One mod.** Notifications are now part of the `endfield` mod. The installer removes the old `mods/endfield-toast` folder.
- **Calmer motion.** A selection's plate and text change in one frame, and only the yellow marker slides. Idle agents and an idle fleet draw nothing that moves.
- **The art pack has six files per operator.** The new `bust-480.png` is the session panel's portrait. If you fetched the pack before, run `node scripts/fetch-operators.mjs --accept` again to add it.

### Fixed

- Sub-agent callsigns stay small. A long Claude Code session showed `ARDELIA·30`. Each sub-agent now takes the lowest number that no other shown sub-agent holds, and keeps it while it is shown.
- A pack fetched with `fetch-operators.mjs` showed no bust in the session panel.
- A Dispatch order that `hc` accepted is never sent twice.
- A callsign never moves from one agent to another when agents come and go.

## 0.1.0

First publication. Not tagged.

### New

- **First public layout.** The Endfield layout, its light and night themes, the `endfield`, `endfield-toast` and `endfield-transcript` mods, and a settings preview.
- **Install and uninstall scripts.** `node scripts/install.mjs` copies the skin into your Herdr home, backs up any Endfield file it replaces, and is safe to rerun. `node scripts/uninstall.mjs` removes it and restores the backups.
- **Opt-in extras.** A Claude Code statusline that also feeds the skin exact session data, and a PowerShell prompt.
- **Bring-your-own art pack.** `art-pack/build_pack.py` turns your own images into operator avatars and a manifest.
- **Official operator art, fetched on your machine.** `node scripts/fetch-operators.mjs --accept` downloads eight official operator renders, checks each against a pinned sha256, and builds the art pack into your Herdr home. The repo itself contains only the catalogue (`art-pack/operators.json`): URLs, hashes and crop settings.
- **Checks.** `node scripts/verify.mjs` checks the mods against a running Herdr. `--static` runs in CI and also rejects official art and personal data.
