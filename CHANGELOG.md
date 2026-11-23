# Changelog

## Unreleased

### New

- **Home base.** New spaces on this computer open in a workspace folder instead of your home folder, so an agent you start there treats that folder as its project, not your whole home folder. The default is `Projects` in your home folder if it exists. Set `homeBase` in `data/endfield/settings.json` to choose another folder. If that folder is missing, spaces open in your home folder and the sidebar says so. Spaces on other machines still open in that machine's home. The Spaces header shows the base, and the key command `endfield.newSpace` opens a space there. See [Home base](docs/SETUP.md#9-choose-where-new-spaces-open).

### Changed

- **One transcript pane per tab.** Clicking a Claude Code sub-agent in Squads opens its transcript right of its parent, as before. Clicking another sub-agent now replaces that pane instead of splitting the tab again, and clicking the one shown focuses it. The shown sub-agent's row is marked as selected.

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
