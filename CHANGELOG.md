# Changelog

## Unreleased

### Changed

- **One mod.** Notifications are now the `endfield` mod's `toast` role; `mods/endfield-toast` is gone (`sync.mjs` and `install.mjs` remove it from your Herdr home).
- **Plates snap, the yellow marker travels.** A selection's ink plate and its text change in one frame; only the 2px yellow edge (and the tab strip's 3px marker) slides. Regions build in with a fade instead of flickering, and a blocked row's hazard tick holds still.

### New

- **Squads.** The agents list is now squads: agents grouped per space, numbered like their space, each a party chip (the operator's portrait, a yellow ring when it needs input, a class badge for the program) with its callsign over its task. Children hang under their parent with right-angle connectors across vendors. Squads fold to a stack of their operators. From 12 agents the sidebar goes compact, spaces become numbered squares, and agents that need input are pinned above every squad. Status words follow the game: Generating, Needs input, Claimed, Idle.
- **Needs input, as a skill caption.** An agent that needs input while you look elsewhere gets a cut-in: its operator's portrait, a yellow block that sweeps across its callsign, the question from its screen, Answer and Later. If its pane already has focus, there is no toast: the pane's name plate pulses yellow instead. Finished agents get a Claimed slip with a one-beat flash.
- **Name-plate pane headers.** Wide-caps titles, the program's square tile, and the operator's chip on agent panes.
- **Original sounds.** A needs-input alert, a Claimed chime and quiet UI ticks, synthesised for the skin. They never double Herdr's own sounds; see the mod README.
- **Session panel, HUD footer, boot.** Hovering a squad row opens a session panel laid out like an AIC machine panel (bust portrait, input, state and output cells, context reserves, comms, the current formula). The status bar is now a 44px HUD with odometers and a Needs-input block. The start screen types HERDR// on over range rings. Actions are game pills with a knob that nudges on hover; geometric texture (dots, rings, crosses, rulers, barcodes) frames empty space and titles, never text.
- **Report.** One screen for every squad, opened from the Report pill or "Report ▶" in the pinned strip: readouts, squads as formations, sortable columns, output over 10 minutes, rate, reserves, turn and status, scrolling past 30 agents.
- **Dispatch and Comms.** Send a task to a running agent (`hc send`) or start a new one in a squad (`hc run`), from a dialog that shows the exact command before it runs it. Every dispatch is logged; the Comms pane shows that log and the `<hc from>` reports agents receive. The mod README records what hc offers and what was verified.
- **Demo fleet.** `node scripts/demo-fleet.mjs up --agents 30` fills Herdr with stand-in agents (Node processes that only report a status) for screenshots and checks at scale; `down` removes them.

- **First public layout.** The Endfield layout, its light and night themes, the `endfield`, `endfield-toast` and `endfield-transcript` mods, and a settings preview.
- **Install and uninstall scripts.** `node scripts/install.mjs` copies the skin into your Herdr home, backs up any Endfield file it replaces, and is safe to rerun. `node scripts/uninstall.mjs` removes it and restores the backups.
- **Opt-in extras.** A Claude Code statusline that also feeds the skin exact session data, and a PowerShell prompt.
- **Bring-your-own art pack.** `art-pack/build_pack.py` turns your own images into operator avatars and a manifest. The skin reads it; on-screen portraits are on the roadmap.
- **Official operator art, fetched on your machine.** `node scripts/fetch-operators.mjs --accept` downloads eight official operator renders, checks each against a pinned sha256, and builds the art pack into your Herdr home. The repo itself contains only the catalogue (`art-pack/operators.json`): URLs, hashes and crop settings. `--list`, `--only` and `--dry-run`; reruns do nothing.
- **Checks.** `node scripts/verify.mjs` checks the mods against a running Herdr; `--static` runs in CI and also rejects official art and personal data. Official CDN URLs are allowed only in `art-pack/operators.json`, and every URL there must be on the official site or its CDN.
